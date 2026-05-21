export const config = {
  api: { bodyParser: { sizeLimit: '1mb' }, responseLimit: '15mb' },
};

export default async function handler(req, res) {
  if (req.query.proxy) {
    try {
      const upstream = await fetch(req.query.proxy, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok) return res.status(upstream.status).json({ error: { message: 'proxy failed' } });
      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      const buffer = Buffer.from(await upstream.arrayBuffer());
      return res.status(200).send(buffer);
    } catch (e) {
      return res.status(502).json({ error: { message: e.message } });
    }
  }
  return res.status(200).json({ ok: true, action: 'medium-complexity stub' });
}
