// Listing auto-import (Realtor.com).
// GET  ?proxy=URL    photo proxy (CORS bypass)
// POST {url, mlsNum} scrape Realtor.com, return listing + photos
// Requires SCRAPER_API_KEY on Vercel for Kasada bypass.

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' }, responseLimit: '15mb' },
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36';

function scraped(url) {
  const k = process.env.SCRAPER_API_KEY;
  if (!k) return url;
  return 'http://api.scraperapi.com?api_key=' + k + '&url=' + encodeURIComponent(url) + '&country_code=us';
}

export default async function handler(req, res) {
  if (req.query.proxy) {
    try {
      const r = await fetch(req.query.proxy, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return res.status(r.status).json({ error: { message: 'proxy ' + r.status } });
      res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).send(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      return res.status(502).json({ error: { message: e.message } });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'POST or ?proxy=URL' } });

  if (!process.env.SCRAPER_API_KEY) {
    return res.status(400).json({
      error: { message: 'MLS lookup needs SCRAPER_API_KEY on Vercel. Sign up free at scraperapi.com, add env var, redeploy.' },
    });
  }

  const body = req.body || {};
  let target = (body.url || '').trim();
  const mls = (body.mlsNum || '').trim();

  try {
    if (!target && mls) {
      target = await mlsToUrl(mls);
      if (!target) return res.status(404).json({ error: { message: 'No Realtor.com listing for MLS# ' + mls } });
    }
    if (!target) return res.status(400).json({ error: { message: 'Provide url or mlsNum' } });
    if (target.indexOf('realtor.com') < 0) {
      return res.status(400).json({ error: { message: 'Only realtor.com URLs supported' } });
    }

    const r = await fetch(scraped(target), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000), redirect: 'follow' });
    if (!r.ok) return res.status(r.status).json({ error: { message: 'realtor.com ' + r.status } });
    const html = await r.text();
    const out = parse(html);
    if (out.photos.length === 0 && !out.listing.address) {
      return res.status(502).json({ error: { message: 'No data extracted; page may have changed' } });
    }
    return res.status(200).json({ ok: true, sourceUrl: target, listing: out.listing, photos: out.photos });
  } catch (e) {
    return res.status(502).json({ error: { message: 'Import: ' + e.message } });
  }
}

async function mlsToUrl(mls) {
  const u = 'https://www.realtor.com/realestateandhomes-search/?searchQueryState='
    + encodeURIComponent('{"query":"' + mls + '"}');
  try {
    const r = await fetch(scraped(u), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(45000), redirect: 'follow' });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/\/realestateandhomes-detail\/[A-Za-z0-9_\-]+_M\d+/);
    if (m) return 'https://www.realtor.com' + m[0];
    return null;
  } catch (e) { return null; }
}

function parse(html) {
  const listing = { address: '', city: '', state: '', zip: '', list_price: null, beds: null, baths: null, sqft: null, status: '' };
  const photos = new Set();

  const ldRe = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]+?)<\/script>/gi;
  let m;
  while ((m = ldRe.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1].trim());
      const items = Array.isArray(obj) ? obj : [obj];
      for (let i = 0; i < items.length; i++) pull(items[i], listing, photos);
    } catch (e) {}
  }

  if (photos.size < 3) {
    const cdnRe = /https?:\/\/(?:ap\.rdcpix\.com|images\.realtor\.com)\/[A-Za-z0-9_\-\/]+\.(?:jpg|jpeg|png|webp)/g;
    let c;
    while ((c = cdnRe.exec(html)) !== null) {
      photos.add(c[0].split('?')[0]);
      if (photos.size >= 30) break;
    }
  }

  return { listing, photos: Array.from(photos).slice(0, 30) };
}

function pull(item, listing, photos) {
  if (!item || typeof item !== 'object') return;
  const a = item.address;
  if (a && typeof a === 'object') {
    if (a.streetAddress) listing.address = a.streetAddress;
    if (a.addressLocality) listing.city = a.addressLocality;
    if (a.addressRegion) listing.state = a.addressRegion;
    if (a.postalCode) listing.zip = a.postalCode;
  }
  const o = item.offers;
  if (o && typeof o === 'object' && o.price) {
    listing.list_price = String(o.price).replace(/[^0-9.]/g, '');
  }
  if (item.numberOfBedrooms) listing.beds = String(item.numberOfBedrooms);
  if (item.numberOfBathroomsTotal) listing.baths = String(item.numberOfBathroomsTotal);
  if (item.image) {
    const imgs = Array.isArray(item.image) ? item.image : [item.image];
    for (let i = 0; i < imgs.length; i++) {
      const x = imgs[i];
      if (typeof x === 'string') photos.add(x.split('?')[0]);
      else if (x && x.url) photos.add(String(x.url).split('?')[0]);
    }
  }
}
