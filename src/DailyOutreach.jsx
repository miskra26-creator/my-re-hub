/**
 * DailyOutreach.jsx — Monica's "I need leads RIGHT NOW" tool.
 *
 * What it does:
 *   1. AI-personalized message per contact (Gemini reads their notes/status/
 *      history, writes a unique opener) — editable inline before sending
 *   2. One-click SMS via your phone's native Messages app — free, opens
 *      prefilled with the personalized text + your video link
 *   3. Smart priority ranking — surfaces who's MOST overdue × MOST likely
 *      to convert
 *   4. Multi-channel from one screen — text / email / call / skip
 *   5. Progress tracking — daily streak, "12 of 20 contacted today"
 *
 * Goal: 20 outreach actions in 15 minutes → real conversations tomorrow.
 *
 * Storage:
 *   - Reads `leads` from useLS (the master lead list)
 *   - Reads `activities_<leadId>` to compute last contact date (any source)
 *   - Writes outreach actions to `activities_<leadId>` + a daily `outreach_log`
 *   - Caches AI-personalized messages in `outreach_ai_drafts` (avoid re-prompting)
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useLS } from './cloudHooks';
import {
  Phone, Mail, MessageSquare, Check, Sparkles, RefreshCw, X,
  TrendingUp, Clock, User as UserIcon, Heart, Zap, Trophy,
} from 'lucide-react';

// ── Status priority for ranking — Past Clients first (highest LTV per touch)
const STATUS_PRIORITY = {
  'Past Client': 100,
  'Closed': 95,
  'Hot Prospect': 90,
  'Pending': 85,
  'Buyer': 70,
  'Seller': 70,
  'Buyer & Seller': 75,
  'Contact': 60,
  'Nurture 3-6 Months': 55,
  'Nurture 1+ Year': 45,
  'Buy/Sell Nurture': 50,
  'Casually Browsing': 30,
  'Trash': -100, // excluded entirely
};

// Compute the last-contact date from multiple signals — manual activities,
// FUB lastCommunication, lead createdAt as fallback.
function getLastContactDate(lead) {
  try {
    const activities = JSON.parse(localStorage.getItem(`activities_${lead.id}`) || '[]');
    const latestActivity = activities[0]?.createdAt;
    const fubLast = lead.meta?.fubLastCommunication?.created || lead.meta?.fubLastActivity?.created;
    const candidates = [latestActivity, fubLast, lead.updatedAt, lead.createdAt].filter(Boolean);
    if (candidates.length === 0) return null;
    return Math.max(...candidates.map(d => new Date(d).getTime()));
  } catch { return null; }
}

// Days since last contact — 999 if never contacted
function daysSince(ts) {
  if (!ts) return 999;
  return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
}

// Smart priority score: how badly does this contact need outreach?
function priorityScore(lead) {
  const status = lead.status || 'Contact';
  if (status === 'Trash') return -1;
  const statusScore = STATUS_PRIORITY[status] || 50;
  const last = getLastContactDate(lead);
  const dsl = daysSince(last);
  // Past clients overdue 90+ days = max priority
  // Recently-touched contacts deprioritized (don't spam)
  let staleness = 0;
  if (dsl > 365) staleness = 80; // critical
  else if (dsl > 180) staleness = 65;
  else if (dsl > 90) staleness = 50;
  else if (dsl > 30) staleness = 25;
  else staleness = 0; // touched recently, skip
  // Has contact info? Required.
  const reachable = (lead.phone || lead.email) ? 10 : -100;
  return statusScore + staleness + reachable;
}

// Generate a personalized text using contact details — falls back to template
// if Gemini isn't available. Each scenario gets a different opener.
function fallbackTemplate(lead) {
  const first = (lead.name || 'there').split(' ')[0];
  const status = lead.status || '';
  const area = lead.area || lead.address?.split(',')[0] || '';
  if (status.includes('Past Client') || status === 'Closed') {
    return `Hey ${first}, it's Monica. Was just thinking about you — how's the house treating you${area ? ` in ${area}` : ''}? Anything on your mind lately, or anyone you know thinking about buying/selling? Always good to catch up.`;
  }
  if (status.includes('Hot') || status === 'Pending') {
    return `Hi ${first}, Monica here. Wanted to check in — where are you at on your home search${area ? ` in ${area}` : ''}? Market's been interesting lately. Want to grab 10 min to catch up?`;
  }
  if (status.includes('Nurture') || status === 'Casually Browsing') {
    return `Hey ${first}, Monica from RE/MAX Classic. It's been a minute — are you still casually looking${area ? ` in ${area}` : ''}? I've seen some interesting movement in the market and thought of you. No pressure, just keeping you in the loop.`;
  }
  return `Hi ${first}, Monica here. Was thinking about you — wanted to see how things are going and if there's anything real-estate-wise I can help with. Always here.`;
}

export default function DailyOutreach({ toast, setPage }) {
  const [leads] = useLS('leads', []);
  const [aiDrafts, setAiDrafts] = useLS('outreach_ai_drafts', {}); // {leadId: {message, generatedAt}}
  const [editedMessages, setEditedMessages] = useLS('outreach_edited_messages', {}); // {leadId: edited text} — overrides AI/template
  const [outreachLog, setOutreachLog] = useLS('outreach_log', []); // [{leadId, channel, ts}]
  const [generatingFor, setGeneratingFor] = useState(null); // leadId currently being AI-personalized
  // Video link — record ONCE in Loom (or anywhere), paste here, every outgoing
  // text auto-appends "Quick video for you: [link]" so all 20 contacts get
  // the video without you copy/pasting per send.
  const [videoLink, setVideoLink] = useLS('outreach_video_link', '');
  const [videoCaption, setVideoCaption] = useLS('outreach_video_caption', 'Recorded a quick video for you 👉');
  const [contactedToday, setContactedToday] = useState(() => {
    // count today's outreach from the log
    const today = new Date().toISOString().slice(0, 10);
    try {
      const log = JSON.parse(localStorage.getItem('outreach_log') || '[]');
      return log.filter(e => (e.ts || '').slice(0, 10) === today).length;
    } catch { return 0; }
  });

  // Build today's prioritized list — top 30 contacts most due for outreach.
  // Lowered threshold from 50 → 0 so anyone reachable shows up (was filtering
  // too aggressively when leads had minimal status/data from FUB sync).
  // Also tracks counts so empty state can explain what was filtered out.
  const { ranked, debugCounts, todayContacted } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayLog = outreachLog.filter(e => (e.ts || '').slice(0, 10) === today);
    const alreadyContacted = new Set(todayLog.map(e => e.leadId));
    const contactedDetails = todayLog
      .map(e => ({ ...e, lead: leads.find(l => l.id === e.leadId) }))
      .filter(e => e.lead);

    const debug = { total: leads.length, trash: 0, noContact: 0, contactedToday: 0 };
    const withPriority = [];
    for (const l of leads) {
      if (l.status === 'Trash') { debug.trash++; continue; }
      if (alreadyContacted.has(l.id)) { debug.contactedToday++; continue; }
      if (!l.phone && !l.email) { debug.noContact++; continue; }
      withPriority.push({
        ...l,
        _priority: priorityScore(l),
        _lastContact: getLastContactDate(l),
        _daysSince: daysSince(getLastContactDate(l)),
      });
    }
    debug.eligible = withPriority.length;

    return {
      ranked: withPriority.sort((a, b) => b._priority - a._priority).slice(0, 30),
      debugCounts: debug,
      todayContacted: contactedDetails,
    };
  }, [leads, outreachLog]);

  // Priority: user's manual edits > AI-personalized > fallback template.
  // The video link auto-appends only when sending (in sendSMS) so the editable
  // textarea shows the BASE message and the preview line below shows what
  // actually goes out.
  const getBaseMessage = (lead) => {
    if (editedMessages[lead.id]) return editedMessages[lead.id];
    return aiDrafts[lead.id]?.message || fallbackTemplate(lead);
  };
  const getFullMessage = (lead) => {
    const base = getBaseMessage(lead);
    if (videoLink && videoLink.trim()) {
      return `${base}\n\n${videoCaption} ${videoLink.trim()}`;
    }
    return base;
  };
  // Backward-compat alias for any leftover refs
  const getMessage = getFullMessage;
  // Save the user's manual edit (overrides AI/template until they clear it)
  const editMessage = (leadId, text) => {
    setEditedMessages(p => ({ ...p, [leadId]: text }));
  };
  const resetEdit = (leadId) => {
    setEditedMessages(p => {
      const next = { ...p };
      delete next[leadId];
      return next;
    });
    toast?.info?.('Reset to AI-generated message');
  };

  // Call Gemini to either personalize fresh OR improve the user's existing edits.
  // Smart routing: if she's edited the message, we IMPROVE her version (preserves
  // her voice). If it's the default template, we PERSONALIZE from scratch.
  const personalizeWithAI = async (lead) => {
    setGeneratingFor(lead.id);
    try {
      const hasUserEdits = !!editedMessages[lead.id];
      const currentText = getBaseMessage(lead);

      // Pull recent activities for context
      let recentActivity = '';
      try {
        const acts = JSON.parse(localStorage.getItem(`activities_${lead.id}`) || '[]');
        recentActivity = acts.slice(0, 3).map(a => `${a.type || 'note'}: ${a.note || a.subject || ''}`).join('\n');
      } catch {}

      const contactContext = `CONTACT DETAILS:
- Name: ${lead.name}
- Status: ${lead.status || 'Contact'}
- Area/interest: ${lead.area || lead.address || 'Metro Detroit'}
- Type: ${lead.type || 'Buyer'}
- Days since last contact: ${lead._daysSince || 'unknown'}
- Tags: ${(lead.tags || []).join(', ') || 'none'}
- Notes: ${(lead.notes || '').slice(0, 200) || 'none'}
- Recent activity:
${recentActivity || 'none'}`;

      const prompt = hasUserEdits
        ? `You are sharpening a check-in text written by Monica Iskra (RE/MAX Classic, Metro Detroit luxury agent). She wrote a draft — refine it to sound BETTER while preserving her voice and intent.

${contactContext}

MONICA'S DRAFT (preserve the meaning and voice):
"""
${currentText}
"""

REFINE RULES:
- Keep her core message and intent — don't change WHAT she's saying, just HOW
- Make it tighter, more natural, more personal-sounding
- Fix any awkward phrasing
- Reference specifics from the contact details if her draft is generic
- Same length or shorter (never longer)
- Same warm tone — not pushy, not salesy
- Keep any specific details she included (names, places, prior context)
- 2-4 sentences

Return ONLY the refined message. No preamble, no quotes, no explanation. Just the polished text.`
        : `You are writing a friendly, warm check-in text from Monica Iskra (RE/MAX Classic, Metro Detroit luxury agent) to one of her contacts. The goal: re-open conversation, not sell.

${contactContext}

RULES:
- 2-4 sentences max
- Warm and personal (not salesy)
- Reference something specific from their details if available (their area, last interaction, etc.)
- End with a soft question they can easily answer
- No emojis unless naturally fitting (1 max)
- Sound like a friendly check-in, NOT a marketing message
- DO NOT use "I hope this finds you well" or similar clichés
- DO NOT use exclamation marks excessively

Return ONLY the text message. No preamble, no quotes, no explanation. Just the message text.`;

      const r = await fetch('/api/claude/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!r.ok) throw new Error(`AI error ${r.status}`);
      const data = await r.json();
      const message = (data?.content?.[0]?.text || data?.choices?.[0]?.message?.content || '').trim();
      if (!message) throw new Error('AI returned empty message');

      if (hasUserEdits) {
        // She edited it — save the refined version as HER edit, so further AI
        // calls keep refining her direction (not starting over).
        setEditedMessages(p => ({ ...p, [lead.id]: message }));
        toast?.success?.(`✨ Refined your draft for ${lead.name.split(' ')[0]}`);
      } else {
        setAiDrafts(p => ({ ...p, [lead.id]: { message, generatedAt: new Date().toISOString() } }));
        toast?.success?.(`✨ Personalized message for ${lead.name.split(' ')[0]}`);
      }
    } catch (e) {
      toast?.error?.('AI failed: ' + e.message);
    }
    setGeneratingFor(null);
  };

  // Log the outreach + remove from today's list
  const logOutreach = (lead, channel) => {
    const entry = {
      id: 'out_' + Date.now() + '_' + lead.id,
      leadId: lead.id,
      leadName: lead.name,
      channel,
      ts: new Date().toISOString(),
    };
    setOutreachLog(p => [entry, ...p]);
    setContactedToday(c => c + 1);
    // Also log in the contact's activity timeline
    try {
      const key = `activities_${lead.id}`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const channelLabel = { sms: '💬 Text', email: '✉️ Email', call: '📞 Call' }[channel] || channel;
      existing.unshift({
        id: 'act_' + Date.now(),
        type: channel,
        note: `${channelLabel} sent via Daily Outreach`,
        direction: 'out',
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem(key, JSON.stringify(existing));
    } catch {}
    toast?.success?.(`✅ Logged ${channel} to ${lead.name.split(' ')[0]}`);
  };

  // One-click action handlers — open native app with prefilled content
  const sendSMS = (lead) => {
    if (!lead.phone) return toast?.error?.('No phone on file');
    const message = getMessage(lead);
    const encoded = encodeURIComponent(message);
    const cleanPhone = lead.phone.replace(/\D/g, '');
    window.location.href = `sms:${cleanPhone}?body=${encoded}`;
    setTimeout(() => logOutreach(lead, 'sms'), 500);
  };
  const sendEmail = (lead) => {
    if (!lead.email) return toast?.error?.('No email on file');
    const message = getMessage(lead);
    const subject = encodeURIComponent('Checking in');
    const body = encodeURIComponent(message);
    window.location.href = `mailto:${lead.email}?subject=${subject}&body=${body}`;
    setTimeout(() => logOutreach(lead, 'email'), 500);
  };
  const initiateCall = (lead) => {
    if (!lead.phone) return toast?.error?.('No phone on file');
    const cleanPhone = lead.phone.replace(/\D/g, '');
    window.location.href = `tel:${cleanPhone}`;
    setTimeout(() => logOutreach(lead, 'call'), 500);
  };
  const skipToday = (lead) => {
    logOutreach(lead, 'skipped'); // still counts as "decided" today
    toast?.info?.(`Skipped ${lead.name.split(' ')[0]} for today`);
  };

  // Progress / streak
  const dailyGoal = 20;
  const progress = Math.min(contactedToday / dailyGoal, 1);
  const isDone = contactedToday >= dailyGoal;

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Zap size={22} color="#b8864b" />
          <h1 style={{ margin: 0, fontFamily: "'DM Serif Display',serif", fontSize: 28, fontWeight: 900, color: '#fff' }}>
            Daily Outreach
          </h1>
        </div>
        <div style={{ fontSize: 14, color: '#94a3b8', maxWidth: 720 }}>
          The fastest path to real leads: text 20 contacts from your sphere today. AI personalizes each message based on their history. One-click sends via your phone's native SMS app — free, no Twilio needed.
        </div>
      </div>

      {/* Progress + streak */}
      <div style={{
        padding: '18px 22px', marginBottom: 22,
        background: isDone
          ? 'linear-gradient(135deg, rgba(16,185,129,.15), rgba(110,231,183,.08))'
          : 'linear-gradient(135deg, rgba(184,134,75,.12), rgba(167,139,250,.06))',
        border: `1px solid ${isDone ? 'rgba(16,185,129,.4)' : 'rgba(184,134,75,.3)'}`,
        borderRadius: 14,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: isDone ? '#6ee7b7' : '#e0b370', letterSpacing: .6, textTransform: 'uppercase', marginBottom: 2 }}>
              {isDone ? '🏆 Daily goal hit!' : `🎯 Today's goal: ${dailyGoal} contacts`}
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: "'DM Serif Display',serif" }}>
              {contactedToday} <span style={{ color: '#64748b', fontSize: 14 }}>/ {dailyGoal} contacted today</span>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
              {ranked.length} contacts queued · {outreachLog.length} total outreach actions ever
            </div>
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, color: isDone ? '#6ee7b7' : '#b8864b', fontFamily: "'DM Serif Display',serif" }}>
            {Math.round(progress * 100)}%
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ height: 8, background: 'rgba(255,255,255,.05)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${progress * 100}%`,
            background: isDone ? 'linear-gradient(90deg, #10b981, #6ee7b7)' : 'linear-gradient(90deg, #b8864b, #e0b370)',
            transition: 'width .3s',
          }} />
        </div>
        {isDone && (
          <div style={{ marginTop: 10, fontSize: 13, color: '#6ee7b7', fontWeight: 700 }}>
            🎉 Great work. You've activated more sphere than 95% of agents today. Come back tomorrow.
          </div>
        )}
      </div>

      {/* ━━━ VIDEO LINK BAR — paste once, attaches to ALL outgoing texts ━━━ */}
      <div style={{
        padding: '14px 18px', marginBottom: 22,
        background: videoLink
          ? 'linear-gradient(135deg, rgba(234,67,53,.10), rgba(167,139,250,.06))'
          : 'rgba(255,255,255,.02)',
        border: `1px solid ${videoLink ? 'rgba(234,67,53,.3)' : 'rgba(255,255,255,.06)'}`,
        borderRadius: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: videoLink ? 10 : 0 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: videoLink ? '#ea4335' : '#94a3b8', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4 }}>
              🎥 {videoLink ? 'Video attached to all texts today' : 'Add a video to all outgoing texts'}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
              {videoLink
                ? 'Every text below auto-includes your video link. Past clients love personal videos — 3-5x reply rate vs text-only.'
                : 'Record once in Loom (or any tool), paste the link here, every text below auto-includes it. 30 seconds setup → real video outreach to 20 contacts.'}
            </div>
          </div>
          {!videoLink && (
            <a href="https://www.loom.com" target="_blank" rel="noreferrer" style={{
              padding: '8px 14px', background: 'rgba(234,67,53,.12)', color: '#ea4335',
              border: '1px solid rgba(234,67,53,.3)', borderRadius: 8,
              fontSize: 11, fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap',
            }}>
              Open Loom ↗
            </a>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="url"
            placeholder="Paste video link here (Loom, YouTube, Drive, etc.)…"
            value={videoLink}
            onChange={e => setVideoLink(e.target.value)}
            style={{
              flex: 2, minWidth: 180,
              padding: '10px 12px',
              background: 'rgba(255,255,255,.04)', color: '#fff',
              border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
              fontSize: 12, fontFamily: 'monospace',
            }}
          />
          {videoLink && (
            <>
              <input
                type="text"
                placeholder="Video intro text"
                value={videoCaption}
                onChange={e => setVideoCaption(e.target.value)}
                style={{
                  flex: 1, minWidth: 140,
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,.04)', color: '#fff',
                  border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <button onClick={() => setVideoLink('')} style={{
                padding: '10px 12px', background: 'rgba(239,68,68,.1)', color: '#f87171',
                border: '1px solid rgba(239,68,68,.25)', borderRadius: 8,
                fontSize: 11, fontWeight: 800, cursor: 'pointer',
              }}>
                Clear
              </button>
            </>
          )}
        </div>
        {videoLink && (
          <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(234,67,53,.06)', borderRadius: 6, fontSize: 10.5, color: '#94a3b8', fontFamily: 'monospace' }}>
            Preview: <span style={{ color: '#cbd5e1' }}>"{videoCaption} {videoLink}"</span> will be appended to every text below.
          </div>
        )}
      </div>

      {/* ━━━ CONTACTED TODAY — what you've already sent ━━━ */}
      {todayContacted.length > 0 && (
        <div style={{
          padding: '14px 18px', marginBottom: 22,
          background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.25)',
          borderRadius: 12,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#6ee7b7', letterSpacing: .6, textTransform: 'uppercase', marginBottom: 8 }}>
            ✅ Contacted today · {todayContacted.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {todayContacted.map(c => {
              const chMap = { sms: '💬 Text', email: '✉️ Email', call: '📞 Call', skipped: '⏭️ Skipped' };
              return (
                <div key={c.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 10px', background: 'rgba(0,0,0,.2)', borderRadius: 6, fontSize: 11.5,
                }}>
                  <span style={{ color: '#fff', fontWeight: 700 }}>{c.lead.name}</span>
                  <span style={{ color: '#94a3b8' }}>
                    {chMap[c.channel] || c.channel} · {new Date(c.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state with diagnostic counts */}
      {ranked.length === 0 && (
        <div style={{
          padding: '40px 22px', textAlign: 'center',
          background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)', borderRadius: 14,
        }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>{isDone ? '🏆' : debugCounts.total === 0 ? '⏳' : '🌅'}</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 5 }}>
            {isDone ? "You're done for today!"
              : debugCounts.total === 0 ? "Loading your leads…"
              : "No one queued right now"}
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>
            {isDone
              ? "Take the win. Come back tomorrow for tomorrow's list."
              : debugCounts.total === 0
                ? "Waiting for leads to sync from the cloud. Refresh in a moment, or check that you're signed in."
                : `Out of ${debugCounts.total.toLocaleString()} total leads: ${debugCounts.contactedToday} contacted today, ${debugCounts.noContact} have no phone/email, ${debugCounts.trash} marked trash.`
            }
          </div>
          {debugCounts.total > 0 && !isDone && (
            <div style={{ fontSize: 11, color: '#475569' }}>
              ✏️ If this seems wrong, check your leads in Lead Tracker. Most likely they need phone/email populated to surface here.
            </div>
          )}
        </div>
      )}

      {/* Outreach cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 14 }}>
        {ranked.map((lead, idx) => {
          const baseMessage = getBaseMessage(lead);
          const hasEdits = !!editedMessages[lead.id];
          const isAI = !!aiDrafts[lead.id] && !hasEdits;
          const generating = generatingFor === lead.id;
          const priorityColor =
            lead._daysSince > 365 ? '#ef4444' :
            lead._daysSince > 180 ? '#f0c040' :
            lead._daysSince > 90 ? '#7eb8f7' : '#94a3b8';

          return (
            <div key={lead.id} style={{
              background: '#0d1117', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12,
              padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
              borderLeft: `3px solid ${priorityColor}`,
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: `linear-gradient(135deg, ${priorityColor}, ${priorityColor}aa)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 900, color: '#fff',
                    }}>
                      {idx + 1}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{lead.name}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: 'rgba(255,255,255,.05)', color: '#94a3b8', fontWeight: 700 }}>
                      {lead.status || 'Contact'}
                    </span>
                    {lead.area && (
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: 'rgba(126,184,247,.1)', color: '#7eb8f7', fontWeight: 700 }}>
                        {lead.area}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: priorityColor }}>
                    <Clock size={9} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                    {lead._daysSince > 365 ? '1yr+' : `${lead._daysSince}d`}
                  </div>
                  <div style={{ fontSize: 9, color: '#475569', marginTop: 1 }}>since contact</div>
                </div>
              </div>

              {/* Editable message — type to edit, ✨ to AI-improve YOUR edits */}
              <div style={{
                background: hasEdits ? 'rgba(110,231,183,.06)' : isAI ? 'rgba(167,139,250,.06)' : 'rgba(184,134,75,.04)',
                borderLeft: `2px solid ${hasEdits ? '#10b981' : isAI ? '#a78bfa' : '#b8864b'}`,
                borderRadius: 6,
                padding: '6px 8px',
              }}>
                <textarea
                  value={baseMessage}
                  onChange={e => editMessage(lead.id, e.target.value)}
                  rows={Math.max(3, Math.min(8, baseMessage.split('\n').length + 1))}
                  style={{
                    width: '100%',
                    background: 'transparent', color: '#cbd5e1', border: 'none', outline: 'none',
                    fontSize: 11.5, lineHeight: 1.5, fontFamily: 'inherit',
                    resize: 'vertical', minHeight: 60,
                  }}
                  placeholder="Edit message here, then tap ✨ to have AI sharpen it…"
                />
                <div style={{ fontSize: 9, color: hasEdits ? '#10b981' : isAI ? '#a78bfa' : '#94a3b8', marginTop: 2, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>
                    {hasEdits ? '✏️ Your edits (✨ refines what you wrote)'
                      : isAI ? '✨ AI personalized · type to edit'
                      : '📝 Template · type to edit OR tap ✨ to personalize'}
                  </span>
                  {videoLink && (
                    <span style={{ color: '#ea4335', fontWeight: 800 }}>🎥 + video on send</span>
                  )}
                  {hasEdits && (
                    <button onClick={() => resetEdit(lead.id)} style={{
                      marginLeft: 'auto', background: 'none', border: 'none',
                      color: '#94a3b8', fontSize: 9, cursor: 'pointer', textDecoration: 'underline',
                    }}>
                      reset
                    </button>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 6 }}>
                {lead.phone && (
                  <button onClick={() => sendSMS(lead)} title="Send text" style={{
                    flex: 1, padding: '8px 10px',
                    background: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
                    color: '#fff', border: 'none', borderRadius: 6,
                    fontSize: 11, fontWeight: 800, cursor: 'pointer',
                  }}>
                    <MessageSquare size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                    Text
                  </button>
                )}
                {lead.email && (
                  <button onClick={() => sendEmail(lead)} title="Send email" style={{
                    flex: 1, padding: '8px 10px',
                    background: 'rgba(234,67,53,.15)', color: '#ea4335',
                    border: '1px solid rgba(234,67,53,.3)', borderRadius: 6,
                    fontSize: 11, fontWeight: 800, cursor: 'pointer',
                  }}>
                    <Mail size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                    Email
                  </button>
                )}
                {lead.phone && (
                  <button onClick={() => initiateCall(lead)} title="Call now" style={{
                    padding: '8px 10px',
                    background: 'rgba(16,185,129,.12)', color: '#10b981',
                    border: '1px solid rgba(16,185,129,.3)', borderRadius: 6,
                    fontSize: 11, fontWeight: 800, cursor: 'pointer',
                  }}>
                    <Phone size={11} />
                  </button>
                )}
                <button onClick={() => personalizeWithAI(lead)} disabled={generating} title="Personalize with Gemini AI" style={{
                  padding: '8px 10px',
                  background: 'rgba(167,139,250,.12)', color: '#a78bfa',
                  border: '1px solid rgba(167,139,250,.3)', borderRadius: 6,
                  fontSize: 11, fontWeight: 800, cursor: generating ? 'wait' : 'pointer',
                }}>
                  {generating ? '⏳' : <Sparkles size={11} />}
                </button>
                <button onClick={() => skipToday(lead)} title="Skip for today" style={{
                  padding: '8px 10px',
                  background: 'rgba(255,255,255,.04)', color: '#64748b',
                  border: '1px solid rgba(255,255,255,.08)', borderRadius: 6,
                  fontSize: 11, fontWeight: 800, cursor: 'pointer',
                }}>
                  <X size={11} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
