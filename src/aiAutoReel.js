/**
 * aiAutoReel — AI orchestration for AutoReel feature.
 *
 * AutoReel is Monica's "AutoReel.ai / VideoTour.AI clone." Inputs are raw
 * listing photos + listing metadata (address/price/beds/baths) + a vibe.
 * Output is a single polished cinematic reel.
 *
 * What the AI does here:
 *   1. curatePhotos(photos, listing)
 *      → Gemini Vision scores every uploaded photo on visual quality and
 *        tags it with a room type (exterior / kitchen / living / primary /
 *        bath / yard / detail / other). Returns the best N in tour order
 *        (curb-appeal → entry → kitchen → living → primary → bath → yard).
 *   2. generateNarrative(orderedScenes, listing, vibe, voiceProfile)
 *      → Generates the opening hook, per-scene 2-4-word room labels, the
 *        closing CTA card, and the social caption + hashtags. One call.
 *
 * Both calls go through /api/claude/messages → Anthropic primary, Gemini
 * fallback. Vision content arrays are translated server-side.
 */

// ── Vibe presets ──────────────────────────────────────────────────────────────
// Each vibe drives the tone of the AI copy AND the visual choices in the
// cinematic render pipeline (motion intensity, music suggestion, filter).
export const VIBES = [
  {
    id: 'luxury',
    name: 'Luxury Listing',
    emoji: '🌟',
    desc: 'Slow cinematic Ken Burns, dramatic gold/black, premium feel',
    tone: 'Quiet luxury. Confident, understated. No emojis. No exclamation points. Sounds like Architectural Digest.',
    filter: 'luxe',
    motion: 'slow',
    transition: 'fade',
    music: 'cinematic',
    sceneDuration: 3.2,
  },
  {
    id: 'just-listed',
    name: 'Just Listed',
    emoji: '⚡',
    desc: 'High-energy, fast cuts, bold text, attention-grabbing',
    tone: 'High-energy hook. Bold and punchy. Use power words. One exclamation max.',
    filter: 'vibrant',
    motion: 'medium',
    transition: 'whip',
    music: 'upbeat',
    sceneDuration: 2.4,
  },
  {
    id: 'price-drop',
    name: 'Price Reduced',
    emoji: '💰',
    desc: 'Animated price drop, motion-driven, urgency vibe',
    tone: 'Urgent without sounding desperate. Lead with the price drop. Frame as opportunity.',
    filter: 'punch',
    motion: 'medium',
    transition: 'zoom',
    music: 'upbeat',
    sceneDuration: 2.6,
  },
  {
    id: 'open-house',
    name: 'Open House',
    emoji: '🏡',
    desc: 'Warm and inviting, date/time callout, conversational',
    tone: 'Warm. Conversational. First-person ("Come see..."). Specific about the date.',
    filter: 'warm',
    motion: 'medium',
    transition: 'fade',
    music: 'warm',
    sceneDuration: 2.8,
  },
  {
    id: 'sold',
    name: 'Just Sold',
    emoji: '🎉',
    desc: 'Celebration, gratitude, social proof energy',
    tone: 'Celebratory but humble. Credit the clients. End with a soft CTA to other potential sellers.',
    filter: 'twilight',
    motion: 'medium',
    transition: 'fade',
    music: 'warm',
    sceneDuration: 2.8,
  },
  {
    id: 'cinematic',
    name: 'Cinematic Tour',
    emoji: '🎬',
    desc: 'Slow smooth Ken Burns, minimal text, feels like a film',
    tone: 'Minimal. Almost no text. Let the home speak. Short poetic phrases only.',
    filter: 'luxe',
    motion: 'slow',
    transition: 'fade',
    music: 'cinematic',
    sceneDuration: 3.6,
  },
];

export const VIBE_BY_ID = Object.fromEntries(VIBES.map(v => [v.id, v]));

// ── Room types we recognize + their natural tour order ────────────────────────
export const ROOM_ORDER = [
  'exterior',     // curb appeal — always first
  'entry',        // foyer, front door
  'kitchen',
  'living',       // family/great room
  'dining',
  'primary',      // primary suite
  'bedroom',      // other bedrooms
  'bath',
  'office',       // home office, den, flex
  'basement',
  'outdoor',      // backyard, patio, pool, deck
  'detail',       // close-up of fixture/feature
  'other',
];

const ROOM_LABEL = {
  exterior: 'CURB APPEAL',
  entry:    'WELCOME HOME',
  kitchen:  'CHEF\'S KITCHEN',
  living:   'LIVING SPACE',
  dining:   'DINING ROOM',
  primary:  'PRIMARY SUITE',
  bedroom:  'BEDROOM',
  bath:     'SPA BATH',
  office:   'HOME OFFICE',
  basement: 'BONUS LEVEL',
  outdoor:  'OUTDOOR LIVING',
  detail:   'IN THE DETAILS',
  other:    '',
};

// ── Step 1: photo curation via Gemini Vision ──────────────────────────────────
// Sends all photos in a single batched vision call. Returns:
//   [{ index, score, room, label, reason }] sorted by score (best first)
// Caller picks top N, then we re-sort by ROOM_ORDER for the final tour flow.
//
// Photos are passed as base64 data URLs so we can inline them in the request.
export async function curatePhotos(photos, listing = {}, opts = {}) {
  if (!photos?.length) return [];

  // Downsize each photo before sending to AI — 512px on long edge is plenty
  // for room detection and quality scoring, and keeps payload + cost down.
  const thumbnails = await Promise.all(photos.map((p, i) => thumbnail(p, 512).catch(() => null)));

  // Build a single vision message with all images numbered
  const imageBlocks = [];
  thumbnails.forEach((thumb, i) => {
    if (!thumb) return;
    imageBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: thumb.base64 },
    });
    imageBlocks.push({ type: 'text', text: `↑ Photo #${i}` });
  });

  const sys = `You are a real estate listing photo editor. You evaluate listing photos for use in a polished cinematic listing reel.

For each photo provided, return:
- a quality score 1-10 (how visually compelling is it?)
- a room type label, exactly one of: ${ROOM_ORDER.join(', ')}
- a one-sentence reason

Quality criteria (what makes a HIGH-scoring photo):
- Strong composition, good light, wide angle showing the space
- Vibrant colors, clean staging, eye-catching first impression
- For exterior: curb appeal, blue sky, well-lit facade
- For kitchen: clean, organized, well-lit, ideally with island/feature
- For bath: spa-like, clean, well-lit, ideally with feature tile or tub
- Detail shots (fixtures, fireplaces, windows) score high IF they are striking
- Dim, cluttered, blurry, awkward angles, or busy shots score LOW

Room categorization rules:
- "exterior" = outside of house (front view, drone, twilight)
- "entry" = foyer, mudroom, front door area
- "kitchen" = kitchen / breakfast nook
- "living" = living room, family room, great room
- "dining" = formal dining room only
- "primary" = primary/master bedroom OR primary bath suite combined
- "bedroom" = guest/secondary bedrooms
- "bath" = secondary bathrooms (not primary)
- "office" = office, study, library, den, flex room
- "basement" = finished basement, rec room
- "outdoor" = patio, deck, pool, backyard, fire pit
- "detail" = striking close-up: fireplace mantle, light fixture, hardware, view
- "other" = floor plan, blueprint, map, anything else`;

  const prompt = `Score and tag ALL ${imageBlocks.length / 2} photos above (numbered Photo #0 through Photo #${imageBlocks.length/2 - 1}).

Return STRICT JSON only (no markdown fences, no commentary):
{
  "photos": [
    { "index": 0, "score": 8, "room": "exterior", "reason": "Strong twilight curb appeal with warm window glow" },
    ...one entry per photo, in order...
  ]
}`;

  const r = await fetch('/api/claude/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      system: sys,
      messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'AI vision error');
  const text = (d.content?.[0]?.text || '').trim();
  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(jsonText); }
  catch (e) {
    // Fallback: if AI returned a non-JSON response, treat all photos as "other"
    // with neutral score so the reel still renders.
    console.warn('[autoreel] AI returned non-JSON, falling back to uncurated', text.slice(0, 200));
    return photos.map((_, i) => ({ index: i, score: 5, room: 'other', label: '' }));
  }
  const entries = (parsed.photos || []).map(p => ({
    index: p.index,
    score: typeof p.score === 'number' ? p.score : 5,
    room:  ROOM_ORDER.includes(p.room) ? p.room : 'other',
    label: ROOM_LABEL[p.room] || '',
    reason: p.reason || '',
  }));
  return entries;
}

// Build the final scene list given curated entries + a target count.
// Strategy: pick the top-scoring photo for each room type (in tour order),
// then fill remaining slots with the next-best-overall regardless of room,
// then sort by ROOM_ORDER for the playback sequence.
export function buildSceneOrder(curated, targetCount = 9) {
  if (!curated?.length) return [];
  const byRoom = {};
  curated.forEach(c => { (byRoom[c.room] = byRoom[c.room] || []).push(c); });
  // sort each room bucket by score desc
  Object.values(byRoom).forEach(arr => arr.sort((a,b) => b.score - a.score));

  const picked = [];
  const pickedIdx = new Set();

  // Pass 1: one top photo from each room in tour order
  ROOM_ORDER.forEach(room => {
    const best = (byRoom[room] || [])[0];
    if (best && picked.length < targetCount && !pickedIdx.has(best.index)) {
      picked.push(best);
      pickedIdx.add(best.index);
    }
  });

  // Pass 2: fill remaining slots with overall-best unused photos
  const remaining = curated
    .filter(c => !pickedIdx.has(c.index))
    .sort((a,b) => b.score - a.score);
  while (picked.length < targetCount && remaining.length) {
    const next = remaining.shift();
    picked.push(next);
    pickedIdx.add(next.index);
  }

  // Final sort: by ROOM_ORDER position so playback is curb→kitchen→...→outdoor
  picked.sort((a, b) => {
    const ai = ROOM_ORDER.indexOf(a.room);
    const bi = ROOM_ORDER.indexOf(b.room);
    if (ai !== bi) return ai - bi;
    return b.score - a.score;
  });

  return picked;
}

// ── Step 2: narrative generation (hook + scene labels + caption) ──────────────
export async function generateNarrative({ scenes, listing, vibe, agentVoice, agent }) {
  const vibeDef = VIBE_BY_ID[vibe] || VIBES[0];
  const sceneList = scenes.map((s, i) =>
    `Scene ${i + 1}: room=${s.room} (default label: "${ROOM_LABEL[s.room] || ''}")`
  ).join('\n');

  const stats = [];
  if (listing.list_price || listing.sale_price) {
    const price = listing.list_price || listing.sale_price;
    stats.push(`$${Number(price).toLocaleString()}`);
  }
  if (listing.beds) stats.push(`${listing.beds} BD`);
  if (listing.baths) stats.push(`${listing.baths} BA`);
  if (listing.sqft) stats.push(`${Number(listing.sqft).toLocaleString()} sqft`);

  const sys = `You are ${agent?.name || 'Monica Iskra'}'s real estate marketing copywriter writing the narrative for a polished listing reel.

Vibe: ${vibeDef.name} — ${vibeDef.tone}

${agentVoice ? `Brand voice: ${agentVoice}` : ''}

You write copy that goes ON SCREEN in a video reel. Rules:
- Hook: under 50 characters, scroll-stopping, no period at end.
- Scene labels: 2-4 ALL-CAPS words max. They appear briefly per scene.
- Closing CTA: under 60 characters, includes a clear next step.
- IG caption: 2-4 short sentences then 6-10 relevant hashtags. Hashtags should mix neighborhood, market, and lifestyle.
- No emoji in scene labels. Sparing emoji elsewhere is fine if the vibe allows it.`;

  const prompt = `Generate narrative copy for this listing reel.

LISTING:
- Address: ${listing.address || ''}, ${listing.city || ''} ${listing.zip || ''}
- Status: ${listing.status || ''}
- Stats: ${stats.join(' · ') || '(not provided)'}
- MLS#: ${listing.mls_num || ''}
- Days on market: ${listing.dom || '?'}

SCENES IN PLAYBACK ORDER:
${sceneList}

Return STRICT JSON only (no markdown):
{
  "hook": "Opening scroll-stopper (under 50 chars, NO period at end)",
  "statsLine": "${stats.join(' · ') || ''}",
  "sceneLabels": ["scene 1 label", "scene 2 label", ...one per scene...],
  "closingHeadline": "Big text on closing card (under 30 chars)",
  "closingCta": "Action prompt (under 60 chars)",
  "igCaption": "The Instagram caption — text then a blank line then hashtags",
  "fbCaption": "The Facebook version (slightly longer, no hashtags), 2-4 sentences"
}`;

  const r = await fetch('/api/claude/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1800,
      system: sys,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'AI error');
  const text = (d.content?.[0]?.text || '').trim();
  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(jsonText); }
  catch (e) {
    // Fallback narrative so the reel still renders if the AI errors out
    return {
      hook: vibeDef.name.toUpperCase() + ' · ' + (listing.address || 'NEW LISTING'),
      statsLine: stats.join(' · '),
      sceneLabels: scenes.map(s => ROOM_LABEL[s.room] || ''),
      closingHeadline: 'BOOK A TOUR',
      closingCta: 'DM Monica · teamiskrasells.com',
      igCaption: `${listing.address || 'New listing'}. ${stats.join(' · ')}.\n\n#realestate #livonia #michiganrealestate #justlisted`,
      fbCaption: `New listing — ${listing.address || ''}. ${stats.join(' · ')}. DM me to tour.`,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Downscale + base64-encode an image File/Blob/URL.
// Returns { base64, width, height } or throws.
async function thumbnail(src, maxEdge = 512) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = reject;
    if (src instanceof Blob) i.src = URL.createObjectURL(src);
    else if (typeof src === 'string') i.src = src;
    else if (src.url) i.src = src.url;
    else if (src.file) i.src = URL.createObjectURL(src.file);
    else reject(new Error('Unsupported photo source'));
  });
  const ratio = img.naturalWidth / img.naturalHeight;
  const w = ratio >= 1 ? maxEdge : Math.round(maxEdge * ratio);
  const h = ratio >= 1 ? Math.round(maxEdge / ratio) : maxEdge;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  // JPEG @ 0.85 — good balance of quality and payload size
  const dataUrl = c.toDataURL('image/jpeg', 0.85);
  const base64 = dataUrl.split(',')[1];
  return { base64, width: w, height: h };
}
