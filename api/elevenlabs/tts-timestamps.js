/**
 * Vercel Serverless Function — ElevenLabs TTS with word-level timing.
 *
 * Uses ElevenLabs' /text-to-speech/{voice}/with-timestamps endpoint, which
 * returns audio_base64 + per-character start/end times. This is what powers
 * AutoReel's karaoke-style burned-in captions where each word lights up as
 * it's spoken.
 *
 * Body:  { voiceId, text, modelId?, voiceSettings? }
 * Resp:  {
 *   audioBase64: "data:audio/mpeg;base64,...",
 *   alignment: {
 *     characters: [ 'H','e','l','l','o', ... ],
 *     charStarts: [ 0.0, 0.04, 0.08, ... ],   // seconds, length = chars.length
 *     charEnds:   [ 0.04, 0.08, 0.13, ... ],
 *   },
 *   wordTimings: [ { word, startSec, endSec }, ... ],  // derived for the client
 * }
 */
export const config = {
  api: { responseLimit: '12mb' },
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

  // turbo_v2_5 supports timestamps and is the fastest model
  const model = modelId || 'eleven_turbo_v2_5';
  const settings = voiceSettings || {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.0,
    use_speaker_boost: true,
  };

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: settings,
        }),
      }
    );

    if (!upstream.ok) {
      let payload;
      try { payload = await upstream.json(); }
      catch { payload = { error: { message: `ElevenLabs returned ${upstream.status}` } }; }
      return res.status(upstream.status).json(payload);
    }

    const data = await upstream.json();
    // ElevenLabs returns: { audio_base64, alignment: { characters, character_start_times_seconds, character_end_times_seconds } }
    const chars      = data?.alignment?.characters || [];
    const charStarts = data?.alignment?.character_start_times_seconds || [];
    const charEnds   = data?.alignment?.character_end_times_seconds   || [];

    // Walk characters and group into words. A "word" boundary is any run of
    // non-whitespace characters. We track the first char's start time and
    // last char's end time as the word's [startSec, endSec].
    const wordTimings = [];
    let buf = '';
    let bufStart = null;
    let bufEnd = null;
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      const isWS = /\s/.test(c);
      if (!isWS) {
        if (bufStart == null) bufStart = charStarts[i];
        bufEnd = charEnds[i];
        buf += c;
      } else if (buf) {
        wordTimings.push({ word: buf, startSec: bufStart, endSec: bufEnd });
        buf = ''; bufStart = null; bufEnd = null;
      }
    }
    if (buf) wordTimings.push({ word: buf, startSec: bufStart, endSec: bufEnd });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      audioBase64: 'data:audio/mpeg;base64,' + (data.audio_base64 || ''),
      alignment: {
        characters: chars,
        charStarts,
        charEnds,
      },
      wordTimings,
    });
  } catch (e) {
    return res.status(502).json({ error: { message: 'ElevenLabs proxy error: ' + e.message } });
  }
}
