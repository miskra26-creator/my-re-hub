/**
 * Vercel Serverless Function — current ElevenLabs character usage / quota.
 *
 * Returns a flat shape with the fields the UI cares about:
 *   { character_count, character_limit, tier, next_character_count_reset_unix }
 */
export default async function handler(req, res) {
  const API_KEY = process.env.ELEVENLABS_API_KEY;
  if (!API_KEY) {
    return res.status(400).json({ error: { message: 'ELEVENLABS_API_KEY not configured on the server' } });
  }

  try {
    const upstream = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': API_KEY },
    });
    if (!upstream.ok) {
      let payload;
      try { payload = await upstream.json(); }
      catch { payload = { error: { message: `ElevenLabs returned ${upstream.status}` } }; }
      return res.status(upstream.status).json(payload);
    }
    const data = await upstream.json();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      character_count: data.character_count || 0,
      character_limit: data.character_limit || 0,
      tier: data.tier || 'free',
      next_character_count_reset_unix: data.next_character_count_reset_unix || null,
      can_extend_character_limit: !!data.can_extend_character_limit,
    });
  } catch (e) {
    return res.status(502).json({ error: { message: 'ElevenLabs proxy error: ' + e.message } });
  }
}
