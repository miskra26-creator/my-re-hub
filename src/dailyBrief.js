/**
 * dailyBrief.js — "Today's Game Plan": the morning brief that answers the one
 * question that actually drives an agent's income — WHO DO I CALL TODAY?
 *
 * This does NOT make any AI calls at runtime (instant + free). It ranks and
 * merges intelligence you've ALREADY generated elsewhere in the Hub:
 *
 *   1. Tasks due today / overdue (Call & Text) — these are commitments you made.
 *   2. Database Intelligence scores (`db_intel_results`) — the AI's 90-day
 *      transaction-likelihood buckets, with per-lead reasons + scripts.
 *   3. Fallback ranking (status priority × how overdue) — so the brief is never
 *      empty even before you've run an AI scan.
 *
 * Anyone already contacted today (`outreach_log`) or dismissed today
 * (`brief_done`) drops off automatically.
 */

// Mirror DailyOutreach's status priority so the brief and the full tool agree.
const STATUS_PRIORITY = {
  "Past Client": 100, "Closed": 95, "Hot Prospect": 90, "Pending": 85,
  "Buyer": 70, "Seller": 70, "Buyer & Seller": 75, "Contact": 60,
  "Nurture 3-6 Months": 55, "Nurture 1+ Year": 45, "Buy/Sell Nurture": 50,
  "Casually Browsing": 30, "Trash": -100,
};

// Buckets from Database Intelligence, in the order they deserve attention today.
const BUCKET_RANK = { hot_revival: 5, buyer_signal: 4, seller_window: 3, touch_due: 2, cold: 0 };
const BUCKET_TAG = {
  hot_revival: "🔥 Hot revival",
  buyer_signal: "📈 Buyer signal",
  seller_window: "🏡 Sell window",
  touch_due: "💌 Overdue touch",
  cold: "❄ Cold",
};

const todayStr = () => new Date().toISOString().slice(0, 10);

function getLastContactDate(lead) {
  try {
    const activities = JSON.parse(localStorage.getItem(`activities_${lead.id}`) || "[]");
    const latestActivity = activities[0]?.createdAt;
    const fubLast = lead.meta?.fubLastCommunication?.created || lead.meta?.fubLastActivity?.created;
    const candidates = [latestActivity, fubLast, lead.updatedAt, lead.createdAt].filter(Boolean);
    if (!candidates.length) return null;
    return Math.max(...candidates.map((d) => new Date(d).getTime()));
  } catch { return null; }
}

const daysSince = (ts) => (ts ? Math.floor((Date.now() - ts) / 86400000) : 999);

function stalenessScore(dsl) {
  if (dsl > 365) return 80;
  if (dsl > 180) return 65;
  if (dsl > 90) return 50;
  if (dsl > 30) return 25;
  return 0;
}

function fallbackScript(lead) {
  const first = (lead.name || "there").split(" ")[0];
  const status = lead.status || "";
  const area = lead.area || (lead.address || "").split(",")[0] || "";
  if (status.includes("Past Client") || status === "Closed")
    return `Hey ${first}, it's Monica — was just thinking about you. How's the house treating you${area ? ` in ${area}` : ""}? Anyone you know thinking about buying or selling?`;
  if (status.includes("Hot") || status === "Pending")
    return `Hi ${first}, Monica here — where are you at on your home search${area ? ` in ${area}` : ""}? Market's been moving. Want to grab 10 min this week?`;
  if (status.includes("Nurture") || status === "Casually Browsing")
    return `Hey ${first}, Monica — it's been a minute. Still keeping an eye on${area ? ` ${area}` : " the market"}? Seeing some interesting movement and thought of you. No pressure.`;
  return `Hi ${first}, Monica here — wanted to see how things are going and whether there's anything real-estate-wise I can help with.`;
}

/**
 * Build today's ranked brief.
 * @returns Array<{ leadId, name, phone, email, why, action, script, tag, priority, source }>
 */
export function buildDailyBrief({ leads = [], tasks = [], scored = null, outreachLog = [], doneIds = [], limit = 6 } = {}) {
  const today = todayStr();
  const leadById = new Map(leads.map((l) => [l.id, l]));

  const contactedToday = new Set(
    (outreachLog || []).filter((e) => (e.ts || "").slice(0, 10) === today).map((e) => e.leadId)
  );
  const done = new Set(doneIds || []);
  const skip = (leadId) => (leadId && contactedToday.has(leadId)) || (leadId && done.has(leadId));

  const items = [];
  const seen = new Set();
  const push = (it) => {
    // dedupe by leadId when we have one; task-only items dedupe by task id
    const key = it.leadId || it.taskId;
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    items.push(it);
  };

  // ── Tier 1: Tasks due today or overdue (Call / Text / Email). Commitments first.
  const actionTaskTypes = { Call: "call", Text: "text", Email: "email" };
  (tasks || [])
    .filter((t) => !t.completed && t.dueDate && t.dueDate <= today && actionTaskTypes[t.type])
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))
    .forEach((t) => {
      if (skip(t.leadId)) return;
      const lead = t.leadId ? leadById.get(t.leadId) : null;
      const overdue = t.dueDate < today;
      push({
        leadId: t.leadId || null,
        taskId: t.id,
        name: t.leadName || lead?.name || t.title || "Task",
        phone: lead?.phone || "",
        email: lead?.email || t.leadEmail || "",
        why: overdue ? `Task overdue since ${t.dueDate}${t.campaignName ? ` · ${t.campaignName}` : ""}` : `Task due today${t.campaignName ? ` · ${t.campaignName}` : ""}`,
        action: actionTaskTypes[t.type],
        script: t.smsBody || t.notes || (lead ? fallbackScript(lead) : ""),
        tag: overdue ? "⏰ Overdue task" : "📋 Due today",
        priority: 1000 + stalenessScore(daysSince(t.dueDate ? new Date(t.dueDate).getTime() : null)),
        source: "task",
      });
    });

  // ── Tier 2: Database Intelligence AI scores (if a scan has been run).
  if (Array.isArray(scored) && scored.length) {
    scored
      .filter((l) => l.intel && (l.intel.bucket || "cold") !== "cold")
      .map((l) => ({ l, br: BUCKET_RANK[l.intel.bucket] || 0, sc: Number(l.intel.score) || 0 }))
      .sort((a, b) => b.br - a.br || b.sc - a.sc)
      .forEach(({ l }) => {
        if (skip(l.id)) return;
        if (!l.phone && !l.email) return;
        push({
          leadId: l.id,
          name: l.name || "Lead",
          phone: l.phone || "",
          email: l.email || "",
          why: l.intel.reason || "",
          action: l.intel.suggestedAction || "text",
          script: l.intel.suggestedScript || fallbackScript(l),
          tag: BUCKET_TAG[l.intel.bucket] || "",
          priority: 500 + (BUCKET_RANK[l.intel.bucket] || 0) * 10 + (Number(l.intel.score) || 0),
          source: "intel",
        });
      });
  }

  // ── Tier 3: Fallback ranking (status × staleness) — keeps the brief useful
  // even with no AI scan yet.
  (leads || [])
    .filter((l) => l.status !== "Trash" && (l.phone || l.email))
    .map((l) => {
      const dsl = daysSince(getLastContactDate(l));
      const p = (STATUS_PRIORITY[l.status] || 50) + stalenessScore(dsl);
      return { l, p, dsl };
    })
    .filter(({ dsl }) => dsl > 30) // don't nag people touched in the last month
    .sort((a, b) => b.p - a.p)
    .forEach(({ l, p, dsl }) => {
      if (skip(l.id)) return;
      push({
        leadId: l.id,
        name: l.name || "Lead",
        phone: l.phone || "",
        email: l.email || "",
        why: `${l.status || "Contact"} · ${dsl >= 999 ? "never contacted" : `${dsl} days since last touch`}`,
        action: l.phone ? "text" : "email",
        script: fallbackScript(l),
        tag: "📇 Overdue",
        priority: p,
        source: "fallback",
      });
    });

  return items.sort((a, b) => b.priority - a.priority).slice(0, limit);
}
