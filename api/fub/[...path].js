/**
 * Vercel Serverless Function — FUB API Proxy
 * Replaces the CRA dev proxy (setupProxy.js) for production.
 *
 * All requests to /api/fub/... are forwarded to
 * https://api.followupboss.com/v1/...
 * with the FUB API key injected server-side (never exposed to browser).
 */

export default async function handler(req, res) {
  // Accept either the server-side Vercel env var OR a client-supplied
  // x-fub-key header (same fallback as dev's setupProxy.js). This keeps
  // production working even if FUB_API_KEY isn't set on Vercel — Monica
  // pastes her key on the Integrations page and we forward it.
  const FUB_API_KEY = process.env.FUB_API_KEY
    || req.headers['x-fub-key']
    || (Array.isArray(req.headers['x-fub-key']) ? req.headers['x-fub-key'][0] : null);
  if (!FUB_API_KEY) {
    return res.status(500).json({
      error: 'FUB_API_KEY not configured',
      hint: 'Either set FUB_API_KEY on Vercel env vars OR paste your FUB key into Integrations → Follow Up Boss inside the app.',
    });
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
    // FUB's textMessages and some other endpoints are "Restricted - Registered
    // Systems Only" — they require X-System + X-System-Key headers identifying
    // the calling app as a registered FUB integration. Without these the
    // endpoints either 401 or return empty arrays.
    //
    // Register at https://apps.followupboss.com/system-registration (free)
    // then set FUB_SYSTEM and FUB_SYSTEM_KEY as Vercel env vars. The proxy
    // attaches them automatically here. If missing, we still send the
    // request — non-restricted endpoints (people, notes, events, emails,
    // calls) usually work without them.
    const FUB_SYSTEM = process.env.FUB_SYSTEM;
    const FUB_SYSTEM_KEY = process.env.FUB_SYSTEM_KEY;
    const headers = {
      'Authorization': 'Basic ' + Buffer.from(FUB_API_KEY + ':').toString('base64'),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (FUB_SYSTEM) headers['X-System'] = FUB_SYSTEM;
    if (FUB_SYSTEM_KEY) headers['X-System-Key'] = FUB_SYSTEM_KEY;
    const fetchOptions = { method: req.method, headers };

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
