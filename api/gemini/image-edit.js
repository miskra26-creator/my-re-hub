/**
 * Vercel Serverless Function — Gemini 2.5 Flash Image proxy.
 *
 * Sends an image + prompt to Gemini's image generation model (codename
 * "Nano Banana") and returns the edited/generated image as base64.
 *
 * Used by:
 *   - /virtual-staging (standalone staging tab)
 *   - /auto-reel (auto-stages vacant rooms before rendering the reel)
 *
 * Free tier: 500 images/day on Monica's existing GOOGLE_GEMINI_API_KEY.
 * No credit card, no extra setup.
 *
 * Body:
 *   { imageBase64, mimeType, prompt, aspectRatio? }
 *
 * Response (success):
 *   { imageBase64, mimeType, textCommentary? }
 */
export const config = {
  api: {
    bodyParser: { sizeLimit: '8mb' },   // input photos can be a few MB
    responseLimit: '12mb',              // output PNG can be larger
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const API_KEY = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return res.status(400).json({ error: { message: 'GOOGLE_GEMINI_API_KEY not configured on the server' } });
  }

  const { imageBase64, mimeType, prompt, aspectRatio } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: { message: 'imageBase64 required' } });
  if (!prompt)      return res.status(400).json({ error: { message: 'prompt required' } });

  const model = 'gemini-2.5-flash-image';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

  const generationConfig = {
    responseModalities: ['TEXT', 'IMAGE'],
  };
  if (aspectRatio) {
    generationConfig.responseFormat = { image: { aspectRatio } };
  }

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
      ],
    }],
    generationConfig,
  };

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: { message: 'Gemini error: ' + (data?.error?.message || upstream.status) },
        raw: data,
      });
    }

    // Walk parts looking for the generated image
    const parts = data?.candidates?.[0]?.content?.parts || [];
    let imgPart = null;
    let textPart = '';
    for (const p of parts) {
      if (p.inlineData?.data || p.inline_data?.data) imgPart = p.inlineData || p.inline_data;
      else if (p.text) textPart += p.text;
    }

    if (!imgPart) {
      return res.status(502).json({
        error: { message: 'Gemini returned no image. It may have refused (safety policy) — try a different prompt or photo.' },
        text: textPart,
        raw: data,
      });
    }

    return res.status(200).json({
      imageBase64: imgPart.data,
      mimeType: imgPart.mimeType || imgPart.mime_type || 'image/png',
      textCommentary: textPart || null,
      usage: data?.usageMetadata || null,
    });
  } catch (e) {
    return res.status(502).json({ error: { message: 'Gemini proxy error: ' + e.message } });
  }
}
