/**
 * aiPastClientAgent — AI agent that keeps in touch with past clients
 * automatically. The FUB replacement for "Houseaversary" action plans, but
 * smarter (AI-personalized per client, neighborhood-aware, voice-trained).
 *
 * 6 trigger types ("templates") this agent fires on:
 *
 *   1. anniversary  — fires on close-date anniversary (1yr, 2yr, 3yr, 5yr, 10yr)
 *   2. birthday     — fires on the client's birthday
 *   3. six-month    — fires 6 months after close
 *   4. seasonal     — fires quarterly (Mar/Jun/Sep/Dec) seasonal touch
 *   5. stale-lead   — fires when a non-past-client lead hasn't been touched in 90 days
 *   6. referral     — fires once at the 1-year mark with a soft refer-a-friend nudge
 *
 * Each template is INDEPENDENTLY toggleable from the UI. Each one generates a
 * fresh, personalized SMS + email draft via Gemini (free) using:
 *   - client's first name + property address
 *   - elapsed time since close
 *   - any agent voice profile (agentVoice) the user has trained
 *   - current season/holiday context
 *
 * Output: { sms: "...", email: { subject, body } }. The worker either fires
 * via Twilio (if SMS_TWILIO_ENABLED is true) or drops both into the user's
 * Tasks queue so they can review + tap Send.
 */

// ─── Template config ─────────────────────────────────────────────────────────
// Each template gets a unique ID, display info, and a matcher function that
// decides whether THIS client matches THIS template TODAY.
export const PAST_CLIENT_TEMPLATES = [
  {
    id: 'anniversary',
    name: 'Houseaversary',
    emoji: '🏡',
    desc: "Fires on close-date anniversaries (1yr / 2yr / 3yr / 5yr / 10yr). Personalized 'happy houseaversary' SMS + email referencing their property + how long it's been.",
    enabledDefault: true,
  },
  {
    id: 'birthday',
    name: 'Birthday',
    emoji: '🎂',
    desc: 'Fires on the client\'s birthday. Quick warm text. Requires their birthday in their record (meta.birthday). Skips silently if no birthday on file.',
    enabledDefault: true,
  },
  {
    id: 'six-month',
    name: '6-Month Check-In',
    emoji: '📞',
    desc: "Fires once, six months after close. 'How's the house treating you?' tone — opens the door to referrals + reviews.",
    enabledDefault: true,
  },
  {
    id: 'seasonal',
    name: 'Seasonal Touch',
    emoji: '🍂',
    desc: 'Fires on the first Monday of March / June / September / December. Quick seasonal hook (spring cleaning / summer maintenance / fall prep / holiday wishes).',
    enabledDefault: false,
  },
  {
    id: 'stale-lead',
    name: 'Stale-Lead Wake-Up',
    emoji: '💤',
    desc: "Fires on regular (non-past-client) leads that haven't been touched in 90+ days. Personalized re-engagement based on the lead's notes/source.",
    enabledDefault: false,
  },
  {
    id: 'referral',
    name: 'Refer-A-Friend Nudge',
    emoji: '🙌',
    desc: 'Fires once at the 1-year-after-close mark. Soft ask for referrals — frames it as appreciation, not pressure.',
    enabledDefault: true,
  },
];

// ─── Date math helpers ───────────────────────────────────────────────────────
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / MS_PER_DAY);
}
function sameDayMonth(dateStr, today = new Date()) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d)) return false;
  return d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
}
function yearsSince(dateStr) {
  const d = daysSince(dateStr);
  if (d == null) return null;
  return d / 365;
}

// ─── Matcher: does this lead match this template today? ─────────────────────
// Returns { matches: boolean, reason: string, milestone?: number } so the
// worker can log WHY it's firing for each lead.
export function matchesTemplate(templateId, lead, today = new Date()) {
  const meta = lead.meta || {};
  const closeDate = meta.closeDate || meta.close_date;
  const birthday  = meta.birthday;
  const lastTouchByTemplate = (meta.lastTouchByTemplate || {})[templateId];
  const isPastClient = (lead.status || '').toLowerCase().includes('past');

  // Don't re-fire if we've touched within the last 14 days for this template
  if (lastTouchByTemplate) {
    const recent = daysSince(lastTouchByTemplate);
    if (recent != null && recent < 14) return { matches: false, reason: 'touched-recently' };
  }

  switch (templateId) {
    case 'anniversary': {
      if (!isPastClient || !closeDate) return { matches: false, reason: 'no-close-date-or-not-past-client' };
      if (!sameDayMonth(closeDate, today)) return { matches: false, reason: 'not-anniversary-today' };
      const years = Math.round(yearsSince(closeDate));
      // Only fire on milestone years (1, 2, 3, 5, 10, 15, 20)
      if (![1, 2, 3, 5, 10, 15, 20].includes(years)) return { matches: false, reason: 'not-milestone-year' };
      return { matches: true, reason: `${years}-year houseaversary`, milestone: years };
    }
    case 'birthday': {
      if (!birthday) return { matches: false, reason: 'no-birthday-on-file' };
      if (!sameDayMonth(birthday, today)) return { matches: false, reason: 'not-birthday-today' };
      return { matches: true, reason: 'birthday today' };
    }
    case 'six-month': {
      if (!isPastClient || !closeDate) return { matches: false, reason: 'no-close-date-or-not-past-client' };
      const days = daysSince(closeDate);
      // Fire in a 7-day window around 180 days post-close
      if (days < 177 || days > 187) return { matches: false, reason: 'not-six-month-window' };
      return { matches: true, reason: `${days}-day post-close check-in` };
    }
    case 'seasonal': {
      if (!isPastClient) return { matches: false, reason: 'not-past-client' };
      // First Monday of Mar/Jun/Sep/Dec
      const m = today.getMonth();          // 0-11
      const d = today.getDate();           // 1-31
      const dow = today.getDay();          // 0-6 (Sun-Sat)
      const isSeasonalMonth = [2, 5, 8, 11].includes(m);
      const isFirstMondayWindow = dow === 1 && d <= 7;
      if (!isSeasonalMonth || !isFirstMondayWindow) return { matches: false, reason: 'not-seasonal-window' };
      const season = ['winter','winter','spring','spring','spring','summer','summer','summer','fall','fall','fall','winter'][m];
      return { matches: true, reason: `${season} seasonal touch`, season };
    }
    case 'stale-lead': {
      if (isPastClient) return { matches: false, reason: 'past-client-uses-other-templates' };
      const last = lead.updated_at || meta.lastTouch;
      const days = daysSince(last);
      if (days == null || days < 90) return { matches: false, reason: 'not-stale-yet' };
      // Don't re-fire every day forever — once per stale-lead per 60 days
      if (lastTouchByTemplate) {
        const recent = daysSince(lastTouchByTemplate);
        if (recent != null && recent < 60) return { matches: false, reason: 'already-touched-recently' };
      }
      return { matches: true, reason: `${days} days stale` };
    }
    case 'referral': {
      if (!isPastClient || !closeDate) return { matches: false, reason: 'no-close-date-or-not-past-client' };
      const days = daysSince(closeDate);
      // One-shot: fires in a 7-day window around 365 days post-close
      if (days < 362 || days > 372) return { matches: false, reason: 'not-referral-window' };
      if (meta.referralSent) return { matches: false, reason: 'already-asked' };
      return { matches: true, reason: '1-year referral ask' };
    }
    default:
      return { matches: false, reason: 'unknown-template' };
  }
}

// ─── AI message generator ───────────────────────────────────────────────────
// One call to Gemini (or Claude if she has the key) returns both SMS + email
// drafts, personalized to this client and this template. JSON return so we
// can render both at once.
export async function generatePastClientMessage({ template, lead, agent, agentVoice, marketSnippet }) {
  const tpl = PAST_CLIENT_TEMPLATES.find(t => t.id === template.id) || PAST_CLIENT_TEMPLATES[0];
  const firstName = (lead.name || '').trim().split(/\s+/)[0] || 'there';
  const propertyAddr = lead.address || lead.meta?.propertyAddress || '';
  const closeDate = lead.meta?.closeDate || lead.meta?.close_date;
  const closeYear = closeDate ? new Date(closeDate).getFullYear() : null;
  const years = closeDate ? Math.round((Date.now() - new Date(closeDate).getTime()) / (365 * MS_PER_DAY)) : null;

  const sys = `You are ${agent?.name || 'Monica Iskra'}'s past-client care assistant. Write a SHORT, warm, personal text + email that sounds EXACTLY like she'd write it to an old client.

${agentVoice ? `Brand voice: ${agentVoice}` : `Brand voice: warm, specific, never salesy. Real human voice. Use the client's first name. Reference their property when relevant. Keep texts under 280 characters. Keep emails under 6 sentences.`}

CRITICAL RULES:
- Sound like a friend, not a marketing template. NO "I hope this finds you well." NO "I wanted to reach out." NO "Just checking in."
- Reference SPECIFIC details (their property address, how long since they bought, the season, etc.) — generic = trash.
- One emoji max in each. Texts can be casual; emails can be slightly more polished.
- Texts MUST be under 280 chars (SMS limit). Emails under 6 sentences.
- Never ask for a review or referral unless the template explicitly says so.
- Sign emails with "Monica" (just first name) — feels personal.`;

  const triggerCtx = {
    'anniversary': `${years}-year HOUSEAVERSARY today — they bought ${propertyAddr} in ${closeYear}.`,
    'birthday': "It's the client's BIRTHDAY today.",
    'six-month': `Client closed on ${propertyAddr} about 6 months ago. Just a casual 'how's the house treating you?' check-in.`,
    'seasonal': `It's a SEASONAL touch (${template.season || 'this season'}). Quick warm hello, light seasonal hook for their home.`,
    'stale-lead': `This is a LEAD (not past client) who hasn't been touched in 90+ days. Source: ${lead.source || 'unknown'}. Their original interest: ${lead.notes || lead.area || 'home shopping'}. Casual, low-pressure re-engagement.`,
    'referral': `1-YEAR anniversary of closing on ${propertyAddr}. Gentle ask for referrals — frame as gratitude, not pressure.`,
  }[template.id] || 'general past-client touch';

  const prompt = `Generate a personalized SMS + email for a ${tpl.name} touch.

CLIENT:
- First name: ${firstName}
- Property: ${propertyAddr || '(unknown)'}
- Close date: ${closeDate || '(unknown)'}
- Status: ${lead.status || '(unknown)'}
- Their notes/situation: ${lead.notes || '(none)'}

TRIGGER CONTEXT: ${triggerCtx}

${marketSnippet ? `OPTIONAL market context (use only if it fits naturally): ${marketSnippet}` : ''}

Return STRICT JSON only (no markdown fences):
{
  "sms": "the SMS text, under 280 chars, casual, one emoji max",
  "email": {
    "subject": "short personal subject line under 50 chars",
    "body": "the email body, under 6 sentences, signed 'Monica'"
  }
}`;

  const r = await fetch('/api/claude/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: sys,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'AI error');
  const text = (d.content?.[0]?.text || '').trim();
  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    // Fallback if AI returns malformed JSON — return something usable
    const fallbackSms = (() => {
      switch (template.id) {
        case 'anniversary': return `Happy ${years}-year Houseaversary, ${firstName}! 🏡 Hope the house has been good to you. — Monica`;
        case 'birthday':    return `Happy birthday, ${firstName}! 🎂 Hope you have a fantastic day. — Monica`;
        case 'six-month':   return `Hey ${firstName} — has it really been 6 months already? Hope ${propertyAddr || 'the house'} is treating you well. — Monica`;
        case 'seasonal':    return `Hey ${firstName} — thinking of you this season. Hope all's well at ${propertyAddr || 'home'}! — Monica`;
        case 'stale-lead':  return `Hey ${firstName} — wanted to circle back. Still keeping an eye on the market for you. — Monica`;
        case 'referral':    return `Hey ${firstName} — a year already! Thanks for trusting me with the move. If you know anyone exploring, would love an intro. — Monica`;
        default:            return `Hey ${firstName} — thinking of you. — Monica`;
      }
    })();
    return {
      sms: fallbackSms,
      email: { subject: `Hi ${firstName}`, body: fallbackSms.replace('—', '\n\n--\n').replace('Monica', 'Monica\nMonica Iskra · RE/MAX Classic') },
    };
  }
}

// ─── Batch scanner — called by the worker on a schedule ─────────────────────
// Walks all leads, finds matches across all enabled templates, returns the
// list of (lead, template, match-reason) to act on.
export function scanForMatches(leads, enabledTemplateIds, today = new Date()) {
  const matches = [];
  for (const lead of leads) {
    for (const tplId of enabledTemplateIds) {
      const res = matchesTemplate(tplId, lead, today);
      if (res.matches) {
        matches.push({
          lead,
          templateId: tplId,
          template: PAST_CLIENT_TEMPLATES.find(t => t.id === tplId),
          reason: res.reason,
          milestone: res.milestone,
          season: res.season,
        });
      }
    }
  }
  return matches;
}
