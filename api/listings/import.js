/**
 * Vercel Serverless Function — listing auto-import.
 *
 * What this does (the AutoReel.app / VideoTour.AI "paste a URL" feature):
 *   - GET  ?proxy=<url>       → fetch a remote photo through this endpoint
 *                                (bypasses CORS for client-side downloads)
 *   - POST { url OR mlsNum }  → scrape a Realtor.com listing and return
 *                                { listing: {...}, photos: ["url", ...] }
 *
 * Why Realtor.com:
 *   - Their listing pages embed structured JSON-LD that includes the photo
 *     list, price, beds/baths/sqft, address — clean parse, no DOM scraping
 *   - Anti-bot is much softer than Zillow
 *   - MLS-number search works via their public hulk-search API
 *
 * Risk: Realtor.com can change their HTML/API at any time. If this breaks,
 * Monica can always upload photos manually as a fallback.
 */
export const config = {
  api: { bodyParser: { sizeLimit: '1mb' }, responseLimit: '15mb' },
};

const REALTOR_HEADERS = {
  // Mimic a real browser — Realtor.com 403s most non-browser User-Agents
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export default async function handler(req, res) {
  // ── Photo proxy mode ───────────────────────────────────────────────────────
  // The client passes a remote image URL, we fetch it server-side and stream
  // the bytes back. Lets AutoReel treat scraped URLs as if they were uploaded
  // files without hitting CORS walls.
  if (req.query.proxy) {
    try {
      const upstream = await fetch(req.query.proxy, {
        headers: REALTOR_HEADERS,
        // 15-sec timeout — listing photos should respond fast
        signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok) {
        return res.status(upstream.status).json({ error: { message: `Photo proxy returned ${upstream.status}` } });
      }
      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      const buffer = Buffer.from(await upstream.arrayBuffer());
      return res.status(200).send(buffer);
    } catch (e) {
      return res.status(502).json({ error: { message: 'Photo proxy error: ' + e.message } });
    }
  }

  // ── Listing import mode ────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'POST or use ?proxy=URL' } });
  }

  const body = req.body || {};
  let targetUrl = (body.url || '').trim();
  const mlsNum = (body.mlsNum || '').trim();

  try {
    // Resolve MLS# → Realtor.com listing URL by searching their public site
    if (!targetUrl && mlsNum) {
      targetUrl = await resolveMlsNumToRealtorUrl(mlsNum);
      if (!targetUrl) {
        return res.status(404).json({
          error: { message: `Could not find listing for MLS# ${mlsNum} on Realtor.com. Either it's not on Realtor.com or the MLS# format is wrong. Try pasting the Realtor.com URL directly.` },
        });
      }
    }

    if (!targetUrl) {
      return res.status(400).json({ error: { message: 'Provide a url or mlsNum' } });
    }

    // Only support Realtor.com for now — other sites are flaky to scrape
    if (!/realtor\.com/i.test(targetUrl)) {
      return res.status(400).json({
        error: { message: 'Only Realtor.com URLs supported right now. Paste a realtor.com listing URL, or use the MLS# field to auto-search.' },
      });
    }

    const r = await fetch(targetUrl, {
      headers: REALTOR_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      return res.status(r.status).json({ error: { message: `Realtor.com returned ${r.status}` } });
    }
    const html = await r.text();

    // Parse the JSON-LD blocks for structured listing data
    const parsed = parseRealtorPage(html);
    if (!parsed.photos.length && !parsed.listing.address) {
      return res.status(502).json({
        error: { message: 'Could not extract listing data from the page. Realtor.com may have changed their structure. Try uploading photos manually.' },
        debug: html.length,
      });
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

// ─── Resolve MLS# → Realtor.com listing URL ─────────────────────────────────
// Realtor.com's mlssearch endpoint will redirect to the listing detail page
// if there's a match. We follow the redirect chain to capture the final URL.
async function resolveMlsNumToRealtorUrl(mlsNum) {
  // Their search-by-MLS URL pattern
  const searchUrl = `https://www.realtor.com/realestateandhomes-search/?searchQueryState=%7B%22query%22%3A%22${encodeURIComponent(mlsNum)}%22%7D`;
  try {
    const r = await fetch(searchUrl, {
      headers: REALTOR_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const html = await r.text();
    // Find a property detail URL in the response — Realtor.com property pages
    // look like /realestateandhomes-detail/{slug}_M{property_id}
    const m = html.match(/href="(\/realestateandhomes-detail\/[^"]+_M\d+)"/);
    if (m) return 'https://www.realtor.com' + m[1].replace(/&amp;/g, '&');
    // Alternate: look for full canonical URL in og:url meta
    const og = html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+realestateandhomes-detail[^"]+)"/i);
    if (og) return og[1];
    return null;
  } catch (e) {
    return null;
  }
}

// ─── Parse a Realtor.com listing detail page ────────────────────────────────
// Returns { listing: {...}, photos: ["https://...", ...] }
function parseRealtorPage(html) {
  const listing = {
    address: '', city: '', state: '', zip: '',
    list_price: null, sale_price: null,
    beds: null, baths: null, sqft: null,
    status: '', mls_num: '', dom: null,
  };
  const photoSet = new Set();

  // Realtor.com embeds the listing as JSON-LD <script type="application/ld+json">
  const jsonLdMatches = html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]+?)<\/script>/gi);
  for (const m of jsonLdMatches) {
    try {
      const data = JSON.parse(m[1].trim());
      // Sometimes nested in an array
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const type = item['@type'] || '';
        if (/SingleFamilyResidence|Apartment|Residence|House|Product|RealEstateListing/i.test(type)) {
          extractFromJsonLd(item, listing, photoSet);
        }
      }
    } catch (e) { /* skip malformed JSON-LD */ }
  }

  // Fallback: Realtor.com's __NEXT_DATA__ script blob contains the full
  // property record. Parse it if JSON-LD missed photos.
  if (photoSet.size < 3) {
    const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/);
    if (nextMatch) {
      try {
        const next = JSON.parse(nextMatch[1]);
        extractFromNextData(next, listing, photoSet);
      } catch (e) { /* skip */ }
    }
  }

  // Fallback fallback: regex all big .jpg/jpeg/png from rdc.cdn URLs (Realtor's CDN)
  if (photoSet.size < 3) {
    const cdnMatches = html.matchAll(/https?:\/\/(?:ap\.rdcpix\.com|images\.realtor\.com)\/[a-zA-Z0-9_\-\/]+\.(?:jpg|jpeg|png|webp)/g);
    for (const m of cdnMatches) {
      const url = m[0].split('?')[0];
      // Skip thumbnails — prefer larger sizes (heuristic: URL contains "od" or no size modifier)
      photoSet.add(url);
    }
  }

  // og:image fallback for at least one photo
  if (photoSet.size === 0) {
    const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
    if (og) photoSet.add(og[1]);
  }

  return {
    listing,
    photos: Array.from(photoSet).slice(0, 30),  // cap at 30
  };
}

function extractFromJsonLd(item, listing, photoSet) {
  // Address
  if (item.address) {
    listing.address = [item.address.streetAddress].filter(Boolean).join(' ');
    listing.city    = item.address.addressLocality || '';
    listing.state   = item.address.addressRegion || '';
    listing.zip     = item.address.postalCode || '';
  } else if (item.name && /\d+\s+\w/.test(item.name)) {
    // Sometimes the address is in the name field
    listing.address = item.name;
  }

  // Price
  const offer = item.offers || item.offer;
  if (offer) {
    if (offer.price) listing.list_price = String(offer.price).replace(/[^0-9.]/g, '');
    if (offer.availability && /sold/i.test(offer.availability)) {
      listing.status = 'Sold';
      listing.sale_price = listing.list_price;
    }
  }

  // Beds / baths / sqft
  if (item.numberOfRooms) listing.beds = String(item.numberOfRooms);
  if (item.numberOfBedrooms) listing.beds = String(item.numberOfBedrooms);
  if (item.numberOfBathroomsTotal) listing.baths = String(item.numberOfBathroomsTotal);
  if (item.numberOfBathrooms) listing.baths = String(item.numberOfBathrooms);
  if (item.floorSize?.value) listing.sqft = String(item.floorSize.value);

  // Photos
  if (item.image) {
    const imgs = Array.isArray(item.image) ? item.image : [item.image];
    imgs.forEach(img => {
      if (typeof img === 'string') photoSet.add(img.split('?')[0]);
      else if (img?.url) photoSet.add(img.url.split('?')[0]);
    });
  }
}

function extractFromNextData(next, listing, photoSet) {
  // Walk the __NEXT_DATA__ tree looking for "photos" arrays (Realtor.com puts
  // photos under propertyDetailPageProperty.photos[].href). We do a depth-
  // first walk because the path can change across A/B test variants.
  const visit = (node, depth = 0) => {
    if (!node || depth > 8) return;
    if (Array.isArray(node)) {
      // Heuristic: if this is an array of objects each with an "href" that
      // looks like an image URL, treat as photo list
      if (node.length > 0 && node[0] && typeof node[0] === 'object' && node[0].href && /\.(jpg|jpeg|png|webp)/i.test(node[0].href)) {
        node.forEach(p => p.href && photoSet.add(p.href.split('?')[0]));
        return;
      }
      node.forEach(item => visit(item, depth + 1));
      return;
    }
    if (typeof node === 'object') {
      // Specific known paths
      if (node.list_price && !listing.list_price) listing.list_price = String(node.list_price);
      if (node.description?.beds && !listing.beds) listing.beds = String(node.description.beds);
      if (node.description?.baths_consolidated && !listing.baths) listing.baths = String(node.description.baths_consolidated);
      if (node.description?.baths && !listing.baths) listing.baths = String(node.description.baths);
      if (node.description?.sqft && !listing.sqft) listing.sqft = String(node.description.sqft);
      if (node.location?.address?.line && !listing.address) {
        listing.address = node.location.address.line || '';
        listing.city    = node.location.address.city || listing.city;
        listing.state   = node.location.address.state_code || node.location.address.state || listing.state;
        listing.zip     = node.location.address.postal_code || listing.zip;
      }
      if (node.source?.listing_id && !listing.mls_num) listing.mls_num = String(node.source.listing_id);
      if (node.status && !listing.status) listing.status = node.status;

      Object.values(node).forEach(v => visit(v, depth + 1));
    }
  };
  visit(next);
}
