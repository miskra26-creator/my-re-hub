/**
 * aiResponder — shared AI drafting for the Lead Concierge.
 *
 * One Claude call returns BOTH an email response and a short SMS variant,
 * personalized to the lead. The shape: { emailSubject, emailBody, smsBody }.
 *
 * Used by:
 *  - AILeadResponderWorker (auto-fires on new inbox arrivals)
 *  - ContactDetail "Draft AI Reply" button (manual / per-lead)
 */

export async function draftLeadResponse({ lead, profile, agentVoice }) {
  const firstName = (lead.name || "").split(" ")[0] || "there";
  const agentName = profile?.name?.split(" ")[0] || "Monica";
  const agentFull = profile?.name || "Monica Iskra";
  const brokerage = profile?.brokerage || "RE/MAX Classic";
  const phone     = profile?.phone || "";

  const sys = `You are a senior real estate agent's executive assistant writing the first response to a NEW LEAD on the agent's behalf. The agent is ${agentFull} at ${brokerage}. ${agentVoice ? `Brand voice: ${agentVoice}.` : "Warm, direct, helpful, professional. Never pushy or salesy."}

Speed-to-lead matters: this message goes out within 60 seconds of the lead arriving. The lead expects a response from a HUMAN — write as ${agentName} herself. Be specific, reference what they inquired about, sound like a person. Never start with "Thank you for your interest" or "Hope this finds you well" — those are spam-filter triggers and agent-cliché markers.`;

  const prompt = `Draft both an email and a text message response to this lead.

LEAD DETAILS:
- Name: ${lead.name || "(unknown)"}
- Email: ${lead.email || "(none)"}
- Phone: ${lead.phone || "(none)"}
- Source: ${lead.source || "Web"}
- Type: ${lead.type || "Buyer"}
- Status: ${lead.status || "Hot Prospect"}
- Area / interest: ${lead.area || "(not specified)"}
- Budget: ${lead.budget ? `$${Number(lead.budget).toLocaleString()}` : "(not specified)"}
- Property they inquired about: ${lead.address || "(none specific)"}
- Their message/notes: ${lead.notes || "(none)"}

WRITE:
- A short, specific email subject line (under 60 chars; NOT "RE: your inquiry")
- An email body, 4-6 sentences, plain text, no markdown:
  - Open by addressing ${firstName} by first name
  - Reference SPECIFICALLY what they inquired about (the property address if known, or their search area + source like "Zillow")
  - Provide ONE piece of immediate value (a market insight, a clarifying question, or "I'll send 3 hand-picked listings")
  - Soft CTA: ask their best time for a 10-min call, or offer to send curated listings
  - Sign with "${agentName}" only (no extra signature block — gmail signature handles that)
- A 1-2 sentence SMS message (UNDER 160 chars total — count carefully):
  - Conversational, sounds like a real person texting
  - Reference their specific inquiry (property/area) if known
  - End with an open-ended question that invites a reply
  - End with "(Reply STOP to opt out.)" — this is 22 chars, plan accordingly
  - Identify yourself: "Hi [first name], this is ${agentName} with ${brokerage} —"

Return STRICT JSON only (no markdown fences, no explanation):
{
  "emailSubject": "...",
  "emailBody": "...",
  "smsBody": "..."
}`;

  const r = await fetch("/api/claude/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 900,
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
    emailSubject: parsed.emailSubject || "",
    emailBody:    parsed.emailBody || "",
    smsBody:      parsed.smsBody || "",
  };
}

// Default settings shape
export const DEFAULT_CONCIERGE_SETTINGS = {
  enabled: false,
  sources: {
    // Per-source enable flags. Sensible defaults — Monica can override.
    "Zillow":               true,
    "Realtor.com":          true,
    "Homes.com":            true,
    "BoldTrail":            true,
    "Sierra Interactive":   true,
    "Web":                  true,
    "Facebook Lead Ads":    false, // FB leads are low-intent — skip auto by default
    "Instagram":            false,
    "Webhook":              true,
  },
  channels: {
    email: true,
    sms:   true,
  },
  dailyCap: 30,             // Max auto-responses per calendar day
  quietHours: {             // Don't auto-respond outside these (local time)
    enabled: true,
    startHour: 8,           // 8 AM
    endHour: 21,            // 9 PM (still ok to respond up to 9pm)
  },
  requireEmail: true,       // If true, only auto-respond when lead has email (for email channel)
  requirePhone: true,       // If true, only auto-respond when lead has phone (for SMS channel)
};
