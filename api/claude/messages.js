/**
 * Vercel Serverless Function — AI Proxy
 *
 * The React app POSTs to /api/claude/messages expecting Anthropic's response
 * shape: { content: [{type:"text", text: "..."}] }
 *
 * We try providers in order:
 *   1. ANTHROPIC_API_KEY → Anthropic Claude (best quality, paid)
 *   2. GOOGLE_GEMINI_API_KEY → Google Gemini (free tier: 1500 req/day)
 *
 * Whichever responds first wins. Gemini's response is translated into
 * Anthropic's shape so the client doesn't care which provider answered.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const GEMINI_API_KEY    = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  if (!ANTHROPIC_API_KEY && !GEMINI_API_KEY) {
    return res.status(500).json({
      error: { message: 'No AI provider configured. Set ANTHROPIC_API_KEY or GOOGLE_GEMINI_API_KEY in Vercel env vars.' },
    });
  }

  // Try Anthropic first if configured
  if (ANTHROPIC_API_KEY) {
    try {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(req.body),
      });
      const data = await upstream.json();
      if (upstream.ok) return res.status(upstream.status).json(data);
      console.warn('[claude proxy] Anthropic failed, trying Gemini:', data?.error?.message || upstream.status);
      // fall through to Gemini
    } catch (err) {
      console.warn('[claude proxy] Anthropic exception, trying Gemini:', err.message);
    }
  }

  // Gemini fallback
  if (GEMINI_API_KEY) {
    try {
      const body = req.body || {};
      // Translate Anthropic messages → Gemini contents
      const contents = [];
      if (body.system) {
        // Gemini has a separate systemInstruction field on the request body
      }
      (body.messages || []).forEach((m) => {
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
        });
      });

      const geminiBody = {
        contents,
        generationConfig: {
          maxOutputTokens: body.max_tokens || 1500,
          temperature: body.temperature ?? 0.7,
        },
      };
      if (body.system) {
        geminiBody.systemInstruction = { parts: [{ text: body.system }] };
      }

      // gemini-1.5-flash-latest is the most universally-available free model
      // (gemini-2.0-flash sometimes shows quota 0 for new projects).
      const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(geminiBody),
      });
      const data = await upstream.json();
      if (!upstream.ok) {
        return res.status(upstream.status).json({
          error: { message: 'Gemini error: ' + (data?.error?.message || upstream.status) },
        });
      }
      // Translate Gemini response → Anthropic shape
      const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
      return res.status(200).json({
        id: 'gemini_' + Date.now(),
        type: 'message',
        role: 'assistant',
        model,
        content: [{ type: 'text', text }],
        stop_reason: data?.candidates?.[0]?.finishReason || 'end_turn',
        usage: {
          input_tokens: data?.usageMetadata?.promptTokenCount || 0,
          output_tokens: data?.usageMetadata?.candidatesTokenCount || 0,
        },
      });
    } catch (err) {
      return res.status(502).json({ error: { message: 'Gemini proxy error: ' + err.message } });
    }
  }

  return res.status(500).json({ error: { message: 'AI proxy: no provider succeeded' } });
}
