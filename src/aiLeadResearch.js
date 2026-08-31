/**
 * AI Lead Research — builds a prep brief on a prospect using live PUBLIC web
 * search (Gemini Google Search grounding, free tier).
 *
 * It combines whatever the agent supplies (name / email / phone / address /
 * city + any CRM notes) with what the model can find on the public web, then
 * returns a structured brief. It can only surface PUBLIC information — it
 * cannot access private Instagram/Facebook accounts or paywalled people-search
 * data, and it is instructed never to fabricate profiles or URLs.
 */

function buildSubject(input) {
  const lines = [];
  if (input.name) lines.push(`Name: ${input.name}`);
  if (input.email) lines.push(`Email: ${input.email}`);
  if (input.phone) lines.push(`Phone: ${input.phone}`);
  if (input.address) lines.push(`Address: ${input.address}`);
  if (input.city) lines.push(`City/Area: ${input.city}`);
  if (input.company) lines.push(`Company/employer: ${input.company}`);
  if (input.social) lines.push(`Known handle/profile: ${input.social}`);
  if (input.notes) lines.push(`What the agent already knows (CRM notes):\n${input.notes}`);
  return lines.join('\n');
}

const SYSTEM = `You are a real estate prospect researcher for Monica Iskra, a Prime + Property Real Estate luxury agent in Metro Detroit. You use live Google Search to find PUBLIC information about a person so Monica can walk into a conversation prepared. You only report what you can actually find or reasonably infer — you NEVER fabricate facts, profiles, or URLs. If you cannot confirm something, say so and lower the confidence. Always separate FACTS you found online from INFERENCES you are making.`;

export async function researchLead(input) {
  const subject = buildSubject(input);
  const prompt = `Research this person on the public web and build a real-estate prep brief.

SUBJECT:
${subject}

Use Google Search to find their public footprint — public Facebook/Instagram/LinkedIn or business profiles, their employer/role, news, reviews, or real-estate activity (a recent move, a listing, a business they run). Cross-check the email / phone / city to make sure you have the RIGHT person. If the name is common and you cannot disambiguate, set confidence LOW and explain why.

Return ONLY a valid JSON object (no markdown fences, no preamble) with EXACTLY these fields:
{
  "identity": "1-2 sentences: who this person most likely is (role, location).",
  "confidence": "HIGH | MEDIUM | LOW",
  "confidenceWhy": "1 sentence on why this confidence level (e.g. unique email matched, or common name couldn't be confirmed).",
  "found": ["short bullets of FACTS found online, each ending with the source in (parentheses)"],
  "profiles": [{"platform": "Facebook | Instagram | LinkedIn | Company | Other", "url": "the public url you found", "note": "what's on it"}],
  "propertyContext": "What you can tell about their property situation / neighborhood / market, or 'Unknown'.",
  "signals": ["buyer/seller/timeline signals — label each as an inference"],
  "talkingPoints": ["3-5 personalized rapport hooks Monica can open with"],
  "questionsToAsk": ["3-5 smart discovery questions for the conversation"],
  "approach": "1-2 sentences on how Monica should approach this person.",
  "gaps": ["what you could NOT find / what Monica should verify herself"]
}

Rules:
- Only include a profile URL if you ACTUALLY found it via search. Never guess or construct a URL.
- Empty arrays are fine if you found nothing for that field — do not pad with filler.
- Keep every line honest and specific to what the search actually returned.`;

  const r = await fetch('/api/claude/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 3000,
      temperature: 0.4,
      google_search: true,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data?.error?.message || `AI error ${r.status}`);

  const text = (data?.content?.[0]?.text || '').trim();
  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let brief;
  try {
    brief = JSON.parse(jsonText);
  } catch {
    const m = jsonText.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Could not parse the research result — try again.');
    brief = JSON.parse(m[0]);
  }
  // Attach the real public sources the model grounded on (from the proxy).
  brief.sources = Array.isArray(data.grounding) ? data.grounding : [];
  return brief;
}

// Flatten a brief into plain text for clipboard / saving to lead notes.
export function briefToText(brief, input) {
  const L = [];
  L.push(`LEAD RESEARCH — ${input.name || input.email || input.phone || 'Prospect'}`);
  L.push(`Confidence: ${brief.confidence || '?'}${brief.confidenceWhy ? ` (${brief.confidenceWhy})` : ''}`);
  L.push('');
  if (brief.identity) L.push(brief.identity);
  if (brief.found?.length) { L.push('', 'FOUND ONLINE:'); brief.found.forEach(f => L.push(`• ${f}`)); }
  if (brief.profiles?.length) { L.push('', 'PROFILES:'); brief.profiles.forEach(p => L.push(`• ${p.platform}: ${p.url}${p.note ? ` — ${p.note}` : ''}`)); }
  if (brief.propertyContext) L.push('', `PROPERTY/AREA: ${brief.propertyContext}`);
  if (brief.signals?.length) { L.push('', 'SIGNALS:'); brief.signals.forEach(s => L.push(`• ${s}`)); }
  if (brief.talkingPoints?.length) { L.push('', 'TALKING POINTS:'); brief.talkingPoints.forEach(t => L.push(`• ${t}`)); }
  if (brief.questionsToAsk?.length) { L.push('', 'QUESTIONS TO ASK:'); brief.questionsToAsk.forEach(q => L.push(`• ${q}`)); }
  if (brief.approach) L.push('', `APPROACH: ${brief.approach}`);
  if (brief.gaps?.length) { L.push('', 'STILL UNKNOWN:'); brief.gaps.forEach(g => L.push(`• ${g}`)); }
  if (brief.sources?.length) { L.push('', 'SOURCES:'); brief.sources.forEach(s => L.push(`• ${s.title || s.url}: ${s.url}`)); }
  return L.join('\n');
}
