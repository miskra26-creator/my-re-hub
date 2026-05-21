/**
 * aiVoiceTrainer — analyzes Monica's actual writing to extract a voice profile
 * that gets injected into every other AI feature (Concierge, Social Agent,
 * Closing Multiplier, drips, etc.) so they sound like HER, not like ChatGPT.
 *
 * Workflow:
 *  1. Collect 20-50 of her recent posts / captions / comments / sent emails
 *  2. Send to AI with a structured analysis prompt
 *  3. AI returns: tone, sentence patterns, signature phrases, emoji habits,
 *     sign-offs, what to AVOID. Plus a one-paragraph "use this as voice
 *     guidance" string for downstream features.
 *  4. Save that paragraph as `agent_voice` in localStorage. Done.
 */

/**
 * Analyze a corpus of samples and return a structured voice profile.
 *   samples: array of strings (posts, captions, emails — any prose she's written)
 */
export async function trainVoice(samples) {
  if (!samples || !samples.length) throw new Error("No samples to analyze");
  // Cap each sample to 500 chars and the total to ~50 samples to fit the context
  const trimmed = samples
    .filter(s => s && typeof s === "string" && s.trim().length > 10)
    .slice(0, 50)
    .map(s => s.slice(0, 500).trim());

  if (!trimmed.length) throw new Error("All samples were too short or empty");

  const sys = `You are a linguistic analyst specializing in personal-brand voice extraction. The user is a real estate agent who wants the AI tools in her CRM to write in HER voice — not a generic agent voice. You'll get a corpus of her real writing. Your job: extract the patterns that make her writing recognizably HERS, and write voice guidance the downstream AI features can use.

Be specific. "Warm and professional" is useless. "Opens posts with a question or stat — never with 'Excited to announce' — uses 'y'all' occasionally, signs IG captions with 🏡✨, prefers em-dashes over semicolons" is useful.`;

  const prompt = `Analyze this corpus of writing samples from one person. Extract her voice and produce a profile.

CORPUS (${trimmed.length} samples):
${trimmed.map((s, i) => `--- Sample ${i+1} ---\n${s}`).join("\n\n")}

Return STRICT JSON only (no markdown fences):
{
  "summary": "1-2 sentences capturing the overall vibe",
  "tone": "list of tone descriptors (warm, direct, sarcastic, etc.)",
  "sentencePatterns": "describe sentence length, rhythm, structure habits",
  "signaturePhrases": ["array of specific phrases or words she actually uses repeatedly"],
  "openings": "how she typically OPENS posts — give concrete patterns, not platitudes",
  "closings": "how she typically signs off / closes — exact patterns",
  "emojiHabits": "which emojis appear, how often, what context",
  "topics": "list of topics/themes she returns to (e.g., family, neighborhood spotlights, market education)",
  "avoidances": "things she NEVER does (e.g., 'never uses #hashtag stuffing', 'never opens with Excited to announce', 'never uses corporate jargon')",
  "voiceGuidance": "FINAL OUTPUT: a 4-6 sentence paragraph the downstream AI should follow when writing as her. Concrete, prescriptive, includes 2-3 specific phrases or moves from the corpus. This is what gets injected as 'agent_voice' into every other AI feature."
}`;

  const r = await fetch("/api/claude/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
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
