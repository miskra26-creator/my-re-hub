export const config = {
  api: { bodyParser: { sizeLimit: '1mb' }, responseLimit: '15mb' },
};

const REALTOR_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export default async function handler(req, res) {
  if (req.query.proxy) {
    try {
      const upstream = await fetch(req.query.proxy, {
        headers: REALTOR_HEADERS,
        signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok) return res.status(upstream.status).json({ error: { message: 'proxy ' + upstream.status } });
      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      const buffer = Buffer.from(await upstream.arrayBuffer());
      return res.status(200).send(buffer);
    } catch (e) {
      return res.status(502).json({ error: { message: e.message } });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'POST or ?proxy=URL' } });

  const body = req.body || {};
  let targetUrl = (body.url || '').trim();
  const mlsNum = (body.mlsNum || '').trim();

  try {
    if (!targetUrl && mlsNum) {
      targetUrl = await resolveMlsNumToRealtorUrl(mlsNum);
      if (!targetUrl) return res.status(404).json({ error: { message: 'Listing not found for MLS#' + mlsNum } });
    }
    if (!targetUrl) return res.status(400).json({ error: { message: 'url or mlsNum required' } });
    if (!/realtor\.com/i.test(targetUrl)) {
      return res.status(400).json({ error: { message: 'Only Realtor.com URLs supported' } });
    }

    const r = await fetch(targetUrl, { headers: REALTOR_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!r.ok) return res.status(r.status).json({ error: { message: 'realtor.com ' + r.status } });
    const html = await r.text();
    const parsed = parseRealtorPage(html);
    return res.status(200).json({ ok: true, sourceUrl: targetUrl, listing: parsed.listing, photos: parsed.photos });
  } catch (e) {
    return res.status(502).json({ error: { message: e.message } });
  }
}

async function resolveMlsNumToRealtorUrl(mlsNum) {
  const searchUrl = 'https://www.realtor.com/realestateandhomes-search/?searchQueryState=' + encodeURIComponent('{"query":"' + mlsNum + '"}');
  try {
    const r = await fetch(searchUrl, { headers: REALTOR_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/href="(\/realestateandhomes-detail\/[^"]+_M\d+)"/);
    if (m) return 'https://www.realtor.com' + m[1].replace(/&amp;/g, '&');
    const og = html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+realestateandhomes-detail[^"]+)"/i);
    if (og) return og[1];
    return null;
  } catch (e) { return null; }
}

function parseRealtorPage(html) {
  const listing = { address: '', city: '', state: '', zip: '', list_price: null, beds: null, baths: null, sqft: null, status: '', mls_num: '' };
  const photoSet = new Set();
  const cdnRe = /https?:\/\/(?:ap\.rdcpix\.com|images\.realtor\.com)\/[a-zA-Z0-9_\-\/]+\.(?:jpg|jpeg|png|webp)/g;
  let m;
  while ((m = cdnRe.exec(html)) !== null) {
    photoSet.add(m[0].split('?')[0]);
    if (photoSet.size > 30) break;
  }
  return { listing, photos: Array.from(photoSet).slice(0, 30) };
}
