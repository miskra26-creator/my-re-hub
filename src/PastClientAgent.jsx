/**
 * PastClientAgent — UI for the past-client care AI agent.
 *
 * Six templates Monica can toggle ON/OFF independently:
 *   - 🏡 Houseaversary (anniversary of close)
 *   - 🎂 Birthday
 *   - 📞 6-Month Check-In
 *   - 🍂 Seasonal Touch (quarterly)
 *   - 💤 Stale-Lead Wake-Up
 *   - 🙌 Refer-A-Friend Nudge (1-year mark)
 *
 * Each template runs in the background (via PastClientAgentWorker) — daily
 * scan of all leads, AI-generates a personalized SMS + email when a trigger
 * matches, drops drafts into the Tasks queue for one-tap-Send (no Twilio
 * required for v1).
 *
 * Three tabs:
 *   • Settings — toggle each template, view activity log
 *   • Preview AI — pick any lead + template, see the AI draft
 *   • Activity — chronological log of who got what + when
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Heart, Sparkles, CheckCircle, Clock, MessageSquare, Mail, RefreshCw,
  Send, Eye, ArrowLeft, AlertCircle, Loader,
} from 'lucide-react';
import { supabase } from './supabase';
import { useLS } from './cloudHooks';
import { useLeadsCloud } from './useLeadsCloud';
import {
  PAST_CLIENT_TEMPLATES,
  matchesTemplate,
  scanForMatches,
  generatePastClientMessage,
} from './aiPastClientAgent';

const S = {
  card: {
    background: 'rgba(15,20,38,.6)', border: '1px solid rgba(255,255,255,.06)',
    borderRadius: 14, padding: 18, marginBottom: 14,
  },
  cardLabel: {
    fontSize: 11, fontWeight: 800, color: '#b8864b', letterSpacing: 2,
    textTransform: 'uppercase', marginBottom: 12,
  },
  primaryBtn: {
    background: 'linear-gradient(135deg, #b8864b, #d4a017)',
    border: 'none', borderRadius: 10, padding: '12px 22px',
    color: '#0f172a', fontSize: 14, fontWeight: 900, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 8,
  },
  ghostBtn: {
    background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 8, padding: '8px 14px', color: '#cbd5e1', fontSize: 12.5,
    fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  input: {
    background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 8, padding: '9px 12px', color: '#f1f5f9', fontSize: 13,
    outline: 'none', fontFamily: 'inherit',
  },
};

export default function PastClientAgent({ setPage, toast }) {
  const [tab, setTab] = useState('settings'); // 'settings' | 'preview' | 'activity'

  // Per-template enabled state. Defaults from the template config.
  const defaultEnabled = useMemo(
    () => Object.fromEntries(PAST_CLIENT_TEMPLATES.map(t => [t.id, t.enabledDefault])),
    []
  );
  const [enabled, setEnabled] = useLS('past_client_agent_enabled', defaultEnabled);
  const [activity, setActivity] = useLS('past_client_agent_activity', []); // [{ts, leadName, leadId, templateId, sms, email, status}]
  const [profile] = useLS('re_profile', { name: 'Monica Iskra' });
  const [agentVoice] = useLS('agent_voice', '');

  const [leads] = useLeadsCloud();
  const enabledIds = useMemo(
    () => PAST_CLIENT_TEMPLATES.filter(t => enabled[t.id]).map(t => t.id),
    [enabled]
  );

  // Live count of upcoming matches in the next 30 days (informational)
  const upcomingMatches = useMemo(() => {
    if (!leads?.length) return [];
    const out = [];
    for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + dayOffset);
      const matches = scanForMatches(leads, enabledIds, futureDate);
      matches.forEach(m => out.push({ ...m, dayOffset, date: futureDate.toISOString().slice(0, 10) }));
    }
    return out;
  }, [leads, enabledIds]);

  const todayMatches = upcomingMatches.filter(m => m.dayOffset === 0);

  const toggleTemplate = (id) => {
    setEnabled({ ...enabled, [id]: !enabled[id] });
  };

  const runNow = async () => {
    // Manually trigger the scan + generation for any leads that match today.
    if (!leads?.length) {
      toast?.error('No leads loaded yet');
      return;
    }
    const matches = scanForMatches(leads, enabledIds);
    if (!matches.length) {
      toast?.info('No leads match any enabled template today');
      return;
    }
    toast?.info(`Found ${matches.length} match${matches.length === 1 ? '' : 'es'} — generating drafts...`);

    let success = 0, failed = 0;
    const newActivity = [];
    for (const m of matches) {
      try {
        const result = await generatePastClientMessage({
          template: m.template,
          lead: m.lead,
          agent: profile,
          agentVoice,
        });
        newActivity.push({
          ts: Date.now(),
          leadId: m.lead.id,
          leadName: m.lead.name,
          templateId: m.templateId,
          templateName: m.template.name,
          emoji: m.template.emoji,
          reason: m.reason,
          sms: result.sms,
          email: result.email,
          status: 'drafted',
        });
        // Mark in lead.meta so we don't re-fire within 14 days
        await markLeadTouched(m.lead, m.templateId);
        success++;
      } catch (e) {
        newActivity.push({
          ts: Date.now(),
          leadId: m.lead.id,
          leadName: m.lead.name,
          templateId: m.templateId,
          templateName: m.template.name,
          emoji: m.template.emoji,
          reason: m.reason,
          error: e.message,
          status: 'error',
        });
        failed++;
      }
    }
    setActivity([...newActivity, ...activity].slice(0, 200));
    toast?.success(`Drafted ${success} message${success === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}`);
  };

  return (
    <div className="page-content">
      <div style={{ marginBottom: 28 }}>
        <button className="btn-back" style={{ marginBottom: 14 }} onClick={() => setPage?.('dashboard')}>
          <ArrowLeft size={13} /> Dashboard
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{
            width: 54, height: 54, borderRadius: 14,
            background: 'linear-gradient(135deg, #b8864b, #d4a017)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(184,134,75,.35)',
          }}>
            <Heart size={26} color="#0f172a" strokeWidth={2.5} />
          </div>
          <div>
            <div className="page-title" style={{ margin: 0 }}>Past Client Care Agent</div>
            <div className="page-sub" style={{ margin: 0 }}>
              AI-personalized touches for past clients · Houseaversary · birthday · check-ins · referrals
            </div>
          </div>
        </div>
      </div>

      {/* Status header */}
      <div style={{
        background: enabledIds.length > 0 ? 'rgba(16,185,129,.10)' : 'rgba(239,68,68,.10)',
        border: `1px solid ${enabledIds.length > 0 ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.3)'}`,
        borderRadius: 12, padding: 14, marginBottom: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {enabledIds.length > 0 ? (
            <CheckCircle size={20} color="#10b981" />
          ) : (
            <AlertCircle size={20} color="#ef4444" />
          )}
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#f1f5f9' }}>
              Agent is {enabledIds.length > 0 ? 'ACTIVE' : 'OFF'} · {enabledIds.length} of {PAST_CLIENT_TEMPLATES.length} templates enabled
            </div>
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 3 }}>
              {todayMatches.length > 0
                ? `${todayMatches.length} lead${todayMatches.length === 1 ? '' : 's'} match today — click "Run Now" to draft messages.`
                : `Next 30 days: ${upcomingMatches.length} upcoming touchpoint${upcomingMatches.length === 1 ? '' : 's'}.`}
            </div>
          </div>
        </div>
        <button onClick={runNow} disabled={enabledIds.length === 0} style={{
          ...S.primaryBtn,
          opacity: enabledIds.length === 0 ? 0.4 : 1,
          cursor: enabledIds.length === 0 ? 'not-allowed' : 'pointer',
        }}>
          <RefreshCw size={15} /> Run Now (scan + draft)
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {['settings', 'preview', 'activity'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(184,134,75,.20)' : 'rgba(255,255,255,.04)',
            border: tab === t ? '1px solid #b8864b' : '1px solid rgba(255,255,255,.1)',
            borderRadius: 8, padding: '8px 16px',
            color: tab === t ? '#e0b370' : '#cbd5e1',
            fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            textTransform: 'capitalize',
          }}>{t}</button>
        ))}
      </div>

      {/* SETTINGS tab */}
      {tab === 'settings' && (
        <div style={S.card}>
          <div style={S.cardLabel}>Templates · toggle each independently</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PAST_CLIENT_TEMPLATES.map(t => {
              const isOn = enabled[t.id];
              const upcomingForThis = upcomingMatches.filter(m => m.templateId === t.id);
              return (
                <div key={t.id} style={{
                  background: 'rgba(0,0,0,.25)',
                  border: isOn ? '1px solid rgba(184,134,75,.35)' : '1px solid rgba(255,255,255,.06)',
                  borderRadius: 10, padding: 14,
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                }}>
                  <div style={{ fontSize: 26, lineHeight: 1 }}>{t.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#f1f5f9' }}>{t.name}</div>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!isOn} onChange={() => toggleTemplate(t.id)}
                          style={{ width: 16, height: 16, accentColor: '#b8864b' }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: isOn ? '#6ee7b7' : '#94a3b8' }}>
                          {isOn ? 'ON' : 'OFF'}
                        </span>
                      </label>
                    </div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8', lineHeight: 1.5, marginBottom: 6 }}>
                      {t.desc}
                    </div>
                    {isOn && upcomingForThis.length > 0 && (
                      <div style={{ fontSize: 11, color: '#e0b370', fontWeight: 700 }}>
                        Next 30 days: {upcomingForThis.length} match{upcomingForThis.length === 1 ? '' : 'es'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Twilio note */}
          <div style={{
            marginTop: 14, padding: '10px 12px',
            background: 'rgba(245,158,11,.08)', borderLeft: '3px solid #f59e0b',
            borderRadius: 6, fontSize: 11.5, color: '#fbbf24', lineHeight: 1.5,
          }}>
            <strong>SMS auto-fire:</strong> not wired yet. For now this agent DRAFTS the SMS + email and drops them into your Tasks queue — you tap Send on your phone. Add Twilio (~$5-15/mo) for zero-touch auto-fire later.
          </div>
        </div>
      )}

      {/* PREVIEW tab */}
      {tab === 'preview' && (
        <PreviewTab leads={leads} profile={profile} agentVoice={agentVoice} toast={toast} />
      )}

      {/* ACTIVITY tab */}
      {tab === 'activity' && (
        <div style={S.card}>
          <div style={S.cardLabel}>Activity log · last 200 messages drafted</div>
          {activity.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#94a3b8', padding: 14 }}>
              No activity yet. Click "Run Now" above to scan and draft, or wait for the background worker to fire automatically (runs every hour).
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activity.slice(0, 50).map((a, i) => (
                <div key={i} style={{
                  background: 'rgba(0,0,0,.25)', borderRadius: 8, padding: 12,
                  borderLeft: a.status === 'error' ? '3px solid #ef4444' : '3px solid #b8864b',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: '#f1f5f9' }}>
                      {a.emoji} {a.templateName} → {a.leadName}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#64748b' }}>
                      {new Date(a.ts).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ fontSize: 10.5, color: '#94a3b8', marginBottom: 6 }}>{a.reason}</div>
                  {a.error ? (
                    <div style={{ fontSize: 11.5, color: '#fca5a5' }}>❌ {a.error}</div>
                  ) : (
                    <>
                      <CopyableMessage label="SMS" text={a.sms} icon={<MessageSquare size={11} />} />
                      {a.email && (
                        <CopyableMessage
                          label="Email"
                          text={`Subject: ${a.email.subject}\n\n${a.email.body}`}
                          icon={<Mail size={11} />}
                        />
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Preview tab — pick a lead + template, generate a sample message ────────
function PreviewTab({ leads, profile, agentVoice, toast }) {
  const [leadId, setLeadId] = useState('');
  const [templateId, setTemplateId] = useState('anniversary');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);

  const lead = leads?.find(l => l.id === leadId);
  const template = PAST_CLIENT_TEMPLATES.find(t => t.id === templateId);

  // Filter dropdown to past clients first, then others
  const sortedLeads = useMemo(() => {
    if (!leads?.length) return [];
    return [...leads].sort((a, b) => {
      const aPast = (a.status || '').toLowerCase().includes('past') ? 0 : 1;
      const bPast = (b.status || '').toLowerCase().includes('past') ? 0 : 1;
      return aPast - bPast || (a.name || '').localeCompare(b.name || '');
    });
  }, [leads]);

  const preview = async () => {
    if (!lead || !template) return;
    setGenerating(true);
    setResult(null);
    try {
      const out = await generatePastClientMessage({
        template, lead, agent: profile, agentVoice,
      });
      setResult(out);
    } catch (e) {
      toast?.error('Preview failed: ' + e.message);
    }
    setGenerating(false);
  };

  return (
    <div style={S.card}>
      <div style={S.cardLabel}>Preview · pick a lead + template, see what the AI would draft</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 }}>Lead</div>
          <select value={leadId} onChange={(e) => setLeadId(e.target.value)} style={{ ...S.input, width: '100%' }}>
            <option value="">— Pick a lead —</option>
            {sortedLeads.slice(0, 200).map(l => (
              <option key={l.id} value={l.id}>
                {l.name || '(no name)'} {l.status?.includes('Past') ? '· Past Client' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 }}>Template</div>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={{ ...S.input, width: '100%' }}>
            {PAST_CLIENT_TEMPLATES.map(t => (
              <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>
            ))}
          </select>
        </div>
      </div>
      <button onClick={preview} disabled={!lead || generating} style={{
        ...S.primaryBtn, opacity: !lead || generating ? 0.5 : 1, marginBottom: 14,
      }}>
        {generating ? <Loader size={15} className="spin" /> : <Eye size={15} />}
        {generating ? 'Generating…' : 'Preview AI draft'}
      </button>

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <CopyableMessage label="SMS" text={result.sms} icon={<MessageSquare size={12} />} />
          {result.email && (
            <CopyableMessage
              label="Email"
              text={`Subject: ${result.email.subject}\n\n${result.email.body}`}
              icon={<Mail size={12} />}
            />
          )}
        </div>
      )}

      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Re-usable "copyable message" tile ──────────────────────────────────────
function CopyableMessage({ label, text, icon }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    navigator.clipboard?.writeText(text || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{
      background: 'rgba(0,0,0,.30)', border: '1px solid rgba(255,255,255,.06)',
      borderRadius: 8, padding: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, color: '#b8864b', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          {icon} {label}
        </div>
        <button onClick={onCopy} style={{
          background: copied ? 'rgba(16,185,129,.2)' : 'rgba(255,255,255,.05)',
          border: '1px solid rgba(255,255,255,.1)', borderRadius: 5,
          color: copied ? '#6ee7b7' : '#cbd5e1', fontSize: 10, fontWeight: 700,
          padding: '3px 8px', cursor: 'pointer',
        }}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <div style={{ fontSize: 12.5, color: '#e2e8f0', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {text || '—'}
      </div>
    </div>
  );
}

// ─── Mark a lead as touched (writes back to Supabase) ────────────────────────
async function markLeadTouched(lead, templateId) {
  try {
    const meta = { ...(lead.meta || {}) };
    meta.lastTouchByTemplate = { ...(meta.lastTouchByTemplate || {}), [templateId]: new Date().toISOString() };
    if (templateId === 'referral') meta.referralSent = true;
    await supabase
      .from('leads')
      .update({ meta, updated_at: new Date().toISOString() })
      .eq('id', lead.id);
  } catch (e) {
    console.warn('[past-client-agent] failed to mark touched:', e.message);
  }
}

// ─── Background worker — fires every hour ────────────────────────────────────
// Drop this in App.js next to the other workers (GmailSyncWorker, etc.).
// Renders nothing; runs scan+draft in the background.
export function PastClientAgentWorker({ toast, notify }) {
  const [enabled] = useLS('past_client_agent_enabled', {});
  const [activity, setActivity] = useLS('past_client_agent_activity', []);
  const [profile] = useLS('re_profile', { name: 'Monica Iskra' });
  const [agentVoice] = useLS('agent_voice', '');
  const [leads] = useLeadsCloud();
  const [lastRun, setLastRun] = useLS('past_client_agent_last_run', 0);

  const tick = useCallback(async () => {
    const now = Date.now();
    // Once per hour cadence
    if (now - lastRun < 60 * 60 * 1000) return;
    setLastRun(now);

    const enabledIds = PAST_CLIENT_TEMPLATES.filter(t => enabled[t.id]).map(t => t.id);
    if (!enabledIds.length || !leads?.length) return;

    const matches = scanForMatches(leads, enabledIds);
    if (!matches.length) return;

    notify?.(`Past Client Agent: ${matches.length} match${matches.length === 1 ? '' : 'es'} firing now`);

    const newActivity = [];
    for (const m of matches) {
      try {
        const result = await generatePastClientMessage({
          template: m.template, lead: m.lead, agent: profile, agentVoice,
        });
        newActivity.push({
          ts: Date.now(),
          leadId: m.lead.id,
          leadName: m.lead.name,
          templateId: m.templateId,
          templateName: m.template.name,
          emoji: m.template.emoji,
          reason: m.reason,
          sms: result.sms,
          email: result.email,
          status: 'drafted',
        });
        await markLeadTouched(m.lead, m.templateId);
      } catch (e) {
        newActivity.push({
          ts: Date.now(),
          leadId: m.lead.id,
          leadName: m.lead.name,
          templateId: m.templateId,
          templateName: m.template.name,
          emoji: m.template.emoji,
          reason: m.reason,
          error: e.message,
          status: 'error',
        });
      }
    }
    setActivity([...newActivity, ...activity].slice(0, 200));
  }, [enabled, leads, profile, agentVoice, lastRun, activity, setActivity, setLastRun, notify]);

  useEffect(() => {
    // Initial run shortly after mount, then every 15 min (but tick gates to 1hr cadence)
    const initial = setTimeout(tick, 30 * 1000);
    const interval = setInterval(tick, 15 * 60 * 1000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [tick]);

  return null;
}
