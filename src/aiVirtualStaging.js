/**
 * aiVirtualStaging — virtual-stage empty rooms with Gemini 2.5 Flash Image.
 *
 * Free, automated, $0/mo via Monica's existing GOOGLE_GEMINI_API_KEY.
 * 500 images/day on the free tier — plenty for daily reel production.
 *
 * Two public entry points:
 *   - stagePhoto({ photo, room, style, customNotes })    → one photo
 *   - batchStage(photos, opts, { onProgress, onPhoto })  → many photos
 */

// ─── Staging style presets ────────────────────────────────────────────────────
// Each preset includes a `prompt` clause appended to the staging request, plus
// a `desc` shown in the UI so Monica knows what each style produces.
export const STAGING_STYLES = [
  {
    id: 'modern',
    name: 'Modern Minimalist',
    emoji: '⚪',
    desc: 'Clean lines, neutral palette, warm wood tones',
    prompt: 'modern minimalist style with clean lines, light neutral palette (white, beige, soft gray), warm wood accents, mid-century furniture silhouettes, and a few statement pieces',
  },
  {
    id: 'luxury',
    name: 'Luxury',
    emoji: '💎',
    desc: 'High-end materials, dramatic lighting, sophisticated',
    prompt: 'luxury real estate style with high-end materials (marble, velvet, brass), warm dramatic lighting, gold accents, sophisticated furniture, designer rugs, and curated artwork',
  },
  {
    id: 'traditional',
    name: 'Traditional',
    emoji: '🏛️',
    desc: 'Classic furniture, warm tones, timeless feel',
    prompt: 'traditional style with classic upholstered furniture, warm earth tones, formal symmetrical layout, oriental-inspired rugs, wood paneling accents, and framed art',
  },
  {
    id: 'cozy',
    name: 'Cozy Family',
    emoji: '🏡',
    desc: 'Comfortable, lived-in, warm and welcoming',
    prompt: 'cozy family-friendly style with comfortable upholstered sofas, layered throw blankets, warm soft lighting, soft textures, plants, and a welcoming lived-in feel',
  },
  {
    id: 'contemporary',
    name: 'Contemporary Designer',
    emoji: '🎨',
    desc: 'Bold accents, mixed textures, gallery-style',
    prompt: 'contemporary designer style with bold accent colors (deep teal, terracotta, mustard), mixed textures, sculptural furniture, gallery-wall art arrangements, and statement lighting',
  },
  {
    id: 'farmhouse',
    name: 'Modern Farmhouse',
    emoji: '🌾',
    desc: 'Rustic-meets-modern, shiplap, natural materials',
    prompt: 'modern farmhouse style with shiplap walls, natural wood beams visible, neutral linens, vintage-inspired light fixtures, woven baskets, and rustic-meets-modern furniture',
  },
];

export const STYLE_BY_ID = Object.fromEntries(STAGING_STYLES.map(s => [s.id, s]));

// Room-type → natural language label (also used by aiAutoReel for ROOM_LABEL)
const ROOM_PHRASES = {
  exterior: 'home exterior',
  entry:    'entryway',
  kitchen:  'kitchen',
  living:   'living room',
  dining:   'dining room',
  primary:  'primary bedroom',
  bedroom:  'bedroom',
  bath:     'bathroom',
  office:   'home office',
  basement: 'finished basement',
  outdoor:  'patio',
  detail:   'detail shot',
  other:    'room',
};

// ─── Build the staging prompt ────────────────────────────────────────────────
// The prompt is engineered to keep the room's architecture identical and only
// ADD furniture/decor. This is critical — buyers should be able to recognize
// the actual home in the photo.
function buildPrompt({ room, style, customNotes }) {
  const roomLabel = ROOM_PHRASES[room] || 'room';
  const styleDef = STYLE_BY_ID[style] || STAGING_STYLES[0];

  return [
    `Virtually stage this empty ${roomLabel} for a real estate listing.`,
    `Add photorealistic furniture and decor in ${styleDef.prompt}.`,
    `CRITICAL: Maintain the exact architecture, walls, floors, ceiling, windows, doors, lighting, and camera angle of the original room. Do not modify any structural elements. Only add furniture and decor.`,
    `Furniture should be tasteful, well-scaled to the room, and inviting to potential buyers. Lighting should look natural and warm.`,
    customNotes ? `Additional notes: ${customNotes}` : '',
  ].filter(Boolean).join(' ');
}

// ─── Convert File/Blob → base64 (without the data:image/... prefix) ──────────
async function fileToBase64(fileOrBlob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64  = dataUrl.split(',')[1];
      const mime    = dataUrl.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
      resolve({ base64, mimeType: mime });
    };
    reader.onerror = reject;
    reader.readAsDataURL(fileOrBlob);
  });
}

// Downscale large photos before sending — Gemini handles up to a few MB but
// smaller payloads = faster turnaround + less wasted output token budget.
// We cap at 1280px on the long edge before encoding.
async function downscale(fileOrBlob, maxEdge = 1280) {
  const url = URL.createObjectURL(fileOrBlob);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    if (Math.max(img.naturalWidth, img.naturalHeight) <= maxEdge) {
      return fileOrBlob;
    }
    const ratio = img.naturalWidth / img.naturalHeight;
    const w = ratio >= 1 ? maxEdge : Math.round(maxEdge * ratio);
    const h = ratio >= 1 ? Math.round(maxEdge / ratio) : maxEdge;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.92));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ─── Public: insert lifestyle people into a room (VideoTour-AI killer feature)
// Adds photorealistic people enjoying the space — a couple cooking in the
// kitchen, a family in the living room, etc. Same Gemini Image endpoint as
// staging, different prompt.
//
// Used by AutoReel as an optional "Lifestyle Mode" — adds the human element
// that VideoTour.AI charges $29/mo for. Free on Gemini's 500/day quota.
// customPeopleDesc: when provided (non-empty), replaces the mood-based default
//   people description. Lets the user say things like "people swimming in the
//   pool" for a pool photo where "family enjoying the backyard" wouldn't fit.
export async function addLifestylePeople({ photo, room = 'living', mood = 'family', customPeopleDesc, customNotes, onLog }) {
  const log = onLog || (() => {});

  const PEOPLE_BY_ROOM_MOOD = {
    kitchen: {
      family:  'a happy family with two parents and a child preparing a meal together',
      couple:  'a young attractive couple cooking and laughing together',
      luxury:  'an elegantly dressed couple having morning coffee',
    },
    living: {
      family:  'a family of four (two parents, two children) relaxing together on the couch',
      couple:  'a young couple cuddling on the couch with a book and warm drink',
      luxury:  'a sophisticated couple having a glass of wine by the fireplace',
    },
    dining: {
      family:  'a family enjoying dinner together around the dining table',
      couple:  'a couple having a romantic candlelit dinner',
      luxury:  'an elegant dinner party with four guests',
    },
    primary: {
      family:  'a person reading a book in bed in the morning light',
      couple:  'a couple enjoying coffee in bed with morning sunlight',
      luxury:  'a person in a luxurious robe by the window',
    },
    bedroom: {
      family:  'a child reading a book on the bed',
      couple:  'a person reading in a cozy armchair',
      luxury:  'a person enjoying a quiet moment in soft morning light',
    },
    bath: {
      family:  'soft natural light, fresh towels stacked, plant and candle accents (no people)',
      couple:  'soft natural light, fresh towels stacked, plant and candle accents (no people)',
      luxury:  'soft natural light, fresh towels stacked, plant and candle accents (no people)',
    },
    office: {
      family:  'a person working at the desk with focused natural light',
      couple:  'a person working at the desk with focused natural light',
      luxury:  'a person working at the desk with focused natural light',
    },
    outdoor: {
      family:  'a family enjoying the backyard with kids playing, parents on the patio',
      couple:  'a couple relaxing on the patio with drinks',
      luxury:  'an elegant outdoor entertaining setup with hosts and guests',
    },
    exterior: {
      family:  'a family arriving home, kids running to the front door',
      couple:  'a couple walking up the front path holding hands',
      luxury:  'an elegant couple posed by the entry',
    },
  };

  // Custom override beats the mood default — lets caller specify exactly
  // what the people should be doing for this specific photo.
  const peopleDesc = (customPeopleDesc && customPeopleDesc.trim())
    || (PEOPLE_BY_ROOM_MOOD[room]?.[mood])
    || PEOPLE_BY_ROOM_MOOD[room]?.family
    || `a person enjoying the space`;

  const prompt = [
    `Add ${peopleDesc} to this real estate listing photo.`,
    `CRITICAL: Maintain the exact architecture, walls, floors, ceiling, windows, doors, lighting, and camera angle of the original photo. Do not modify any structural or furniture elements.`,
    `The people should be photorealistic, natural-looking, well-dressed (real-estate-lifestyle appropriate), and posed naturally as if living in the space. Lighting on the people should match the room's lighting.`,
    `Style: real estate listing lifestyle photography — warm, inviting, aspirational but believable.`,
    customNotes ? `Additional notes: ${customNotes}` : '',
  ].filter(Boolean).join(' ');

  log(`Adding lifestyle people (${mood}) to ${room}…`);

  const blob = photo instanceof Blob ? photo : (photo?.file || photo);
  const aspectRatio = await detectAspectRatio(blob);
  const downsized = await downscale(blob);
  const { base64, mimeType } = await fileToBase64(downsized);

  const r = await fetch('/api/gemini/image-edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64, mimeType, prompt, aspectRatio }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error?.message || `Lifestyle gen failed: HTTP ${r.status}`);
  }
  const data = await r.json();
  const lifestyleBlob = await base64ToBlob(data.imageBase64, data.mimeType || 'image/png');
  log(`✓ Lifestyle image returned (${data.mimeType})`);
  return { blob: lifestyleBlob, mime: data.mimeType, promptUsed: prompt };
}

// ─── Public: stage one photo ─────────────────────────────────────────────────
export async function stagePhoto({ photo, room = 'living', style = 'modern', customNotes, onLog }) {
  const log = onLog || (() => {});
  log(`Staging ${room} · style=${style}`);

  // Resolve photo into a Blob
  const blob = photo instanceof Blob ? photo : (photo?.file || photo);
  // Detect the input's aspect ratio so the staged output matches the original's
  // framing (no awkward crop — important for MLS uploads).
  const aspectRatio = await detectAspectRatio(blob);
  const downsized = await downscale(blob);
  const { base64, mimeType } = await fileToBase64(downsized);
  log(`Sending ${(base64.length * 0.75 / 1024).toFixed(0)} KB to Gemini Image · aspect ${aspectRatio}`);

  const prompt = buildPrompt({ room, style, customNotes });

  const r = await fetch('/api/gemini/image-edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64, mimeType, prompt, aspectRatio }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error?.message || `Staging failed: HTTP ${r.status}`);
  }
  const data = await r.json();
  log(`✓ Staged image returned (${data.mimeType})`);

  // Convert returned base64 → Blob for downstream use
  const stagedBlob = await base64ToBlob(data.imageBase64, data.mimeType || 'image/png');
  return {
    blob: stagedBlob,
    mime: data.mimeType,
    promptUsed: prompt,
    textCommentary: data.textCommentary,
  };
}

// ─── Public: batch stage multiple photos ─────────────────────────────────────
// Runs sequentially (Gemini free tier has ~10 req/min cap; sequential keeps
// us well under). Calls onPhoto(idx, result|null, error?) for each.
export async function batchStage(photos, opts = {}, { onProgress, onPhoto, onLog } = {}) {
  const log = onLog || (() => {});
  const results = [];
  for (let i = 0; i < photos.length; i++) {
    const item = photos[i];
    log(`Photo ${i + 1}/${photos.length}: ${item.room || 'room'}`);
    onProgress?.(i / photos.length, `Staging photo ${i + 1} of ${photos.length}…`);
    try {
      const result = await stagePhoto({
        photo: item.photo || item.file || item.blob,
        room: item.room || opts.room || 'living',
        style: item.style || opts.style || 'modern',
        customNotes: item.customNotes || opts.customNotes,
        onLog: log,
      });
      results.push({ idx: i, ...result, original: item });
      onPhoto?.(i, result, null);
    } catch (e) {
      log(`Photo ${i + 1} failed: ${e.message}`);
      results.push({ idx: i, error: e.message, original: item });
      onPhoto?.(i, null, e);
    }
  }
  onProgress?.(1, 'Done');
  return results;
}

// ─── base64 → Blob ───────────────────────────────────────────────────────────
async function base64ToBlob(base64, mime = 'image/png') {
  // Use fetch on a data URL — simplest cross-browser conversion
  const r = await fetch(`data:${mime};base64,${base64}`);
  return await r.blob();
}

// ─── Detect input aspect ratio → closest Gemini-supported value ──────────────
// Gemini accepts a discrete set of aspect ratios for image generation. We pick
// the closest match to the input so the staged output retains the original's
// framing — critical for MLS uploads where photos have a consistent shape.
async function detectAspectRatio(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const ratio = img.naturalWidth / img.naturalHeight;
    const candidates = [
      { label: '1:1',  value: 1.0 },
      { label: '4:3',  value: 4/3 },
      { label: '3:4',  value: 3/4 },
      { label: '16:9', value: 16/9 },
      { label: '9:16', value: 9/16 },
      { label: '3:2',  value: 3/2 },
      { label: '2:3',  value: 2/3 },
    ];
    // Pick the candidate whose value is closest to the input's actual ratio
    let best = candidates[0];
    let bestDiff = Math.abs(ratio - best.value);
    for (const c of candidates) {
      const d = Math.abs(ratio - c.value);
      if (d < bestDiff) { best = c; bestDiff = d; }
    }
    return best.label;
  } catch (e) {
    return '4:3'; // safe default for real estate photos
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ─── Stamp "VIRTUALLY STAGED" badge on an image ──────────────────────────────
// Applied at download time only — the in-app preview stays clean for visual
// review. Bottom-right corner, dark pill with white text, large enough to read
// at MLS thumbnail size but unobtrusive.
//
// Per NAR's 2025 guidance, virtually staged photos should carry a visible
// label. Realcomp's general "no watermark" rule appears aimed at branding,
// not disclosure — when in doubt, leave the badge on or call Realcomp.
export async function stampVirtuallyStaged(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0);

    // Badge sizing scales with image size — readable at MLS thumbnail (~250px wide)
    const w = c.width;
    const h = c.height;
    const fontSize = Math.max(14, Math.floor(w * 0.022));
    const padX = fontSize * 0.9;
    const padY = fontSize * 0.55;
    const text = 'VIRTUALLY STAGED';

    ctx.font = `900 ${fontSize}px "Helvetica Neue", Arial, system-ui, sans-serif`;
    const textW = ctx.measureText(text).width;
    const pillW = textW + padX * 2;
    const pillH = fontSize + padY * 2;
    const margin = Math.floor(w * 0.018);
    const pillX = w - pillW - margin;
    const pillY = h - pillH - margin;

    // Pill backdrop — semi-opaque black with subtle border
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    roundedRect(ctx, pillX, pillY, pillW, pillH, pillH * 0.18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Text
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${fontSize}px "Helvetica Neue", Arial, system-ui, sans-serif`;
    ctx.fillText(text, pillX + pillW / 2, pillY + pillH / 2 + 1);

    return await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.95));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
