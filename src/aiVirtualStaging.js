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

// ─── Public: stage one photo ─────────────────────────────────────────────────
export async function stagePhoto({ photo, room = 'living', style = 'modern', customNotes, onLog }) {
  const log = onLog || (() => {});
  log(`Staging ${room} · style=${style}`);

  // Resolve photo into a Blob
  const blob = photo instanceof Blob ? photo : (photo?.file || photo);
  const downsized = await downscale(blob);
  const { base64, mimeType } = await fileToBase64(downsized);
  log(`Sending ${(base64.length * 0.75 / 1024).toFixed(0)} KB to Gemini Image…`);

  const prompt = buildPrompt({ room, style, customNotes });

  const r = await fetch('/api/gemini/image-edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64, mimeType, prompt }),
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
