/**
 * aiVideoMotion — client wrapper for the LTX-Video motion server on Modal.
 *
 * Replaces AutoReel's Ken Burns canvas pipeline with real AI image-to-video
 * generation. Each photo gets sent to Monica's Modal endpoint, which returns
 * a 4-second mp4 clip with cinematic camera motion. Those clips are then
 * stitched in the browser via FFmpeg-wasm into the final reel.
 *
 * Server: tools/video-motion-server/modal_deploy.py (LTX-Video on L4 GPU)
 * Endpoint URL: stored in localStorage under VIDEO_MOTION_URL_LS_KEY
 *   default fallback: https://miskra26--ltx-motion-api.modal.run
 *
 * Cost: ~$0.002-0.004 per clip on her Modal account.
 */

// ─── Endpoint URL discovery ──────────────────────────────────────────────────
const VIDEO_MOTION_URL_LS_KEY = 'video_motion_remote_url';
const DEFAULT_VIDEO_MOTION_URL = 'https://miskra26--ltx-motion-api.modal.run';

export function getVideoMotionUrl() {
  try {
    return (localStorage.getItem(VIDEO_MOTION_URL_LS_KEY) || DEFAULT_VIDEO_MOTION_URL).replace(/\/+$/, '');
  } catch (e) {
    return DEFAULT_VIDEO_MOTION_URL;
  }
}

export function setVideoMotionUrl(url) {
  try {
    localStorage.setItem(VIDEO_MOTION_URL_LS_KEY, url || '');
  } catch (e) {/* ignore */}
}

// Probe /health to check the server is live and warm. Returns null on failure.
export async function probeVideoMotionServer(url) {
  const base = (url || getVideoMotionUrl()).replace(/\/+$/, '');
  if (!base) return null;
  try {
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const data = await r.json();
    return data?.ok ? { ...data, url: base } : null;
  } catch (e) {
    return null;
  }
}

// ─── Motion prompts per room type ────────────────────────────────────────────
// Real-estate-tuned prompts that produce believable camera motion without
// making the room "warp" or generate fake furniture. The negative prompt on
// the server handles the typical "AI weirdness" failure modes.
//
// Each room gets a small set of candidate motions — we vary them per scene
// so the reel doesn't feel repetitive (every shot the same push-in).
const ROOM_MOTIONS = {
  exterior: [
    'slow cinematic drone-style push forward toward the home, real estate listing quality, golden hour lighting',
    'slow drone-style pull back revealing the full home and front yard, cinematic real estate quality',
    'slow rightward orbit revealing the home from a flattering 3/4 angle, cinematic',
  ],
  entry: [
    'slow push forward through the foyer revealing the home interior, real estate walkthrough, warm cinematic lighting',
    'gentle pan right across the entryway revealing the open layout, cinematic real estate',
  ],
  kitchen: [
    'slow push-in revealing the kitchen island and stainless appliances, real estate cinematic, warm lighting',
    'gentle pan left across the chef\'s kitchen revealing the cabinetry and counters, cinematic real estate quality',
    'slow orbit around the kitchen island, cinematic real estate walkthrough, depth of field',
  ],
  living: [
    'slow push-in revealing the spacious living room and natural light, real estate walkthrough cinematic',
    'gentle pan right across the great room revealing the open floor plan, cinematic real estate listing',
    'slow pull-back revealing the room scale, cinematic real estate, warm lighting',
  ],
  dining: [
    'slow push-in revealing the formal dining room and chandelier, cinematic real estate',
    'gentle pan across the dining space, warm cinematic lighting, real estate listing quality',
  ],
  primary: [
    'slow push-in revealing the spacious primary suite, cinematic real estate, warm soft lighting',
    'gentle pan right across the primary bedroom revealing scale and natural light, real estate cinematic',
  ],
  bedroom: [
    'slow push-in revealing the bedroom, cinematic real estate, soft natural lighting',
    'gentle pan across the bedroom revealing the natural light and space, cinematic real estate listing',
  ],
  bath: [
    'slow push-in revealing the spa-like bathroom, cinematic real estate, soft natural lighting',
    'gentle pan revealing the bathroom finishes and fixtures, cinematic real estate',
  ],
  office: [
    'slow push-in revealing the home office, cinematic real estate, warm natural lighting',
    'gentle pan revealing the office layout and natural light, cinematic real estate listing',
  ],
  basement: [
    'slow push-in revealing the finished basement, cinematic real estate, warm lighting',
    'gentle pan across the lower level revealing the bonus space, cinematic real estate',
  ],
  outdoor: [
    'slow push forward revealing the backyard and outdoor living space, cinematic real estate, golden hour',
    'gentle pan across the patio revealing the outdoor amenities, cinematic real estate listing',
    'slow drone-style pull-back revealing the full yard, cinematic real estate quality',
  ],
  detail: [
    'subtle slow push-in toward the architectural detail, cinematic real estate, warm lighting',
    'gentle slow zoom on the feature, cinematic real estate quality, depth of field',
  ],
  other: [
    'slow gentle push-in, cinematic real estate, warm natural lighting',
  ],
};

// Pick a motion prompt for a scene. Deterministic on (sceneIdx, room) so
// re-renders of the same reel give the same motion variety.
export function pickMotionPrompt(room, sceneIdx = 0, featureLabel = '') {
  const list = ROOM_MOTIONS[room] || ROOM_MOTIONS.other;
  const base = list[sceneIdx % list.length];
  // Inject the AI-detected feature label so the motion can highlight it
  // ("WHITE QUARTZ ISLAND" → "...revealing the white quartz island...")
  if (featureLabel && featureLabel.trim()) {
    return `${base}, highlighting the ${featureLabel.toLowerCase()}`;
  }
  return base;
}

// ─── File → base64 (for sending to Modal) ────────────────────────────────────
async function fileToBase64NoPrefix(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Downscale before sending — LTX generates at 704×480, larger inputs waste
// bandwidth and don't improve output (LTX resizes internally anyway).
async function downscaleForLTX(blob, maxEdge = 1024) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
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

// ─── Generate a single clip ──────────────────────────────────────────────────
// Returns a Blob (video/mp4). Throws on error.
export async function generateClip({ photo, prompt, numFrames = 97, width = 704, height = 480, onLog } = {}) {
  const log = onLog || (() => {});
  const serverUrl = getVideoMotionUrl();

  // Source blob
  const srcBlob = photo instanceof Blob ? photo : (photo?.file || photo?.blob);
  if (!srcBlob) throw new Error('No photo provided to generateClip');
  const downsized = await downscaleForLTX(srcBlob);
  log(`Sending ${(downsized.size / 1024).toFixed(0)} KB image to LTX-Video at ${serverUrl}…`);

  const fd = new FormData();
  fd.append('image', downsized, 'photo.jpg');
  fd.append('prompt', prompt);
  fd.append('num_frames', String(numFrames));
  fd.append('width',  String(width));
  fd.append('height', String(height));

  const r = await fetch(`${serverUrl}/generate`, { method: 'POST', body: fd });
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json())?.detail || (await r.text()); } catch {}
    throw new Error(`LTX-Video ${r.status}: ${(detail || '').toString().slice(0, 200)}`);
  }
  const blob = await r.blob();
  log(`✓ Got ${(blob.size / 1024).toFixed(0)} KB mp4 back`);
  return blob;
}

// ─── Batch: generate clips for every scene, sequentially ──────────────────────
// Sequential rather than parallel because Modal's L4 only handles one
// inference at a time on a single container — parallelizing would just queue
// on the GPU side without saving any wall time.
export async function generateClipsForScenes(scenes, { onProgress, onLog, onClip } = {}) {
  const log = onLog || (() => {});
  const results = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    onProgress?.(i / scenes.length, `Generating AI motion for scene ${i + 1}/${scenes.length} (${s.room})…`);
    const prompt = pickMotionPrompt(s.room, i, s.label || '');
    log(`Scene ${i + 1}: room=${s.room} prompt="${prompt.slice(0, 80)}…"`);
    try {
      const blob = await generateClip({ photo: s.photo, prompt, onLog: log });
      results.push({ idx: i, blob, prompt });
      onClip?.(i, blob, null);
    } catch (e) {
      log(`Scene ${i + 1} failed: ${e.message}`);
      results.push({ idx: i, error: e.message });
      onClip?.(i, null, e);
    }
  }
  onProgress?.(1, 'All AI clips generated');
  return results;
}
