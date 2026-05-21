/**
 * Vercel Serverless Function — ElevenLabs unified proxy.
 *
 * Vercel Hobby plan caps at 12 serverless functions per deploy. We were over
 * the limit with 4 separate ElevenLabs endpoints. This single endpoint
 * dispatches on `?action=` to all 4 sub-operations:
 *
 *   GET  /api/elevenlabs?action=voices         → list available voices
 *   GET  /api/elevenlabs?action=usage          → current char usage / quota
 *   POST /api/elevenlabs?action=tts            → binary audio (legacy)
 *   POST /api/elevenlabs?action=tts-timestamps → JSON audio + word timings
 *
 * Client wrappers (autoReelVoice.js, AIStudio.jsx) call these via the
 * action-suffixed paths.
 */
export const config = {
  api: {
    bodyParser: { sizeLimit: '4mb' },
    responseLimit: '12mb',
  },
};

export default async function handler(req, res) {
  const API_KEY = process.env.ELEVENLABS_API_KEY;
  if (!API_KEY) {
    return res.status(400).json({ error: { message: 'ELEVENLABS_API_KEY not configured on the server' } });
  }

  const action = (req.query.action || '').toLowerCase();

  // GET /voices
  if (action === 'voices') {
    try {
      const upstream = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': API_KEY },
      });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) return res.status(upstream.status).json(data);
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      return res.status(200).json(data);
    } catch (e) {
      return res.status(502).json({ error: { message: 'ElevenLabs voices error: ' + e.message } });
    }
  }

  // GET /usage
  if (action === 'usage') {
    try {
      const upstream = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
        headers: { 'xi-api-key': API_KEY },
      });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) return res.status(upstream.status).json(data);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        character_count: data.character_count || 0,
        character_limit: data.character_limit || 0,
        tier: data.tier || 'free',
        next_character_count_reset_unix: data.next_character_count_reset_unix || null,
        can_extend_character_limit: !!data.can_extend_character_limit,
      });
    } catch (e) {
      return res.status(502).json({ error: { message: 'ElevenLabs usage error: ' + e.message } });
    }
  }

  // From here, POST only
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed for action=' + action } });
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

  // POST /tts — returns raw audio/mpeg bytes (legacy AIStudio caller)
  if (action === 'tts') {
    try {
      const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({ text, model_id: model, voice_settings: settings }),
      });
      if (!upstream.ok) {
        let payload;
        try { payload = await upstream.json(); }
        catch { payload = { error: { message: `ElevenLabs returned ${upstream.status}` } }; }
        return res.status(upstream.status).json(payload);
      }
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');
      const buffer = Buffer.from(await upstream.arrayBuffer());
      return res.status(200).send(buffer);
    } catch (e) {
      return res.status(502).json({ error: { message: 'ElevenLabs TTS error: ' + e.message } });
    }
  }

  // POST /tts-timestamps — returns { audioBase64, alignment, wordTimings }
  // for karaoke captioning. Used by AutoReel narration.
  if (action === 'tts-timestamps') {
    try {
      const upstream = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text, model_id: model, voice_settings: settings }),
        }
      );
      if (!upstream.ok) {
        let payload;
        try { payload = await upstream.json(); }
        catch { payload = { error: { message: `ElevenLabs returned ${upstream.status}` } }; }
        return res.status(upstream.status).json(payload);
      }
      const data = await upstream.json();
      const chars      = data?.alignment?.characters || [];
      const charStarts = data?.alignment?.character_start_times_seconds || [];
      const charEnds   = data?.alignment?.character_end_times_seconds   || [];

      // Walk characters and group into words
      const wordTimings = [];
      let buf = '', bufStart = null, bufEnd = null;
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
        alignment: { characters: chars, charStarts, charEnds },
        wordTimings,
      });
    } catch (e) {
      return res.status(502).json({ error: { message: 'ElevenLabs TTS-timestamps error: ' + e.message } });
    }
  }

  return res.status(400).json({
    error: { message: `Unknown action "${action}". Use voices | usage | tts | tts-timestamps` },
  });
}
