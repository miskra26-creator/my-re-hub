/**
 * actionPlans.js — the follow-up engine's shared brain.
 *
 * WHY THIS FILE EXISTS
 * The logic that turns "apply this plan to this lead" into dated tasks was
 * copy-pasted in three places in App.js (the Action Plans screen, the lead
 * detail panel, and the auto-enroll on inbox import). All three drifted, and
 * all three shared the same crash: `lead.name.split(" ")[0]` throws on a lead
 * with no name — and a FUB export of 6,000 leads absolutely contains those.
 * One copy, tested once, used everywhere.
 *
 * WHAT AN ACTION PLAN IS
 * A named sequence of steps, each with an offset in days from the start date.
 * Applying it materialises one task per step. Tasks are the daily call list —
 * nothing here sends anything to anyone. That's deliberate: a plan can be
 * applied to hundreds of leads safely, because a human still presses send.
 */

export const TASK_TYPES = ["Call", "Text", "Email", "Follow-up", "Meeting", "To-Do"];
export const TASK_ICONS = { Call: "📞", Text: "💬", Email: "📧", "Follow-up": "🔔", Meeting: "📅", "To-Do": "✅" };
export const TASK_COLORS = { Call: "#ef4444", Text: "#8b5cf6", Email: "#3b82f6", "Follow-up": "#f59e0b", Meeting: "#10b981", "To-Do": "#64748b" };

// Tasks live in localStorage (useLS 'tasks'), which browsers cap around 5MB.
// At roughly 200 bytes per task that's ~25,000 tasks before writes start
// failing — and a failed write there doesn't just lose the new tasks, it can
// take the whole key with it. Applying a 7-step plan to all 6,042 leads would
// be 42,000 tasks, so bulk apply is capped well below the danger line.
// It's also a workflow limit, not just a technical one: nobody works a
// thousand-task queue. Small batches, actually worked, beat a giant dead list.
export const MAX_BULK_TASKS = 1000;

export const BUILT_IN_PLANS = [
  { id:"plan_new_lead", name:"New Lead — 7 Day Blitz", isBuiltIn:true,
    description:"Aggressive first-week follow-up. Best for hot prospects and fresh inquiries.",
    steps:[
      {day:0, type:"Call",      title:"Welcome call — introduce yourself, find out their timeline"},
      {day:0, type:"Text",      title:"Text: 'Hi [name]! This is Monica Iskra. Just tried to reach you — happy to help you find your perfect home!'"},
      {day:1, type:"Email",     title:"Send intro email with neighborhood market snapshot"},
      {day:2, type:"Call",      title:"Follow-up call attempt #2"},
      {day:3, type:"Text",      title:"Text: 'Still here to help whenever you're ready. Any questions?'"},
      {day:5, type:"Email",     title:"Send 3 active listings that match their criteria"},
      {day:7, type:"Call",      title:"7-day check-in call — where are they in their search?"},
    ]
  },
  { id:"plan_buyer", name:"New Buyer Nurture (30 Day)", isBuiltIn:true,
    description:"For serious buyers — walks them from inquiry to showing appointments.",
    steps:[
      {day:0, type:"Call",      title:"Initial buyer consultation — budget, timeline, must-haves"},
      {day:1, type:"Email",     title:"Send buyer guide + pre-approval referral info"},
      {day:3, type:"Call",      title:"Check on pre-approval status, answer questions"},
      {day:7, type:"Email",     title:"Send curated home search with 5 top matches"},
      {day:10, type:"Call",     title:"Schedule first showings"},
      {day:14, type:"Text",     title:"Text: 'New listing just hit that fits your search — want to see it?'"},
      {day:21, type:"Call",     title:"3-week check-in — adjust search criteria?"},
      {day:30, type:"Email",    title:"30-day market update for their target area"},
    ]
  },
  { id:"plan_seller", name:"New Seller Prospect", isBuiltIn:true,
    description:"Convert a seller inquiry into a listing appointment.",
    steps:[
      {day:0, type:"Call",      title:"Initial call — understand their motivation and timeline"},
      {day:1, type:"Email",     title:"Send personalized CMA and neighborhood market report"},
      {day:2, type:"Call",      title:"CMA follow-up — answer pricing questions"},
      {day:5, type:"Email",     title:"Send your listing presentation and marketing plan"},
      {day:7, type:"Call",      title:"Schedule listing appointment"},
      {day:14, type:"Follow-up",title:"Check in — any hesitation? Address objections"},
      {day:21, type:"Email",    title:"Send comparable active listings to show market activity"},
      {day:30, type:"Call",     title:"Final push — are they ready to list?"},
    ]
  },
  { id:"plan_nurture_6mo", name:"Nurture — 6 Month", isBuiltIn:true,
    description:"For leads who are 3–6 months out. Stay top of mind without being pushy.",
    steps:[
      {day:0,   type:"Email",   title:"Welcome email — set expectations, offer help whenever they're ready"},
      {day:14,  type:"Call",    title:"Friendly check-in — any questions about the market?"},
      {day:30,  type:"Email",   title:"Month 1 market update for their target area"},
      {day:60,  type:"Call",    title:"2-month check-in — timeline update?"},
      {day:90,  type:"Email",   title:"Quarter market report — prices, inventory, trends"},
      {day:120, type:"Call",    title:"4-month check-in — are they getting closer?"},
      {day:150, type:"Email",   title:"5-month — send relevant new listings"},
      {day:180, type:"Call",    title:"6-month full check-in — ready to move forward?"},
    ]
  },
  { id:"plan_past_client", name:"Past Client Annual Check-In", isBuiltIn:true,
    description:"Stay top of mind with clients who already closed. Referral gold.",
    steps:[
      {day:0,   type:"Call",    title:"Annual check-in call — how's the home treating them?"},
      {day:1,   type:"Email",   title:"Send personalized home value update for their address"},
      {day:90,  type:"Email",   title:"Spring/Fall market update for their neighborhood"},
      {day:180, type:"Call",    title:"Mid-year check-in — any friends or family looking?"},
      {day:270, type:"Email",   title:"Holiday message + year-end market report"},
      {day:365, type:"Call",    title:"1-year anniversary call — how can I help?"},
    ]
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

// Date maths on integers, never on a Date's local timezone. `new Date('2026-09-01')`
// is midnight UTC; in Michigan that's 8pm on Aug 31, so any local-time rounding
// can shift a due date a day early. A call scheduled a day early is a small
// thing; a whole plan silently off by one is not.
export function addDaysISO(startYMD, days) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(startYMD || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + (Number(days) || 0)));
  return d.toISOString().slice(0, 10);
}

// A lead with no name is common in FUB exports (phone-only web leads).
// "Hi there" is a usable script line; a crash is not.
export function firstNameOf(lead) {
  const n = String(lead?.name || lead?.firstName || '').trim();
  if (!n) return 'there';
  return n.split(/\s+/)[0];
}

// Existing code used .replace("[name]", ...) which substitutes only the FIRST
// occurrence — a two-mention step left a literal "[name]" in her call script.
export function fillPlaceholders(text, lead) {
  const first = firstNameOf(lead);
  return String(text || '')
    .replace(/\[name\]/g, first)
    .replace(/\{firstName\}/g, first);
}

/**
 * A lead is "already on" a plan when it still has UNFINISHED tasks from it.
 * Re-applying a plan whose tasks were all completed is legitimate — that's the
 * annual past-client check-in coming round again. Re-applying one that's still
 * in flight just duplicates her call list, which is how a task queue becomes
 * noise she stops trusting.
 */
export function isOnPlan(tasks, leadId, planId) {
  return (tasks || []).some(
    (t) => t && t.leadId === leadId && t.actionPlanId === planId && !t.completed
  );
}

/** Materialise one plan into dated tasks for a single lead. */
export function planTasksForLead(plan, lead, startYMD, idFn) {
  if (!plan || !Array.isArray(plan.steps) || !lead) return [];
  const createdAt = new Date().toISOString();
  return plan.steps.map((step) => ({
    id: idFn(),
    title: fillPlaceholders(step.title, lead),
    type: step.type,
    leadId: lead.id,
    leadName: lead.name || '(no name)',
    dueDate: addDaysISO(startYMD, step.day),
    notes: '',
    actionPlanId: plan.id,
    actionPlanName: plan.name,
    completed: false,
    createdAt,
  }));
}

/**
 * Plan a bulk application WITHOUT committing it.
 *
 * Returns everything the UI needs to show Monica exactly what will happen
 * before it happens — same principle as the drip dry-run. She has 6,042 leads;
 * an action that quietly generates forty thousand tasks is not something she
 * should discover afterwards.
 */
export function previewBulkApply(plan, selectedLeads, existingTasks, startYMD) {
  const eligible = [];
  const skipped = [];
  for (const lead of selectedLeads || []) {
    if (!lead || !lead.id) continue;
    if (isOnPlan(existingTasks, lead.id, plan?.id)) skipped.push(lead);
    else eligible.push(lead);
  }
  const stepCount = plan?.steps?.length || 0;
  const taskCount = eligible.length * stepCount;
  const overCap = taskCount > MAX_BULK_TASKS;
  // How many leads WOULD fit, so the message can tell her what to do rather
  // than just refusing.
  const maxLeads = stepCount ? Math.floor(MAX_BULK_TASKS / stepCount) : 0;
  return {
    eligible, skipped, stepCount, taskCount, overCap, maxLeads,
    validStart: !!addDaysISO(startYMD, 0),
  };
}

/** Commit a bulk application. Returns the new tasks to append. */
export function buildBulkTasks(plan, eligibleLeads, startYMD, idFn) {
  const out = [];
  for (const lead of eligibleLeads || []) {
    out.push(...planTasksForLead(plan, lead, startYMD, idFn));
  }
  return out;
}
