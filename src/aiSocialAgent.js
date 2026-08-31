/**
 * aiSocialAgent — drafts replies to Facebook + Instagram comments in
 * Monica's voice, and detects buyer-intent for DM funneling.
 *
 * One Claude/Gemini call per comment via /api/claude/messages. Output
 * is structured JSON: { action, reply, dmFollowup, escalateReason }.
 *
 *   action: "reply" | "like_only" | "skip" | "escalate"
 *   reply: the public comment reply (if action=reply)
 *   dmFollowup: a private DM to send if buyer-intent detected (optional)
 *   escalateReason: human-readable reason if action=escalate
 *
 * Used by SocialEngagementWorker (auto-fires on new comments).
 */

export async function draftSocialReply({ comment, post, agent, agentVoice, postContext }) {
  const sys = `You are ${agent.name}'s social media reply engine. ${agent.name} is a top real estate agent at ${agent.brokerage || "Prime + Property Real Estate"} in Metro Detroit (Livonia, Plymouth, Northville, Novi, Canton — the I-275 corridor). She specializes in the $350K+ market.

${agentVoice ? `Brand voice: ${agentVoice}` : `Brand voice: warm, professional, direct, helpful. Never salesy. Always specific (mention neighborhoods, market stats, listings by name when relevant). Sound like a real local human — not a bot.`}

You reply to public Facebook and Instagram comments on her posts. The goal: maximize engagement (replies spawn more replies, lift algorithmic reach), build trust, and identify HOT BUYER/SELLER LEADS to follow up with via private DM.

Decision tree for each comment:
- If it's spam, single emoji, gibberish, or trying to sell HER something → action: "skip"
- If it's a generic compliment or friendly noise ("love this!", "🔥🔥", "great post") → action: "like_only" (no reply needed, save replies for substantive comments)
- If it's a question or substantive comment → action: "reply" with a 1-3 sentence thoughtful response
- If commenter shows BUYER OR SELLER INTENT ("how much?", "is this available?", "I'm thinking of selling", "looking in Plymouth") → action: "reply" AND include a "dmFollowup" — a private DM that moves them toward a 1:1 conversation
- If the comment is negative, accusatory, or asks for legal/contractual advice → action: "escalate" with an "escalateReason"

CRITICAL RULES:
- Replies are PUBLIC — assume the entire neighborhood is reading
- Never make pricing commitments, legal promises, or specific financial claims in public
- Never share private client info
- Keep replies SHORT (1-3 sentences max for engagement; longer reads as defensive)
- Match the commenter's energy: casual gets casual, formal gets formal
- Use first name if visible
- For buyer-intent: don't pitch in public, route to DM`;

  const prompt = `Decide how to respond to this comment.

POST CONTEXT:
- Caption/text: "${(post.message || post.caption || "(no caption)").slice(0, 400)}"
- Platform: ${post.platform || "facebook"}
${postContext ? `- Additional context: ${postContext}` : ""}

COMMENT:
- From: ${comment.fromName || "(unknown)"}
- Text: "${(comment.message || "").slice(0, 500)}"
- Comment ID: ${comment.id}

Return STRICT JSON only (no markdown fences):
{
  "action": "reply" | "like_only" | "skip" | "escalate",
  "reply": "the public reply text (only if action=reply, else empty string)",
  "dmFollowup": "the private DM text (only if buyer/seller intent detected, else empty string)",
  "escalateReason": "one-sentence reason (only if action=escalate, else empty string)"
}`;

  const r = await fetch("/api/claude/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      system: sys,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "AI proxy error");
  const text = (d.content?.[0]?.text || "").trim();
  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const parsed = JSON.parse(jsonText);
  return {
    action:         parsed.action || "skip",
    reply:          parsed.reply || "",
    dmFollowup:     parsed.dmFollowup || "",
    escalateReason: parsed.escalateReason || "",
  };
}

// Quick local pre-filter so we don't waste AI calls on obvious spam
export function looksLikeSpam(text) {
  if (!text || text.length < 2) return true;
  const t = text.toLowerCase().trim();
  // Single emoji or emojis-only
  if (/^[\s\p{Emoji}]+$/u.test(text)) return true;
  // Common spam patterns
  const spamPatterns = [
    /click.*link/, /check.*bio/, /dm.*for.*info/, /follow.*back/,
    /casino/, /crypto/, /bitcoin/, /forex/, /investment.*opportunity/,
    /grow.*followers/, /buy.*followers/, /increase.*engagement/,
    /onlyfans/, /content.*creator.*hiring/,
    /https?:\/\/(?!facebook|instagram|teamiskrasells|youtu)/, // links to non-trusted domains
  ];
  return spamPatterns.some((p) => p.test(t));
}

// Filter generic noise that shouldn't trigger AI either
export function isLowSignalComment(text) {
  if (!text) return true;
  const t = text.toLowerCase().trim();
  const noisePatterns = [
    /^(lol|haha|hehe|nice|cool|wow|awesome|amazing|love|love it|love this|so cute|🔥+|👏+|❤️+|😍+|👍+)$/,
    /^[\s\p{Emoji}.,!?]+$/u,
  ];
  return noisePatterns.some((p) => p.test(t));
}

export const DEFAULT_SOCIAL_SETTINGS = {
  enabled: false,
  facebook: {
    enabled: true,
    autoReply: true,
    autoLike: true,
  },
  instagram: {
    enabled: true,
    autoReply: true,
    autoLike: false, // IG business API doesn't support comment-likes
  },
  rules: {
    skipSpam: true,
    likeOnlyForNoise: true,    // Generic "love it!" → just like, don't reply
    enableDmFunnel: true,       // AI sends DM when buyer-intent detected
    escalateToInbox: true,      // Negative/legal comments flagged for review
    maxRepliesPerPost: 50,
    maxRepliesPerDay: 200,
    cooldownPerCommenter: 60,   // Don't reply twice to same person within X min
  },
  postsToWatch: 20,             // Watch the most recent N posts for new comments
  pollIntervalMinutes: 5,
};
