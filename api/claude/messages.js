/**
 * Vercel Serverless Function — Claude API Proxy
 * Browsers can't call api.anthropic.com directly (CORS + key exposure),
 * so the React app POSTs to /api/claude/messages and we forward the call
 * to https://api.anthropic.com/v1/messages with ANTHROPIC_API_KEY attached.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: { message: 'ANTHROPIC_API_KEY not configured on the server' },
    });
  }

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
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({
      error: { message: 'Claude proxy error: ' + err.message },
    });
  }
}
