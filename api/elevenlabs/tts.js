/**
 * Vercel Serverless Function — ElevenLabs TTS proxy.
 *
 * The React app POSTs { voiceId, text } and gets back an audio/mpeg blob.
 * We keep the API key server-side via the ELEVENLABS_API_KEY env var.
 *
 * Free tier: 10,000 characters/month, all preset voices available.
 *
 * Model: eleven_turbo_v2_5 — fast (~1 sec / 100 chars), studio quality.
 * Switch to eleven_multilingual_v2 if she needs non-English narration.
 */
export const config = {
  api: {
    // Disable Vercel's default body-parser size limit — the audio response
    // can be up to a few MB.
    responseLimit: '8mb',
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const API_KEY = process.env.ELEVENLABS_API_KEY;
  if (!API_KEY) {
    return res.status(400).json({ error: { message: 'ELEVENLABS_API_KEY not configured on the server' } });
  }

  const { voiceId, text, modelId, voiceSettings } = req.body || {};
  if (!voiceId) return res.status(400).json({ error: { message: 'voiceId required' } });
  if (!text || !text.trim()) return res.status(400).json({ error: { message: 'text required' } });

  const model = modelId || 'eleven_turbo_v2_5';
  const settings = voiceSettings || {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.0,
    use_speaker_boost: true,
  };

  try {
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: settings,
      }),
    });

    if (!upstream.ok) {
      // Forward the structured error so the UI can show useful messages
      let payload;
      try { payload = await upstream.json(); }
      catch { payload = { error: { message: `ElevenLabs returned ${upstream.status}` } }; }
      return res.status(upstream.status).json(payload);
    }

    // Stream the audio response back to the client
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.status(200).send(buffer);
  } catch (e) {
    return res.status(502).json({ error: { message: 'ElevenLabs proxy error: ' + e.message } });
  }
}
