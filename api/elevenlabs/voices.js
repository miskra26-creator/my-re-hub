/**
 * Vercel Serverless Function — list available ElevenLabs voices.
 *
 * Returns the full voice library available to the user's account
 * (preset voices on free tier, plus any cloned/custom voices on paid tiers).
 */
export default async function handler(req, res) {
  const API_KEY = process.env.ELEVENLABS_API_KEY;
  if (!API_KEY) {
    return res.status(400).json({ error: { message: 'ELEVENLABS_API_KEY not configured on the server' } });
  }

  try {
    const upstream = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': API_KEY },
    });
    if (!upstream.ok) {
      let payload;
      try { payload = await upstream.json(); }
      catch { payload = { error: { message: `ElevenLabs returned ${upstream.status}` } }; }
      return res.status(upstream.status).json(payload);
    }
    const data = await upstream.json();
    // Pass through with a 5-min CDN cache — voices don't change often
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: { message: 'ElevenLabs proxy error: ' + e.message } });
  }
}
