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
      // google_search is a Gemini-only flag; strip it before forwarding to Anthropic.
      const { google_search, ...anthropicBody } = req.body || {};
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(anthropicBody),
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
      // Translate Anthropic messages → Gemini contents.
      // Handles both string content and structured content arrays — the latter
      // supports vision: { type:'image', source:{ type:'base64', media_type, data } }
      // ↔ Gemini's parts: [{ inlineData: { mimeType, data } }, { text }]
      const contents = [];
      (body.messages || []).forEach((m) => {
        const parts = [];
        const content = m.content;
        if (typeof content === 'string') {
          parts.push({ text: content });
        } else if (Array.isArray(content)) {
          content.forEach((block) => {
            if (block.type === 'text') {
              parts.push({ text: block.text || '' });
            } else if (block.type === 'image' && block.source) {
              if (block.source.type === 'base64') {
                parts.push({
                  inlineData: {
                    mimeType: block.source.media_type || 'image/jpeg',
                    data: block.source.data,
                  },
                });
              } else if (block.source.type === 'url') {
                // Gemini doesn't accept URLs directly in inlineData — caller
                // should pre-fetch and base64-encode. Fallback: skip the image.
                parts.push({ text: `[image url: ${block.source.url}]` });
              }
            }
          });
        } else {
          parts.push({ text: JSON.stringify(content) });
        }
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts,
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
      // Live web research: enable Google Search grounding (free tier) so the
      // model can pull public info instead of relying on training data alone.
      if (body.google_search) {
        geminiBody.tools = [{ google_search: {} }];
      }

      // gemini-flash-latest is the most reliably-available free-tier model
      // as of Q2 2026. 2.0-flash and 2.0-flash-lite often show quota=0
      // for new accounts depending on region; flash-latest aliases to the
      // current-gen Flash model that always has free-tier traffic enabled.
      // Google regularly returns 503 "this model is experiencing high demand"
      // on the primary free model, which is fatal to a 20-minute batch scan.
      // Quotas and load are per-model, so fall through to siblings instead of
      // failing the request. GEMINI_MODEL, if set, overrides the whole list.
      // Ordered by preference. gemini-2.5-flash is retired ("no longer
      // available to new users") and 2.0-flash reports quota=0 on this account,
      // so the current-gen 3.x Flash models are the real fallbacks.
      const models = process.env.GEMINI_MODEL
        ? [process.env.GEMINI_MODEL]
        : ['gemini-flash-latest', 'gemini-3.6-flash', 'gemini-flash-lite-latest'];

      let upstream, data, model;
      for (const candidate of models) {
        model = candidate;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        upstream = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(geminiBody),
        });
        data = await upstream.json();
        if (upstream.ok) break;
        // Try the next model for anything except a credentials problem, which
        // will fail identically everywhere. Overload, quota, and model-retired
        // errors are all per-model and all worth stepping past.
        if (upstream.status === 401 || upstream.status === 403) break;
      }
      if (!upstream.ok) {
        return res.status(upstream.status).json({
          error: { message: 'Gemini error: ' + (data?.error?.message || upstream.status) },
        });
      }
      // Translate Gemini response → Anthropic shape
      const cand = data?.candidates?.[0];
      const text = cand?.content?.parts?.map(p => p.text).join('') || '';
      // Surface the public web sources the model grounded on, if any.
      const grounding = (cand?.groundingMetadata?.groundingChunks || [])
        .map(c => (c.web ? { title: c.web.title || c.web.uri, url: c.web.uri } : null))
        .filter(Boolean);
      return res.status(200).json({
        id: 'gemini_' + Date.now(),
        type: 'message',
        role: 'assistant',
        model,
        content: [{ type: 'text', text }],
        grounding,
        stop_reason: cand?.finishReason || 'end_turn',
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
