// Vercel Serverless Function — listing auto-import (Realtor.com).
//
// Two modes:
//   GET  ?proxy=<url>  → fetch a photo URL through this endpoint (CORS bypass)
//   POST { url|mlsNum} → scrape a Realtor.com listing, return { listing, photos }
//
// Anti-bot: Realtor.com blocks plain fetches with Kasada. If SCRAPER_API_KEY
// is set on Vercel (free tier at scraperapi.com → 1000 req/mo, no card),
// we route Realtor.com traffic through their residential-proxy network
// which bypasses the bot wall. Without the key, the lookup will fail.

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' }, responseLimit: '15mb' },
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Wrap a Realtor.com (or any) URL through ScraperAPI when configured.
function scrapedUrl(targetUrl) {
  const key = process.env.SCRAPER_API_KEY;
  if (!key) return targetUrl;
  return 'http://api.scraperapi.com?api_key=' + key
    + '&url=' + encodeURIComponent(targetUrl)
    + '&render=false'
    + '&country_code=us';
}

export default async function handler(req, res) {
  // ── Photo proxy mode ──────────────────────────────────────────────────────
  if (req.query.proxy) {
    try {
      const upstream = await fetch(req.query.proxy, {
        headers: HEADERS,
        signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok) return res.status(upstream.status).json({ error: { message: 'photo proxy ' + upstream.status } });
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

  if (!process.env.SCRAPER_API_KEY) {
    return res.status(400).json({
      error: {
        message: 'MLS# auto-lookup needs SCRAPER_API_KEY set on Vercel. Realtor.com blocks bare requests. Sign up free at scraperapi.com (1000 reqs/month, no credit card), add SCRAPER_API_KEY to Vercel env vars, redeploy.',
      },
    });
  }

  try {
    if (!targetUrl && mlsNum) {
      targetUrl = await resolveMlsToRealtorUrl(mlsNum);
      if (!targetUrl) {
        return res.status(404).json({
          error: { message: 'No Realtor.com listing found for MLS# ' + mlsNum + '. Try pasting the realtor.com URL directly.' },
        });
      }
    }
    if (!targetUrl) return res.status(400).json({ error: { message: 'Provide url or mlsNum' } });
    if (!/realtor\.com/i.test(targetUrl)) {
      return res.status(400).json({ error: { message: 'Only Realtor.com URLs supported. Paste a realtor.com listing URL.' } });
    }

    const r = await fetch(scrapedUrl(targetUrl), {
      headers: HEADERS,
      signal: AbortSignal.timeout(60000),
      redirect: 'follow',
    });
    if (!r.ok) return res.status(r.status).json({ error: { message: 'realtor.com returned ' + r.status } });
    const html = await r.text();

    const parsed = parseRealtor(html);
    if (parsed.photos.length === 0 && !parsed.listing.address) {
      return res.status(502).json({ error: { message: 'Got the page but could not extract listing data. Page structure may have changed.' } });
    }

    return res.status(200).json({
      ok: true,
      sourceUrl: targetUrl,
      listing: parsed.listing,
      photos: parsed.photos,
    });
  } catch (e) {
    return res.status(502).json({ error: { message: 'Import error: ' + e.message } });
  }
}

async function resolveMlsToRealtorUrl(mlsNum) {
  const searchUrl = 'https://www.realtor.com/realestateandhomes-search/?searchQueryState='
    + encodeURIComponent('{"query":"' + mlsNum + '"}');
  try {
    const r = await fetch(scrapedUrl(searchUrl), {
      headers: HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) return null;
    const html = await r.text();
    const re = /\/realestateandhomes-detail\/[A-Za-z0-9_\-]+_M\d+/g;
    let m;
    let found = null;
    while ((m = re.exec(html)) !== null) { found = m[0]; break; }
    if (found) return 'https://www.realtor.com' + found;
    const og = html.match(/<meta[^>]+(?:property|name)="og:url"[^>]+content="([^"]*realestateandhomes-detail[^"]*)"/i);
    if (og) return og[1].replace(/&amp;/g, '&');
    return null;
  } catch (e) { return null; }
}

function parseRealtor(html) {
  const listing = {
    address: '', city: '', state: '', zip: '',
    list_price: null, sale_price: null,
    beds: null, baths: null, sqft: null,
    status: '', mls_num: '',
  };
  const photoSet = new Set();

  const ldRe = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]+?)<\/script>/gi;
  let ldMatch;
  while ((ldMatch = ldRe.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(ldMatch[1].trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (let i = 0; i < items.length; i++) extractLd(items[i], listing, photoSet);
    } catch (e) { /* skip malformed */ }
  }

  if (photoSet.size < 3) {
    const cdnRe = /https?:\/\/(?:ap\.rdcpix\.com|images\.realtor\.com)\/[A-Za-z0-9_\-\/]+\.(?:jpg|jpeg|png|webp)/g;
    let cm;
    while ((cm = cdnRe.exec(html)) !== null) {
      photoSet.add(cm[0].split('?')[0]);
      if (photoSet.size >= 30) break;
    }
  }

  if (photoSet.size === 0) {
    const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
    if (og) photoSet.add(og[1]);
  }

  return { listing, photos: Array.from(photoSet).slice(0, 30) };
}

function extractLd(item, listing, photoSet) {
  if (!item || typeof item !== 'object') return;

  if (item.address && typeof item.address === 'object') {
    if (item.address.streetAddress && !listing.address) listing.address = item.address.streetAddress;
    if (item.address.addressLocality && !listing.city) listing.city = item.address.addressLocality;
    if (item.address.addressRegion && !listing.state) listing.state = item.address.addressRegion;
    if (item.address.postalCode && !listing.zip) listing.zip = item.address.postalCode;
  }

  if (item.offers && typeof item.offers === 'object') {
    const o = item.offers;
    if (o.price && !listing.list_price) listing.list_price = String(o.price).replace(/[^0-9.]/g, '');
    if (o.availability && /sold/i.test(String(o.availability))) {
      listing.status = 'Sold';
      if (!listing.sale_price) listing.sale_price = listing.list_price;
    }
  }

  if (item.numberOfBedrooms && !listing.beds) listing.beds = String(item.numberOfBedrooms);
  if (item.numberOfBathroomsTotal && !listing.baths) listing.baths = String(item.numberOfBathroomsTotal);
  if (item.numberOfBathrooms && !listing.baths) listing.baths = String(item.numberOfBathrooms);
  if (item.floorSize && item.floorSize.value && !listing.sqft) listing.sqft = String(item.floorSize.value);

  if (item.image) {
    const imgs = Array.isArray(item.image) ? item.image : [item.image];
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i];
      if (typeof img === 'string') photoSet.add(img.split('?')[0]);
      else if (img && img.url) photoSet.add(String(img.url).split('?')[0]);
    }
  }
}
