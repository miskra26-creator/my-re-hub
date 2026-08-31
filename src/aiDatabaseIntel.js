/**
 * aiDatabaseIntel — finds money hidden in Monica's existing 6000+ leads.
 *
 * Reality check: 80% of agents lose 80% of their lead value because they
 * stop following up after 2-3 touches. NAR data: median 11 months from
 * first contact to close. Most agents' "cold" leads are actually warm
 * leads they forgot about.
 *
 * This module batches leads through Claude/Gemini and asks the AI to
 * score each one's transaction likelihood + recommend a next action,
 * grouped into actionable buckets.
 */

/**
 * Score a batch of leads. Returns an array of { id, score, bucket,
 * reason, suggestedAction, suggestedScript }.
 *
 * Buckets:
 *   "hot_revival"     — high-intent signals in history, but neglected
 *   "buyer_signal"    — recent signs of buying readiness
 *   "seller_window"   — past clients at 5+ years (typical sell window)
 *   "touch_due"       — sphere/SOI contacts due for a check-in
 *   "cold"            — truly cold, suggest archive or quarterly nurture
 */
export async function scoreLeadBatch(leads) {
  if (!leads.length) return [];

  // Compress lead data so we can fit more in the prompt
  const compactLeads = leads.map((l) => ({
    id: l.id,
    name: l.name || "",
    source: l.source || "",
    status: l.status || "",
    type: l.type || "",
    area: l.area || "",
    budget: l.budget || "",
    tags: (l.tags || []).slice(0, 6),
    notes: (l.notes || "").slice(0, 250),
    createdAt: l.createdAt || "",
    followUp: l.followUp || "",
  }));

  const sys = `You are a real estate database analyst. The agent is Monica Iskra in Metro Detroit ($350K+ market on the I-275 corridor). Her database has 6000+ leads; most are cold or stale. Your job: identify which ones are HIDDEN OPPORTUNITIES worth re-engaging.

Score each lead from 1-10 on likelihood-to-transact-in-the-next-90-days. Use signals like:
- Source quality (Zillow/Realtor.com = high; FB Lead Ad = low; Past Client = high for repeat/referral)
- Status (Hot Prospect = high; Nurture 1+ Year = lower but not zero; Past Client = high lifetime value)
- Notes content (specific timeline, mentions of life events like job/baby/divorce, recent communication = high)
- Type (Buyer in this market = active; Seller = highest value)
- Tags (any indicators of urgency, specific neighborhood, financing status)
- Timestamps (createdAt > 1 year ago = probably stale unless other strong signals)

Group each lead into ONE bucket:
- "hot_revival"   — score ≥ 7, but clearly hasn't been worked recently. The "I forgot about this one!" leads.
- "buyer_signal"  — score 5-9, with active buying signals in their notes/status/tags.
- "seller_window" — Past Client with createdAt 4-7 years ago (typical sell window in this market).
- "touch_due"     — SOI/sphere/past client overdue for a non-pushy check-in. Score reflects nurture value, not transaction likelihood.
- "cold"          — score ≤ 3, no signals. Suggest archive or quarterly nurture.

For each, provide:
- A 1-sentence "reason" explaining the score (cite the specific signal)
- A "suggestedAction": one of ["text", "call", "email", "drip", "archive"]
- A "suggestedScript": 1-2 sentences of what to text/say (NOT generic — reference what's in their notes/area)

Be HONEST: don't inflate scores. If 90% of the batch is genuinely cold, say so.`;

  const prompt = `Analyze and score these leads. Return STRICT JSON only — an array of objects, one per lead, in the same order.

LEADS (${compactLeads.length}):
${JSON.stringify(compactLeads, null, 1)}

Return format:
[
  {
    "id": "<lead_id>",
    "score": 1-10,
    "bucket": "hot_revival" | "buyer_signal" | "seller_window" | "touch_due" | "cold",
    "reason": "...",
    "suggestedAction": "text" | "call" | "email" | "drip" | "archive",
    "suggestedScript": "..."
  },
  ...
]`;

  const r = await fetch("/api/claude/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: sys,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "AI proxy error");
  const text = (d.content?.[0]?.text || "").trim();
  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    // Sometimes the model wraps in {"results":[...]} or returns truncated JSON
    const arrMatch = jsonText.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try { parsed = JSON.parse(arrMatch[0]); } catch { throw new Error("AI returned malformed JSON"); }
    } else {
      throw new Error("AI returned non-array response");
    }
  }
  if (!Array.isArray(parsed)) throw new Error("AI returned non-array response");
  return parsed;
}

// ── Rate limiting for the FREE Gemini tier ─────────────────────────────────
// The free tier caps generate_content at ~20 requests/minute. The old code
// fired a batch every 250ms (~240/min) and instantly hit HTTP 429 "quota
// exceeded", so nearly every batch failed and the whole scan returned ~0
// results in a few seconds. We now throttle to stay safely under the limit and
// retry (honoring Gemini's "retry in Xs" hint) instead of silently dropping.
const RL = { max: 14, windowMs: 65000, hits: [] };
async function rateLimitSlot() {
  while (true) {
    const t = Date.now();
    RL.hits = RL.hits.filter((h) => t - h < RL.windowMs);
    if (RL.hits.length < RL.max) { RL.hits.push(t); return; }
    const waitMs = RL.windowMs - (t - RL.hits[0]) + 100;
    await new Promise((r) => setTimeout(r, Math.max(300, waitMs)));
  }
}

function parseRetrySeconds(msg) {
  const m = /retry in ([\d.]+)\s*s/i.exec(msg || "");
  return m ? Math.ceil(parseFloat(m[1])) : null;
}

async function scoreBatchWithRetry(batch, { maxRetries = 4 } = {}) {
  let attempt = 0;
  while (true) {
    await rateLimitSlot();
    try {
      return await scoreLeadBatch(batch);
    } catch (e) {
      const msg = e?.message || String(e);
      const isQuota = /429|quota|exceeded|rate limit/i.test(msg);
      if (++attempt > maxRetries) throw e;
      const retryS = parseRetrySeconds(msg);
      const backoff = retryS != null ? retryS * 1000 : Math.min(60000, 1500 * 2 ** attempt);
      if (isQuota) RL.hits = []; // reset our window so we pace fresh after a throttle
      await new Promise((r) => setTimeout(r, backoff + 300));
    }
  }
}

// Score the most valuable leads FIRST, so a partial or interrupted run still
// surfaces the money (higher weight = scored sooner).
const STATUS_W = {
  "Past Client": 100, "Hot Prospect": 90, Pending: 85, "Buyer & Seller": 76,
  Seller: 72, Buyer: 70, Contact: 55, "Nurture 3-6 Months": 55,
  "Nurture 1+ Year": 45, "Casually Browsing": 30,
};
function leadPriority(l) {
  let s = STATUS_W[l.status] ?? 50;
  if ((l.notes || "").trim().length > 20) s += 25; // real notes = more signal
  if (l.phone) s += 8;
  if (l.email) s += 4;
  return s;
}

/**
 * Score ALL leads by batching, PACED to respect the free Gemini rate limit.
 * Calls onProgress(done, total) after each batch, and onPartial(batchScored)
 * with each batch's freshly-scored leads so the caller can persist + display
 * incrementally (so a quota cap or a closed tab never loses prior work).
 * Pass alreadyScoredIds (Set/array) to skip leads already scored — enables resume.
 * Returns the newly-scored objects merged with original lead data.
 */
export async function scoreAllLeads(leads, { batchSize = 25, onProgress, onPartial, alreadyScoredIds } = {}) {
  const skip = alreadyScoredIds instanceof Set ? alreadyScoredIds : new Set(alreadyScoredIds || []);
  const eligible = leads
    .filter((l) => l.name && !["Trash", "Closed"].includes(l.status) && !skip.has(l.id))
    .sort((a, b) => leadPriority(b) - leadPriority(a));
  const total = eligible.length;
  const byId = new Map(eligible.map((l) => [l.id, l]));
  const scored = [];

  for (let i = 0; i < eligible.length; i += batchSize) {
    const batch = eligible.slice(i, i + batchSize);
    try {
      const results = await scoreBatchWithRetry(batch);
      const batchScored = [];
      results.forEach((r) => {
        const lead = byId.get(r.id);
        if (!lead) return;
        const s = { ...lead, intel: r };
        scored.push(s);
        batchScored.push(s);
      });
      if (batchScored.length) onPartial?.(batchScored);
    } catch (e) {
      console.warn(`[DatabaseIntel] batch ${i}-${i + batch.length} failed after retries:`, e.message);
      // Keep going — one bad batch shouldn't sink the whole scan.
    }
    onProgress?.(Math.min(i + batchSize, total), total);
  }
  return scored;
}

/**
 * Group scored leads into the 5 actionable buckets, sorted by score desc
 * within each bucket.
 */
export function groupByBucket(scoredLeads) {
  const buckets = {
    hot_revival:   [],
    buyer_signal:  [],
    seller_window: [],
    touch_due:     [],
    cold:          [],
  };
  scoredLeads.forEach((l) => {
    const b = l.intel?.bucket || "cold";
    if (buckets[b]) buckets[b].push(l);
  });
  Object.keys(buckets).forEach((k) => {
    buckets[k].sort((a, b) => (b.intel?.score || 0) - (a.intel?.score || 0));
  });
  return buckets;
}

export const BUCKET_META = {
  hot_revival: {
    label: "🔥 Hot Revival Opportunities",
    desc: "High-intent signals in their history but nobody's touched them recently. The 'I forgot about this one!' bucket — usually where the money is hiding.",
    color: "#DC2626",
  },
  buyer_signal: {
    label: "📈 Showing Buyer Signals",
    desc: "Active intent indicators in their notes, status, or recent activity. Worth a 60-sec text today.",
    color: "#1A5AA0",
  },
  seller_window: {
    label: "🏡 Past Clients in the Sell Window",
    desc: "4-7 years since you closed for them — statistically the highest-probability sell window. Soft check-in + equity update wins listings.",
    color: "#16A34A",
  },
  touch_due: {
    label: "💌 Sphere / Past Clients Overdue for Touch",
    desc: "Long-term nurture overdue. Not a pitch — a relationship moment. Drives the 25% sphere referral rate when done right.",
    color: "#C99A2C",
  },
  cold: {
    label: "❄ Truly Cold (Consider Archive)",
    desc: "Low signal across the board. Suggest archive to keep your active database clean, or drop into a quarterly market-update drip.",
    color: "#6B7280",
  },
};
