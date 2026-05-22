/**
 * leadActivity — unified timeline aggregator for one lead.
 *
 * Pulls every "thing that happened" with a lead from every data source in
 * the hub and returns them in one chronological list. This is the FUB-style
 * single-pane-of-glass view: open a contact, see every email/text/call/note
 * /AI-action ever, sorted newest-first.
 *
 * Sources covered (all client-side reads from localStorage / Supabase mirror):
 *   - manual activities (existing activities_<leadId> log)
 *   - tasks (open + completed — calls, texts, follow-ups)
 *   - email_queue (queued + sent emails)
 *   - past_client_agent_activity (AI-drafted touches from the agent)
 *   - lead status changes (when present in lead.meta.statusHistory)
 *   - campaign enrollments (lead.meta.campaigns)
 *   - lead created/updated timestamps
 *
 * Each event has the same shape regardless of source:
 *   {
 *     id,         // unique
 *     ts,         // unix ms — used for sorting
 *     type,       // 'note'|'call'|'text'|'email'|'task'|'agent'|'status'|'campaign'|'created'
 *     source,     // human label of what produced it ('Manual', 'Past Client Agent', etc.)
 *     icon,       // emoji
 *     color,      // hex
 *     title,      // 1-line summary
 *     body,       // longer detail (optional)
 *     direction,  // 'in' | 'out' | null
 *     status,     // 'completed' | 'queued' | 'sent' | 'error' | null
 *   }
 *
 * Usage:
 *   import { getLeadTimeline } from './leadActivity';
 *   const events = getLeadTimeline(lead, { tasks, emailQueue, agentActivity, manualActivities });
 *   events.forEach(e => ...);
 */

const TYPE_META = {
  note:     { icon: '📝', color: '#94a3b8' },
  call:     { icon: '📞', color: '#10b981' },
  text:     { icon: '💬', color: '#3b82f6' },
  email:    { icon: '📧', color: '#ea4335' },
  task:     { icon: '✓',  color: '#b8864b' },
  agent:    { icon: '🤖', color: '#a78bfa' },
  status:   { icon: '🏷',  color: '#f59e0b' },
  campaign: { icon: '⚡', color: '#06b6d4' },
  created:  { icon: '✨', color: '#64748b' },
  inbound:  { icon: '📥', color: '#10b981' },
  showing:  { icon: '🏠', color: '#06b6d4' },
};

function metaFor(type) {
  return TYPE_META[type] || { icon: '•', color: '#94a3b8' };
}

function toMs(d) {
  if (!d) return 0;
  if (typeof d === 'number') return d;
  const parsed = new Date(d).getTime();
  return isFinite(parsed) ? parsed : 0;
}

/**
 * Main entry — assembles the unified timeline.
 * @param lead     — the lead record (with id, name, email, phone, meta, created_at, etc.)
 * @param sources  — pass arrays from React state so we read consistent snapshots
 *   { tasks, emailQueue, agentActivity, manualActivities, campaigns? }
 * @returns events array, newest first
 */
export function getLeadTimeline(lead, sources = {}) {
  if (!lead) return [];
  const out = [];
  const leadId = lead.id;
  const leadEmail = (lead.email || '').toLowerCase();
  const leadPhone = (lead.phone || '').replace(/\D/g, '');

  // ── 1. Manual activities (existing activities_<leadId> LS) ────────────────
  (sources.manualActivities || []).forEach(a => {
    const type = (a.type === 'gmail') ? 'email' : (a.type || 'note');
    const m = metaFor(type);
    out.push({
      id: 'man_' + (a.id || a.createdAt),
      ts: toMs(a.createdAt),
      type,
      source: a.type === 'gmail' ? 'Gmail sync' : 'Manual log',
      icon: m.icon,
      color: m.color,
      title: a.note || `${type} logged`,
      body: a.detail || null,
      direction: a.direction || null,
      status: null,
      raw: a,
    });
  });

  // ── 2. Tasks (open + completed, every type) ───────────────────────────────
  (sources.tasks || []).filter(t => t.leadId === leadId).forEach(t => {
    const type = (t.type || '').toLowerCase() === 'call' ? 'call'
              : (t.type || '').toLowerCase() === 'text' ? 'text'
              : (t.type || '').toLowerCase() === 'email' ? 'email'
              : 'task';
    const m = metaFor(type);
    // Created event
    out.push({
      id: 'tsk_' + t.id + '_created',
      ts: toMs(t.createdAt),
      type,
      source: t.actionPlanName ? `Action plan: ${t.actionPlanName}` : (t.source || 'Task'),
      icon: m.icon,
      color: m.color,
      title: t.title || `${type} task created`,
      body: t.notes || t.smsBody || null,
      direction: 'out',
      status: t.completed ? 'completed' : 'open',
      raw: t,
    });
    // Completed event (separate timeline entry so you see when it was done)
    if (t.completed && t.completedAt) {
      out.push({
        id: 'tsk_' + t.id + '_done',
        ts: toMs(t.completedAt),
        type,
        source: 'Task completed',
        icon: '✓',
        color: '#10b981',
        title: `Completed: ${t.title}`,
        body: null,
        direction: null,
        status: 'completed',
        raw: t,
      });
    }
  });

  // ── 3. Email queue (queued + sent) ────────────────────────────────────────
  (sources.emailQueue || []).filter(e => e.leadId === leadId || (leadEmail && (e.to || '').toLowerCase() === leadEmail)).forEach(e => {
    out.push({
      id: 'eml_' + e.id,
      ts: toMs(e.createdAt || e.sentAt || e.dueDate),
      type: 'email',
      source: e.source || (e.campaignId ? `Drip campaign` : 'Email queue'),
      icon: '📧',
      color: '#ea4335',
      title: e.subject || `Email to ${e.to}`,
      body: e.body || null,
      direction: 'out',
      status: e.status || (e.sentAt ? 'sent' : 'queued'),
      raw: e,
    });
  });

  // ── 4. Past Client Agent log ──────────────────────────────────────────────
  (sources.agentActivity || []).filter(a => a.leadId === leadId).forEach(a => {
    out.push({
      id: 'pca_' + a.ts,
      ts: a.ts,
      type: 'agent',
      source: `${a.emoji || ''} ${a.templateName || 'Past Client Agent'}`.trim(),
      icon: a.emoji || '🤖',
      color: '#a78bfa',
      title: a.reason || a.templateName,
      body: a.sms || (a.email ? a.email.subject : null),
      direction: 'out',
      status: a.status || (a.error ? 'error' : 'drafted'),
      raw: a,
    });
  });

  // ── 5. Status history (when tracked in meta) ──────────────────────────────
  ((lead.meta && lead.meta.statusHistory) || []).forEach(h => {
    out.push({
      id: 'sta_' + (h.ts || h.changedAt),
      ts: toMs(h.ts || h.changedAt),
      type: 'status',
      source: 'Status change',
      icon: '🏷',
      color: '#f59e0b',
      title: `Status → ${h.to}`,
      body: h.from ? `from "${h.from}"` : null,
      direction: null,
      status: null,
      raw: h,
    });
  });

  // ── 6. Campaign enrollments (meta.campaigns + meta.lastEnrolledAt) ────────
  if (lead.meta?.lastEnrolledAt) {
    out.push({
      id: 'cmp_' + lead.meta.lastEnrolledAt,
      ts: toMs(lead.meta.lastEnrolledAt),
      type: 'campaign',
      source: 'Drip campaign',
      icon: '⚡',
      color: '#06b6d4',
      title: `Enrolled in ${(lead.meta.campaigns || []).join(', ') || 'a campaign'}`,
      body: null,
      direction: null,
      status: null,
      raw: lead.meta,
    });
  }

  // ── 7. Lead created event (always last in timeline = oldest) ──────────────
  if (lead.created_at) {
    out.push({
      id: 'crt_' + lead.id,
      ts: toMs(lead.created_at),
      type: 'created',
      source: lead.source || 'Manual entry',
      icon: '✨',
      color: '#64748b',
      title: `Lead created${lead.source ? ` via ${lead.source}` : ''}`,
      body: null,
      direction: 'in',
      status: null,
      raw: lead,
    });
  }

  // Sort newest first
  out.sort((a, b) => b.ts - a.ts);

  return out;
}

/**
 * Summary counts for the lead — used in the timeline header to show
 * "12 emails · 8 calls · 3 texts · 5 notes" at a glance.
 */
export function summarizeTimeline(events) {
  const counts = {};
  for (const e of events) {
    counts[e.type] = (counts[e.type] || 0) + 1;
  }
  const lastTouch = events.length > 0 ? events[0].ts : null;
  return { counts, total: events.length, lastTouch };
}

/**
 * Format a "time ago" string. Uses concise units.
 */
export function timeAgo(ts) {
  if (!ts) return '—';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60)      return 'just now';
  if (sec < 3600)    return Math.floor(sec / 60) + 'm ago';
  if (sec < 86400)   return Math.floor(sec / 3600) + 'h ago';
  if (sec < 604800)  return Math.floor(sec / 86400) + 'd ago';
  if (sec < 2592000) return Math.floor(sec / 604800) + 'w ago';
  if (sec < 31536000) return Math.floor(sec / 2592000) + 'mo ago';
  return Math.floor(sec / 31536000) + 'y ago';
}

/**
 * Format an absolute timestamp.
 */
export function formatTs(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}
