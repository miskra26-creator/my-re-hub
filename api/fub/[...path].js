/**
 * Vercel Serverless Function — FUB API Proxy
 * Replaces the CRA dev proxy (setupProxy.js) for production.
 *
 * All requests to /api/fub/... are forwarded to
 * https://api.followupboss.com/v1/...
 * with the FUB API key injected server-side (never exposed to browser).
 */

export default async function handler(req, res) {
  const FUB_API_KEY = process.env.FUB_API_KEY;
  if (!FUB_API_KEY) {
    return res.status(500).json({ error: 'FUB_API_KEY not configured' });
  }

  // Parse the URL directly to avoid relying on Vercel's req.query.path
  // (which can be empty depending on how the route is invoked). Splits
  // "/api/fub/people/123?limit=10" into path="people/123" + query="limit=10".
  const rawUrl = req.url || '';
  const [pathOnly, rawQuery = ''] = rawUrl.split('?');
  const fubPath = pathOnly.replace(/^\/api\/fub\/?/, '');

  if (!fubPath) {
    return res.status(400).json({ error: 'Missing FUB path. Use e.g. /api/fub/people' });
  }

  const targetUrl = `https://api.followupboss.com/v1/${fubPath}${rawQuery ? '?' + rawQuery : ''}`;

  try {
    const fetchOptions = {
      method: req.method,
      headers: {
        'Authorization': 'Basic ' + Buffer.from(FUB_API_KEY + ':').toString('base64'),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    // Forward body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const fubRes = await fetch(targetUrl, fetchOptions);
    const data = await fubRes.json();

    // Forward status code
    res.status(fubRes.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'FUB proxy error', detail: err.message });
  }
}
