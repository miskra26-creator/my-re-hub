/**
 * aiClosingMultiplier — turn every closing into 6 pieces of marketing content.
 *
 * Most agents close a deal and the marketing fades. Top producers turn every
 * win into compounding social proof: IG reel, FB post, email to sphere,
 * postcard, Google review request, "lessons" thread. One closing = 6 assets.
 *
 * One AI call generates all 6 in structured JSON.
 */

export async function multiplyClosing({ closing, agent, agentVoice }) {
  const sys = `You are ${agent.name}'s marketing engine. She just closed a deal and you're going to turn it into 6 pieces of social proof content for her sphere, IG, FB, postcards, and a review request.

${agentVoice ? `Brand voice: ${agentVoice}` : `Brand voice: warm, specific, never braggy. Stats and stories beat adjectives. Sound like a real human, not a marketing template.`}

CRITICAL RULES:
- Reference the SPECIFIC deal details (DOM, % of list, neighborhood) — these create credibility.
- Never name the buyer/seller publicly without explicit consent (use "my buyer" / "my seller" / "this family" / their first name only if the agent listed it).
- IG/FB posts should hook in the first sentence. No "I'm thrilled to announce" openers — those scream agent-template.
- Postcards: very short, scannable, ends with a value-prop ("Curious what YOUR home would sell for?").
- Review requests: written as if FROM the agent TO the client, in a tone they'd actually send to a friend, not corporate.`;

  const prompt = `Generate marketing content for this just-closed deal.

DEAL DETAILS:
- Property: ${closing.address || "(not specified)"}, ${closing.neighborhood || closing.city || "Metro Detroit"}
- Type: ${closing.dealType || "Closed"} (listing side / buyer side / dual)
- Sale price: ${closing.salePrice ? `$${Number(closing.salePrice).toLocaleString()}` : "(not specified)"}
- List price: ${closing.listPrice ? `$${Number(closing.listPrice).toLocaleString()}` : "(not specified)"}
- Days on market: ${closing.dom || "(not specified)"}
- Beds/Baths/Sqft: ${closing.beds||"?"}BR/${closing.baths||"?"}BA/${closing.sqft||"?"}sqft
- Client first name (for review request only): ${closing.clientFirstName || "(not specified)"}
- Agent's notes about what made this deal special: ${closing.notes || "(none — make it generic but warm)"}
${closing.salePrice && closing.listPrice ? `- Sale-to-list ratio: ${Math.round((closing.salePrice/closing.listPrice)*100)}% of list` : ""}

GENERATE 6 ASSETS. Return STRICT JSON only (no markdown fences):
{
  "instagramReel": {
    "hook": "first 3-second on-screen hook text (under 60 chars, attention-grabbing)",
    "script": "full 30-60 sec voiceover script in spoken English (no markdown)",
    "broll": "1-2 sentences describing the visual footage to shoot",
    "caption": "the IG caption, 2-4 sentences, ends with hashtags"
  },
  "facebookPost": "full FB post text, 3-5 sentences, conversational, hookey first line, no hashtags",
  "sphereEmail": {
    "subject": "specific subject line (under 60 chars)",
    "body": "4-6 sentence email to her sphere, plain text, warm, sign-off 'Monica' only"
  },
  "postcard": {
    "headline": "the BIG text on the postcard (under 8 words)",
    "subhead": "supporting line under headline (under 15 words)",
    "cta": "the call-to-action with a clear next step (under 12 words)"
  },
  "googleReviewRequest": {
    "subject": "a subject for the email asking for the review",
    "body": "the email body, warm, specific to their deal, includes the actual Google review link placeholder [REVIEW_LINK], 3-5 sentences"
  },
  "lessonsThread": "1 short paragraph (3-5 sentences) framed as a teaching moment for other agents OR consumers — what this deal proves about the market"
}`;

  const r = await fetch("/api/claude/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2500,
      system: sys,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "AI proxy error");
  const text = (d.content?.[0]?.text || "").trim();
  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(jsonText);
}
