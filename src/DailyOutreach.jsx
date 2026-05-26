/**
 * DailyOutreach.jsx — Monica's "I need leads RIGHT NOW" tool.
 *
 * Beats BoldTrail's daily action list because:
 *   1. AI-personalized message per contact (Gemini reads their notes/status/history,
 *      writes a unique opener) vs BoldTrail's generic templates
 *   2. One-click SMS via your phone's native Messages app (free, opens prefilled)
 *      vs BoldTrail's paid dialer ($499/mo)
 *   3. Smart priority ranking — surfaces who's MOST overdue × MOST likely to convert
 *   4. Multi-channel from one screen — text / email / call task / mark done
 *   5. Progress tracking — daily streak, "12 of 30 contacted today"
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
  const [outreachLog, setOutreachLog] = useLS('outreach_log', []); // [{leadId, channel, ts}]
  const [generatingFor, setGeneratingFor] = useState(null); // leadId currently being AI-personalized
  const [contactedToday, setContactedToday] = useState(() => {
    // count today's outreach from the log
    const today = new Date().toISOString().slice(0, 10);
    try {
      const log = JSON.parse(localStorage.getItem('outreach_log') || '[]');
      return log.filter(e => (e.ts || '').slice(0, 10) === today).length;
    } catch { return 0; }
  });

  // Build today's prioritized list — top 30 contacts most due for outreach
  const ranked = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    // Skip anyone already contacted today
    const alreadyContacted = new Set(
      outreachLog.filter(e => (e.ts || '').slice(0, 10) === today).map(e => e.leadId)
    );
    return leads
      .filter(l => l.status !== 'Trash')
      .filter(l => !alreadyContacted.has(l.id))
      .filter(l => l.phone || l.email)
      .map(l => ({
        ...l,
        _priority: priorityScore(l),
        _lastContact: getLastContactDate(l),
        _daysSince: daysSince(getLastContactDate(l)),
      }))
      .filter(l => l._priority > 50)
      .sort((a, b) => b._priority - a._priority)
      .slice(0, 30);
  }, [leads, outreachLog]);

  // Generate or fetch the personalized message for a lead
  const getMessage = (lead) => {
    const cached = aiDrafts[lead.id]?.message;
    if (cached) return cached;
    return fallbackTemplate(lead);
  };

  // Call Gemini to personalize the message based on the lead's full context
  const personalizeWithAI = async (lead) => {
    setGeneratingFor(lead.id);
    try {
      // Pull recent activities for context
      let recentActivity = '';
      try {
        const acts = JSON.parse(localStorage.getItem(`activities_${lead.id}`) || '[]');
        recentActivity = acts.slice(0, 3).map(a => `${a.type || 'note'}: ${a.note || a.subject || ''}`).join('\n');
      } catch {}

      const prompt = `You are writing a friendly, warm check-in text from Monica Iskra (RE/MAX Classic, Metro Detroit luxury agent) to one of her contacts. The goal: re-open conversation, not sell.

CONTACT DETAILS:
- Name: ${lead.name}
- Status: ${lead.status || 'Contact'}
- Area/interest: ${lead.area || lead.address || 'Metro Detroit'}
- Type: ${lead.type || 'Buyer'}
- Days since last contact: ${lead._daysSince || 'unknown'}
- Tags: ${(lead.tags || []).join(', ') || 'none'}
- Notes: ${(lead.notes || '').slice(0, 200) || 'none'}
- Recent activity:
${recentActivity || 'none'}

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
      setAiDrafts(p => ({ ...p, [lead.id]: { message, generatedAt: new Date().toISOString() } }));
      toast?.success?.(`✨ Personalized message for ${lead.name.split(' ')[0]}`);
    } catch (e) {
      toast?.error?.('AI personalize failed — using template: ' + e.message);
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
          <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 8, background: 'rgba(184,134,75,.15)', color: '#e0b370' }}>
            BEATS BOLDTRAIL
          </span>
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

      {/* Empty state */}
      {ranked.length === 0 && (
        <div style={{
          padding: '40px 22px', textAlign: 'center',
          background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)', borderRadius: 14,
        }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>{isDone ? '🏆' : '🌅'}</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 5 }}>
            {isDone ? "You're done for today!" : "No one needs outreach right now"}
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            {isDone
              ? "Take the win. Come back tomorrow for tomorrow's list."
              : "Either everyone's been contacted recently, or you need to import more leads. Check Lead Tracker."}
          </div>
        </div>
      )}

      {/* Outreach cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 14 }}>
        {ranked.map((lead, idx) => {
          const message = getMessage(lead);
          const isAI = !!aiDrafts[lead.id];
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

              {/* Message preview */}
              <div style={{
                padding: '8px 10px',
                background: isAI ? 'rgba(167,139,250,.06)' : 'rgba(184,134,75,.04)',
                borderLeft: `2px solid ${isAI ? '#a78bfa' : '#b8864b'}`,
                borderRadius: 6,
                fontSize: 11.5, color: '#cbd5e1', lineHeight: 1.5,
              }}>
                {message}
                <div style={{ fontSize: 9, color: isAI ? '#a78bfa' : '#94a3b8', marginTop: 4, fontWeight: 700 }}>
                  {isAI ? '✨ AI personalized' : '📝 Template (click ✨ to personalize)'}
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
