/**
 * aiDepthMap — in-browser monocular depth estimation for parallax Ken Burns.
 *
 * Uses Depth-Anything-v2-small via @xenova/transformers (the same library
 * already powering Whisper transcription in audioCleaner.js). The model is
 * ~50MB, downloads once on first use, then cached forever in IndexedDB.
 *
 * Input:  an image (Blob / File / URL / HTMLImageElement)
 * Output: ImageData with grayscale depth values (255 = closest, 0 = farthest)
 *
 * Why this matters: lets cinematicRender do a 3-layer parallax pan (foreground
 * moves faster than background) instead of flat Ken Burns. Closes a chunk of
 * the gap to AutoReel's "camera moving through the room" feel WITHOUT paying
 * for a real AI video model.
 */

// ── Singleton model loader ───────────────────────────────────────────────────
// First call downloads weights from HF CDN (~50MB), caches in IndexedDB.
// Subsequent calls are instant.
let _estimatorPromise = null;
async function getEstimator(onLog) {
  if (_estimatorPromise) return _estimatorPromise;
  _estimatorPromise = (async () => {
    onLog?.('Loading Depth-Anything model (~50MB, one-time)…');
    const { pipeline, env } = await import('@xenova/transformers');
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    // Small variant — fast enough to process 8 photos in ~20-30 sec total
    const estimator = await pipeline(
      'depth-estimation',
      'Xenova/depth-anything-small-hf',
      { quantized: true }
    );
    onLog?.('Depth model loaded.');
    return estimator;
  })();
  return _estimatorPromise;
}

// ── Public: generate depth map for one photo ─────────────────────────────────
// Returns { depthCanvas, width, height } — a canvas containing the grayscale
// depth map at the SAME aspect ratio as the input. The cinematic renderer
// uses this to mask foreground/midground/background layers.
export async function generateDepthMap(source, opts = {}) {
  const onLog = opts.onLog || (() => {});
  const estimator = await getEstimator(onLog);

  // Resolve source → URL string that transformers can fetch
  let url;
  let revokeAfter = false;
  if (source instanceof Blob) {
    url = URL.createObjectURL(source);
    revokeAfter = true;
  } else if (typeof source === 'string') {
    url = source;
  } else if (source?.url) {
    url = source.url;
  } else if (source?.file) {
    url = URL.createObjectURL(source.file);
    revokeAfter = true;
  } else {
    throw new Error('Unsupported source for depth map');
  }

  try {
    onLog('Estimating depth…');
    const result = await estimator(url);
    // result.depth is a RawImage with .data (Uint8Array), .width, .height
    const { data, width, height } = result.depth;
    onLog(`✓ Depth map ${width}×${height}`);

    // Pack into an ImageData on a canvas so cinematicRender can paint it
    // as an alpha mask / sampling source.
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    const imgData = ctx.createImageData(width, height);
    // The model returns 1 channel of depth — we replicate to RGBA so the
    // ImageData is a normal grayscale image.
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const j = i * 4;
      imgData.data[j]     = d;
      imgData.data[j + 1] = d;
      imgData.data[j + 2] = d;
      imgData.data[j + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    return { depthCanvas: c, width, height };
  } finally {
    if (revokeAfter) URL.revokeObjectURL(url);
  }
}

// ── Public: batch depth maps for an array of photos ──────────────────────────
// Sequential to keep memory in check on lower-end machines. Calls onProgress
// after each. Errors per-photo are non-fatal — the bad one just gets a null
// depth map and falls back to flat Ken Burns for that scene.
export async function generateDepthMapsBatch(photos, { onProgress, onLog } = {}) {
  const out = [];
  for (let i = 0; i < photos.length; i++) {
    onProgress?.(i / photos.length, `Estimating depth for scene ${i + 1}/${photos.length}…`);
    try {
      const result = await generateDepthMap(photos[i].photo || photos[i], { onLog });
      out.push(result);
    } catch (e) {
      onLog?.(`Depth gen failed for scene ${i + 1}: ${e.message}`);
      out.push(null);
    }
  }
  onProgress?.(1, 'Depth maps ready');
  return out;
}

// ── Helper: extract 3 depth-mask canvases from one depth map ─────────────────
// Returns { foregroundMask, midgroundMask, backgroundMask } — each a canvas
// the same dims as the depth map, white where that layer should be visible.
// Thresholds tuned so foreground catches the main subject without aliasing.
export function depthMapToLayerMasks(depthCanvas) {
  const { width, height } = depthCanvas;
  const dctx = depthCanvas.getContext('2d');
  const depthData = dctx.getImageData(0, 0, width, height).data;

  // Three masks
  const fg = document.createElement('canvas'); fg.width = width; fg.height = height;
  const mg = document.createElement('canvas'); mg.width = width; mg.height = height;
  const bg = document.createElement('canvas'); bg.width = width; bg.height = height;
  const fgCtx = fg.getContext('2d');
  const mgCtx = mg.getContext('2d');
  const bgCtx = bg.getContext('2d');
  const fgData = fgCtx.createImageData(width, height);
  const mgData = mgCtx.createImageData(width, height);
  const bgData = bgCtx.createImageData(width, height);

  for (let i = 0; i < depthData.length; i += 4) {
    const d = depthData[i]; // grayscale (R channel)
    // Soft thresholds with overlap to avoid hard seams
    let aFg = 0, aMg = 0, aBg = 0;
    if (d > 180)      { aFg = 255; aMg = Math.max(0, 255 - (d - 180) * 5); }
    else if (d > 100) { aMg = 255; aFg = Math.max(0, 255 - (180 - d) * 3); aBg = Math.max(0, 255 - (d - 100) * 3); }
    else              { aBg = 255; aMg = Math.max(0, 255 - (100 - d) * 5); }
    fgData.data[i] = fgData.data[i+1] = fgData.data[i+2] = 255; fgData.data[i+3] = aFg;
    mgData.data[i] = mgData.data[i+1] = mgData.data[i+2] = 255; mgData.data[i+3] = aMg;
    bgData.data[i] = bgData.data[i+1] = bgData.data[i+2] = 255; bgData.data[i+3] = aBg;
  }
  fgCtx.putImageData(fgData, 0, 0);
  mgCtx.putImageData(mgData, 0, 0);
  bgCtx.putImageData(bgData, 0, 0);
  return { foregroundMask: fg, midgroundMask: mg, backgroundMask: bg };
}
