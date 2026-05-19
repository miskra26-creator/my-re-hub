// VideoAuto.jsx — Hands-off automated video maker.
// Pick a template → drop in clips → fill 2–3 fields → one button → MP4.
// Engine: Canvas + MediaRecorder. No CapCut clone, no timeline.

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLS, useIDB } from './cloudHooks';
import { cleanAudio, transcodeWebMtoMP4, trimVideo } from './audioCleaner';

// Local copy of callClaude — same behavior as the one in App.js.
const callClaudeLocal = async (prompt, sys = '', tokens = 1500) => {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: tokens,
      ...(sys ? { system: sys } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content[0].text;
};

// ─── FREE MUSIC LIBRARY ──────────────────────────────────────────────────────
// Mix of Pixabay (free for commercial use, no attribution required) +
// user can always upload their own track.
// Note: URLs are validated lazily — if any track fails to load, user gets a
// friendly error and can use upload-your-own.
export const FREE_MUSIC = [
  { id:'upbeat',     name:'Upbeat',         mood:'Energetic',  emoji:'⚡',
    url:'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=energetic-rock-trailer-110888.mp3' },
  { id:'cinematic',  name:'Cinematic',      mood:'Dramatic',   emoji:'🎬',
    url:'https://cdn.pixabay.com/download/audio/2022/03/15/audio_1b1bf67c40.mp3?filename=cinematic-time-lapse-115672.mp3' },
  { id:'chill',      name:'Chill Vibe',     mood:'Lo-fi',      emoji:'🌊',
    url:'https://cdn.pixabay.com/download/audio/2022/10/30/audio_347111d654.mp3?filename=lofi-chill-medium-version-159456.mp3' },
  { id:'inspire',    name:'Inspirational',  mood:'Motivational', emoji:'✨',
    url:'https://cdn.pixabay.com/download/audio/2022/01/18/audio_dc39bde808.mp3?filename=inspiring-cinematic-ambient-116199.mp3' },
  { id:'corporate',  name:'Professional',   mood:'Corporate',  emoji:'💼',
    url:'https://cdn.pixabay.com/download/audio/2022/03/10/audio_8cb749db17.mp3?filename=corporate-uplifting-117676.mp3' },
  { id:'happy',      name:'Happy Pop',      mood:'Upbeat',     emoji:'☀️',
    url:'https://cdn.pixabay.com/download/audio/2021/11/23/audio_64b2dd1bce.mp3?filename=happy-pop-114350.mp3' },
];

// ─── iPhone format converters (lazy-loaded) ──────────────────────────────────
function needsConversion(file) {
  const n = (file.name || '').toLowerCase();
  return n.endsWith('.heic') || n.endsWith('.heif')
      || n.endsWith('.mov')  // iPhone .mov is usually HEVC; transcode to H.264 MP4
      || file.type === 'image/heic' || file.type === 'image/heif';
}

async function convertHEICtoJPEG(file) {
  const heic2any = (await import('heic2any')).default;
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
  const blob = Array.isArray(out) ? out[0] : out;
  return new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
}

let _ffmpegPromise = null;
async function getFFmpeg(onLog) {
  if (_ffmpegPromise) return _ffmpegPromise;
  _ffmpegPromise = (async () => {
    onLog?.('Loading FFmpeg engine (~30 MB, one-time)…');
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
    const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    const ffmpeg = new FFmpeg();
    if (onLog) ffmpeg.on('log', ({ message }) => onLog(message));
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`,   'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    return { ffmpeg, fetchFile };
  })();
  return _ffmpegPromise;
}

async function transcodeVideoToMP4(file, onProgress) {
  const { ffmpeg, fetchFile } = await getFFmpeg();
  if (onProgress) ffmpeg.on('progress', ({ progress }) => onProgress(progress));
  const inExt   = (file.name.match(/\.\w+$/)?.[0] || '.mov').toLowerCase();
  const inName  = `in${inExt}`;
  const outName = 'out.mp4';
  await ffmpeg.writeFile(inName, await fetchFile(file));
  await ffmpeg.exec([
    '-i', inName,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outName,
  ]);
  const data = await ffmpeg.readFile(outName);
  try { await ffmpeg.deleteFile(inName); } catch {}
  try { await ffmpeg.deleteFile(outName); } catch {}
  return new File([data], file.name.replace(/\.\w+$/, '.mp4'), { type: 'video/mp4' });
}

async function convertFile(file, onLog, onProgress) {
  const n = (file.name || '').toLowerCase();
  if (n.endsWith('.heic') || n.endsWith('.heif') || file.type.includes('heic') || file.type.includes('heif')) {
    onLog?.(`Converting ${file.name} (HEIC → JPEG)…`);
    return await convertHEICtoJPEG(file);
  }
  if (n.endsWith('.mov')) {
    onLog?.(`Transcoding ${file.name} (HEVC → MP4)…`);
    return await transcodeVideoToMP4(file, onProgress);
  }
  return file;
}

// ─── TEMPLATES ────────────────────────────────────────────────────────────────
export const TEMPLATES = [
  // Real estate
  { id:'just-listed', cat:'Real Estate', emoji:'🏡', name:'Just Listed Reel',
    intro:'JUST LISTED', accent:'#d4a017',
    fields:[
      { key:'address',  label:'Address',  placeholder:'123 Maple St, Livonia MI' },
      { key:'price',    label:'Price',    placeholder:'$549,000' },
      { key:'beds',     label:'Beds',     placeholder:'4' },
      { key:'baths',    label:'Baths',    placeholder:'3' },
      { key:'sqft',     label:'Sqft',     placeholder:'2,400' },
    ],
    minClips:1, maxClips:12, sceneSeconds:2.4,
  },
  { id:'just-sold', cat:'Real Estate', emoji:'🎉', name:'Just Sold',
    intro:'JUST SOLD', accent:'#16a34a',
    fields:[
      { key:'address',  label:'Address' },
      { key:'message',  label:'Congrats line', placeholder:'Congrats to the Smith Family!' },
    ],
    minClips:1, maxClips:6, sceneSeconds:3,
  },
  { id:'open-house', cat:'Real Estate', emoji:'🚪', name:'Open House Promo',
    intro:'OPEN HOUSE', accent:'#3b82f6',
    fields:[
      { key:'address',  label:'Address' },
      { key:'when',     label:'When', placeholder:'Sat 1–3 PM' },
      { key:'price',    label:'List Price' },
    ],
    minClips:1, maxClips:8, sceneSeconds:2.4,
  },
  { id:'market-update', cat:'Real Estate', emoji:'📈', name:'Market Update',
    intro:'MARKET UPDATE', accent:'#8b5cf6',
    fields:[
      { key:'area',         label:'Area',          placeholder:'Livonia, MI' },
      { key:'period',       label:'Period',        placeholder:'May 2026' },
      { key:'medianPrice',  label:'Median Price',  placeholder:'$329,000' },
      { key:'avgDays',      label:'Days on Market', placeholder:'14' },
      { key:'inventory',    label:'Inventory',     placeholder:'287 homes' },
    ],
    minClips:1, maxClips:6, sceneSeconds:3.2,
  },
  // Personal brand
  { id:'brand-intro', cat:'Personal Brand', emoji:'👋', name:'Intro Reel',
    intro:'', accent:'#1a5aa0',
    fields:[
      { key:'name',     label:'Name' },
      { key:'tagline',  label:'Tagline', placeholder:'Helping families find home in Livonia' },
    ],
    minClips:1, maxClips:10, sceneSeconds:2.5,
  },
  { id:'day-in-life', cat:'Personal Brand', emoji:'☀️', name:'Day in the Life',
    intro:'DAY IN THE LIFE', accent:'#ec4899',
    fields:[
      { key:'title', label:'Title', placeholder:'A day with Monica' },
    ],
    minClips:1, maxClips:18, sceneSeconds:1.8,
  },
  // Educational
  { id:'tip-of-week', cat:'Educational', emoji:'💡', name:'Tip of the Week',
    intro:'TIP OF THE WEEK', accent:'#f59e0b',
    fields:[
      { key:'tip',      label:'The Tip', placeholder:'Get pre-approved BEFORE house hunting' },
      { key:'why',      label:'Why it matters', placeholder:'Sellers won’t consider offers without it' },
    ],
    minClips:1, maxClips:4, sceneSeconds:4,
  },
  // Lifestyle / Event
  { id:'event-recap', cat:'Lifestyle', emoji:'🎈', name:'Event Recap',
    intro:'RECAP', accent:'#06b6d4',
    fields:[
      { key:'event', label:'Event',  placeholder:'Livonia Spring Festival' },
      { key:'date',  label:'Date',   placeholder:'May 10, 2026' },
    ],
    minClips:1, maxClips:18, sceneSeconds:1.8,
  },
  { id:'neighborhood', cat:'Lifestyle', emoji:'🌳', name:'Neighborhood Spotlight',
    intro:'SPOTLIGHT', accent:'#10b981',
    fields:[
      { key:'area',  label:'Neighborhood' },
      { key:'tag',   label:'Tagline', placeholder:'Why we love Livonia' },
    ],
    minClips:1, maxClips:15, sceneSeconds:2.2,
  },
  // Social proof
  { id:'testimonial', cat:'Social Proof', emoji:'⭐', name:'Client Testimonial',
    intro:'CLIENTS SAY', accent:'#d4a017',
    fields:[
      { key:'quote',  label:'Quote' },
      { key:'client', label:'Client Name' },
    ],
    minClips:1, maxClips:5, sceneSeconds:4,
  },
];

const ASPECTS = {
  '9:16': { w: 1080, h: 1920, label:'Vertical · Reel / TikTok / Shorts' },
  '1:1' : { w: 1080, h: 1080, label:'Square · IG Post / FB' },
  '16:9': { w: 1920, h: 1080, label:'Horizontal · YouTube' },
};

// Quality presets — scale factor applied to the canvas + bitrate cap.
export const QUALITY = {
  fast:     { name:'Fast',     emoji:'⚡', scale: 0.50, bitrate: 2_000_000, desc:'540p · smallest file · max browser compatibility' },
  standard: { name:'Standard', emoji:'🎯', scale: 0.75, bitrate: 4_000_000, desc:'810p · balanced (recommended)' },
  high:     { name:'High',     emoji:'💎', scale: 1.00, bitrate: 6_000_000, desc:'1080p · best quality · larger file' },
};

// ─── FILTERS ──────────────────────────────────────────────────────────────────
// Each filter is a CSS filter string applied to canvas 2D context before drawing.
// 'auto' is special: analyzed per-image at upload time, stored as clip.autoFilterCss.
export const FILTERS = [
  { id:'auto',     name:'Auto Enhance', css:null, emoji:'✨', desc:'Analyzes each photo and tunes brightness, contrast, color' },
  { id:'none',     name:'Original',     css:'none', emoji:'⚪' },
  { id:'bright',   name:'Bright',       css:'brightness(1.1) saturate(1.18) contrast(1.04)', emoji:'☀️' },
  { id:'warm',     name:'Warm',         css:'saturate(1.18) sepia(.15) brightness(1.05) contrast(1.04)', emoji:'🌅' },
  { id:'cool',     name:'Cool',         css:'saturate(1.1) hue-rotate(-10deg) brightness(1.05)', emoji:'❄️' },
  { id:'vibrant',  name:'Vibrant',      css:'saturate(1.5) contrast(1.18) brightness(1.02)', emoji:'🌈' },
  { id:'soft',     name:'Soft',         css:'brightness(1.06) saturate(.88) contrast(.95)', emoji:'☁️' },
  { id:'punch',    name:'Punch',        css:'contrast(1.3) saturate(1.3) brightness(1.04)', emoji:'💥' },
  { id:'film',     name:'Film',         css:'contrast(1.1) saturate(.85) sepia(.1) brightness(.98)', emoji:'🎞️' },
  { id:'bw',       name:'B&W',          css:'grayscale(1) contrast(1.12)', emoji:'⚫' },
  { id:'twilight', name:'Twilight',     css:'brightness(1.08) saturate(1.4) hue-rotate(-15deg) contrast(1.08)', emoji:'🌆' },
  { id:'luxe',     name:'Luxe',         css:'contrast(1.18) saturate(1.15) brightness(.95) sepia(.06)', emoji:'💎' },
  { id:'cozy',     name:'Cozy',         css:'saturate(1.15) sepia(.18) brightness(1.06) contrast(1.06)', emoji:'🏠' },
];
const FILTERS_BY_ID = Object.fromEntries(FILTERS.map(f => [f.id, f]));

// Analyze image → return CSS filter string that auto-tunes it.
function computeAutoFilter(imgOrVideo) {
  try {
    const off = document.createElement('canvas');
    off.width = 96; off.height = 96;
    const oc = off.getContext('2d');
    oc.drawImage(imgOrVideo, 0, 0, 96, 96);
    const { data } = oc.getImageData(0, 0, 96, 96);
    let r=0, g=0, b=0, sat=0, n=0;
    for (let i = 0; i < data.length; i += 4) {
      const R=data[i], G=data[i+1], B=data[i+2];
      r += R; g += G; b += B;
      const mx = Math.max(R,G,B), mn = Math.min(R,G,B);
      sat += mx > 0 ? (mx - mn) / mx : 0;
      n++;
    }
    const avgR = r/n, avgG = g/n, avgB = b/n;
    const lum  = (avgR + avgG + avgB) / 3;
    const avgSat = sat/n;

    // brightness: aim for ~135 average luminance
    const brightness = Math.max(0.95, Math.min(1.35, 135 / Math.max(60, lum)));
    // contrast: boost more for flat/dull images
    const contrast = Math.max(1.04, Math.min(1.28, 1.04 + (1 - avgSat) * 0.30));
    // saturation: boost more for desaturated images, gently for vibrant ones
    const saturate = Math.max(1.05, Math.min(1.45, 1.10 + (1 - avgSat) * 0.45));
    // color cast: counterbalance if image leans too warm or too cool
    let hue = 0;
    if (avgR > avgB * 1.18)      hue = -6;       // de-warm
    else if (avgB > avgR * 1.15) hue = 4;        // slightly warm a cool image

    const parts = [
      `brightness(${brightness.toFixed(3)})`,
      `contrast(${contrast.toFixed(3)})`,
      `saturate(${saturate.toFixed(3)})`,
    ];
    if (hue) parts.push(`hue-rotate(${hue}deg)`);
    return parts.join(' ');
  } catch (e) {
    return 'brightness(1.04) contrast(1.08) saturate(1.12)'; // safe default
  }
}

// Get effective filter CSS for a clip given the global selection.
function getFilterCss(clip, globalFilter) {
  if (globalFilter === 'auto') return clip.autoFilterCss || 'brightness(1.04) contrast(1.08) saturate(1.12)';
  const f = FILTERS_BY_ID[globalFilter];
  return f?.css || 'none';
}

// ─── MEDIA LOADERS ────────────────────────────────────────────────────────────
const loadImage = src => new Promise((res, rej) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload  = () => res(img);
  img.onerror = rej;
  img.src = src;
});

const loadVideo = src => new Promise((res, rej) => {
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous';
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.onloadeddata = () => res(v);
  v.onerror = rej;
  v.src = src;
});

// ─── CANVAS HELPERS ───────────────────────────────────────────────────────────
function drawCoverFit(ctx, el, x, y, w, h, zoom = 1, panX = 0, panY = 0) {
  const iw = el.naturalWidth  || el.videoWidth  || 1;
  const ih = el.naturalHeight || el.videoHeight || 1;
  if (!iw || !ih) return;
  const target = w / h;
  const src    = iw / ih;
  let sw, sh, sx, sy;
  if (src > target) { sh = ih; sw = ih * target; sx = (iw - sw)/2; sy = 0; }
  else              { sw = iw; sh = iw / target; sx = 0;           sy = (ih - sh)/2; }
  // zoom (crop inward)
  const zW = sw / zoom, zH = sh / zoom;
  sx += (sw - zW)/2 + panX * (sw - zW) * 0.5;
  sy += (sh - zH)/2 + panY * (sh - zH) * 0.5;
  ctx.drawImage(el, sx, sy, zW, zH, x, y, w, h);
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = (text || '').toString().split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width <= maxWidth) cur = t;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawCard(ctx, lines, cx, cy, opts = {}) {
  const {
    fontSize = 56, weight = 800, color = '#fff',
    bg = 'rgba(0,0,0,.55)', pad = 28, radius = 18,
    maxWidth = 900, lineHeightMul = 1.18, accent = null,
  } = opts;
  ctx.font = `${weight} ${fontSize}px "DM Sans", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const wrapped = lines.flatMap(l => wrapText(ctx, l, maxWidth));
  const lh = fontSize * lineHeightMul;
  const totalH = wrapped.length * lh;
  const totalW = Math.min(maxWidth, Math.max(...wrapped.map(l => ctx.measureText(l).width)));
  if (bg && bg !== 'transparent') {
    ctx.fillStyle = bg;
    roundedRect(ctx, cx - totalW/2 - pad, cy - totalH/2 - pad*.4, totalW + pad*2, totalH + pad*.8, radius);
    ctx.fill();
    if (accent) {
      ctx.fillStyle = accent;
      roundedRect(ctx, cx - totalW/2 - pad, cy + totalH/2 + pad*.4 - 6, totalW + pad*2, 6, 3);
      ctx.fill();
    }
  }
  ctx.fillStyle = color;
  wrapped.forEach((l, i) => ctx.fillText(l, cx, cy - totalH/2 + lh/2 + i*lh));
}

// ─── RENDER ENGINE ────────────────────────────────────────────────────────────
// Overlay positions (PIP corners)
const OVERLAY_POS = {
  'top-left':     { x: 0.04,  y: 0.06,  ax: 0,   ay: 0   },
  'top-right':    { x: 0.96,  y: 0.06,  ax: 1,   ay: 0   },
  'bottom-left':  { x: 0.04,  y: 0.94,  ax: 0,   ay: 1   },
  'bottom-right': { x: 0.96,  y: 0.94,  ax: 1,   ay: 1   },
  'center-low':   { x: 0.50,  y: 0.88,  ax: 0.5, ay: 1   },
};

const TRANSITION_DUR = 0.4; // seconds

// Returns an alpha-faded draw of a single scene's background image/video at sceneIdx + sceneT.
// Used for crossfade-style transitions. Caller must wrap in save/restore + set globalAlpha.
function drawSceneBackground(ctx, loaded, sceneIdx, sceneT, clipDurs, w, h, filter, clips, transitionShift) {
  const clip = loaded[sceneIdx];
  if (!clip) return;
  const zoom = 1 + sceneT * 0.18;
  const panX = (sceneIdx % 2 ? -1 : 1) * (sceneT - 0.5) * 0.6;
  const panY = (sceneIdx % 3 === 0) ? (sceneT - 0.5) * 0.4 : 0;

  const effectiveFilterId = clips[sceneIdx].filterOverride || filter;
  const filterCss = getFilterCss(clips[sceneIdx], effectiveFilterId);
  ctx.filter = filterCss || 'none';

  // Apply transition shift if provided
  if (transitionShift) {
    const { dx = 0, dy = 0, scale = 1 } = transitionShift;
    ctx.save();
    ctx.translate(w/2 + dx, h/2 + dy);
    ctx.scale(scale, scale);
    ctx.translate(-w/2, -h/2);
  }

  if (clip.kind === 'video') {
    drawCoverFit(ctx, clip.el, 0, 0, w, h, 1.02, 0, 0);
  } else {
    drawCoverFit(ctx, clip.el, 0, 0, w, h, zoom, panX, panY);
  }

  if (transitionShift) ctx.restore();
  ctx.filter = 'none';
}

// Hook intro styles
export const HOOK_STYLES = [
  { id:'card',   name:'Solid Card', emoji:'🎴', desc:'Accent color block with big text — clean & branded' },
  { id:'photo',  name:'Photo Hook', emoji:'🖼️', desc:'First photo with darkened overlay + hook text — best for scroll-stopping' },
  { id:'typein', name:'Type-In',    emoji:'⌨️', desc:'Letters appear one at a time — TikTok / Reels style' },
  { id:'burst',  name:'Zoom Burst', emoji:'💥', desc:'Text starts huge and bounces in — attention-grabber' },
];

async function renderVideo({
  template, aspect, clips, fields, brand, music, filter='auto', overlay,
  transition='fade', hookStyle='card', hookText, quality='standard', cta,
  onProgress, onLog,
}) {
  // Resolve effective accent color: brand override if enabled, else template's
  const effectiveAccent = (brand?.useBrandColors && brand?.accentColor) ? brand.accentColor : template.accent;
  const effectivePrimary = (brand?.useBrandColors && brand?.primaryColor) ? brand.primaryColor : (template.accent || '#1a5aa0');
  const qPreset = QUALITY[quality] || QUALITY.standard;

  // Pre-load brand logo if present
  let logoEl = null;
  if (brand?.logoUrl) {
    try { logoEl = await loadImage(brand.logoUrl); } catch (e) { /* ignore */ }
  }
  const baseAsp = ASPECTS[aspect];
  const w = Math.round(baseAsp.w * qPreset.scale / 2) * 2;
  const h = Math.round(baseAsp.h * qPreset.scale / 2) * 2;
  onLog?.(`Quality: ${qPreset.name} (${w}×${h})`);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  // Chrome will refuse to capture frames from a detached canvas in some versions.
  // Append off-screen so captureStream() works reliably.
  canvas.style.cssText = 'position:fixed;left:-99999px;top:-99999px;pointer-events:none;opacity:0;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });
  // Paint one frame immediately so the stream has data when we start recording.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  const fps        = 30;
  const splashDur  = (brand?.splash && (logoEl || brand?.name)) ? Math.max(0.3, Math.min(1.5, brand?.splashDur || 0.7)) : 0;
  const introDur   = template.intro ? 1.4 : 0;
  const outroDur   = (brand && brand.show !== false) ? 2.2 : 0;

  // Pre-load overlay video first so we know its duration
  let overlayEl = null;
  if (overlay?.url) {
    onLog?.('Loading overlay video…');
    try { overlayEl = await loadVideo(overlay.url); } catch (e) { onLog?.(`Overlay load failed: ${e.message}`); }
  }

  // If overlay is present, scenes cycle to fit overlay duration; else scenes drive timing
  const baseDur    = template.sceneSeconds || 2.4;
  // Per-clip duration overrides
  const clipDurs   = clips.map(c => c.durationOverride || baseDur);
  const totalClipDur = clipDurs.reduce((s, d) => s + d, 0);
  const scenesDur  = overlayEl
    ? Math.max(overlayEl.duration || 0, totalClipDur)
    : totalClipDur;
  const totalDur   = splashDur + introDur + scenesDur + outroDur;
  // Precompute scene start times (for non-looping case)
  const sceneStarts = [];
  let _accum = 0;
  for (const d of clipDurs) { sceneStarts.push(_accum); _accum += d; }
  // For looping (when overlay extends scenesDur), we keep cycling through clips
  // Helper: find which clip is on screen at time `cur` (relative to scenes phase)
  const sceneDur = baseDur; // kept for progress bar math

  onLog?.(`Loading ${clips.length} clips…`);
  const loaded = await Promise.all(clips.map(async c => {
    if (c.kind === 'video') {
      const el = await loadVideo(c.url);
      return { kind:'video', el };
    } else {
      const el = await loadImage(c.url);
      return { kind:'image', el };
    }
  }));

  onLog?.(`Setting up recorder at ${w}×${h}…`);
  if (typeof canvas.captureStream !== 'function') {
    try { canvas.remove(); } catch {}
    throw new Error('canvas.captureStream not supported in this browser. Use latest Chrome or Edge.');
  }
  const stream = canvas.captureStream(fps);
  console.log('[VideoAuto] stream:', stream, 'tracks:', stream?.getTracks?.());
  if (!stream || stream.getVideoTracks().length === 0) {
    try { canvas.remove(); } catch {}
    throw new Error('Canvas captureStream produced no video tracks — your browser may not support this');
  }
  onLog?.(`Stream OK · ${stream.getVideoTracks().length} video track(s)`);

  // Audio mixing: overlay video audio (talking head) + optional music.
  // Only set up an AudioContext when we actually have something to mix —
  // creating one unused can interfere with canvas capture in some browsers.
  let audioCtx;
  let musicEl = null;
  const hasAudio = overlayEl || (music && music.url);
  if (hasAudio) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();
      let trackCount = 0;

      if (overlayEl) {
        overlayEl.muted = false;
        overlayEl.volume = 1.0;
        const ovSrc = audioCtx.createMediaElementSource(overlayEl);
        const ovGain = audioCtx.createGain();
        ovGain.gain.value = (overlay?.volume ?? 1.0);
        ovSrc.connect(ovGain).connect(dest);
        trackCount++;
      }

      if (music?.url) {
        musicEl = new Audio(music.url);
        musicEl.crossOrigin = 'anonymous';
        musicEl.loop = true;
        const mSrc  = audioCtx.createMediaElementSource(musicEl);
        const mGain = audioCtx.createGain();
        // Duck music when overlay (voice) is present
        mGain.gain.value = overlayEl ? 0.18 : 0.7;
        mSrc.connect(mGain).connect(dest);
        await musicEl.play().catch(()=>{});
        trackCount++;
      }

      if (trackCount > 0) {
        dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
      }
      onLog?.(`Audio tracks attached: ${trackCount}`);
    } catch (e) {
      onLog?.(`Audio setup skipped: ${e.message}`);
      console.error('[VideoAuto] audio setup error', e);
    }
  } else {
    onLog?.('No audio sources — recording video-only.');
  }

  // Prefer VP8 (faster finalization than VP9 in Chrome)
  const mime = ['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm;codecs=vp8','video/webm']
    .find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
  const chunks = [];
  let dataEvents = 0;
  let emptyEvents = 0;
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: qPreset.bitrate });
  rec.ondataavailable = e => {
    dataEvents++;
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
      if (chunks.length === 1) onLog?.(`First chunk received (${e.data.size} bytes)`);
      else if (chunks.length % 3 === 0)
        onLog?.(`Recording… ${chunks.length} chunks (${(chunks.reduce((s,c)=>s+c.size,0)/1024).toFixed(0)} KB)`);
    } else {
      emptyEvents++;
    }
  };
  rec.onerror = e => { console.error('[VideoAuto] recorder error', e); onLog?.(`Recorder error: ${e.error?.message || e}`); };
  rec.onstart = () => onLog?.(`Recorder started (state=${rec.state})`);
  const done = new Promise(r => (rec.onstop = r));
  onLog?.(`Codec: ${mime}`);
  try {
    rec.start(500); // emit a chunk every 500ms so finalization is fast
  } catch (err) {
    try { canvas.remove(); } catch {}
    throw new Error(`MediaRecorder.start failed: ${err.message}`);
  }

  onLog?.(`Recording ${totalDur.toFixed(1)}s…`);
  const t0 = performance.now();
  let lastSceneIdx = -1;
  let videoPlaying = null;
  // Start overlay playback synced to scenes phase (after splash + intro)
  if (overlayEl) {
    overlayEl.currentTime = 0;
    setTimeout(() => { overlayEl.play().catch(()=>{}); }, Math.max(0, (splashDur + introDur) * 1000));
  }

  let frameCount = 0;
  let drawErrors = 0;
  await new Promise(resolve => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      try {
        drawFrame(t);
        frameCount++;
      } catch (e) {
        drawErrors++;
        if (drawErrors < 3) console.error('[VideoAuto] drawFrame error', e);
        // keep animating — black frames are valid content
      }
      onProgress?.(Math.min(0.95, t / totalDur));
      if (t >= totalDur) return resolve();
      requestAnimationFrame(tick);
    };
    tick();
  });
  onLog?.(`Drew ${frameCount} frames (errors: ${drawErrors})`);

  // pause any playing video clip so the stream closes cleanly
  loaded.forEach(c => { if (c.kind === 'video') { try { c.el.pause(); } catch{} } });

  onLog?.('Finalizing recording…');
  // small tail so recorder catches last frame
  await new Promise(r => setTimeout(r, 300));
  try { rec.requestData(); } catch {}
  try { rec.stop(); } catch (e) { onLog?.(`Stop error: ${e.message}`); }

  // wait up to 8s for onstop, otherwise force-resolve with what we have
  await Promise.race([
    done,
    new Promise(r => setTimeout(() => { onLog?.('Forcing finalize (encoder slow)…'); r(); }, 8000)),
  ]);

  if (musicEl)   { try { musicEl.pause(); musicEl.src = ''; } catch{} }
  if (overlayEl) { try { overlayEl.pause(); } catch{} }
  if (audioCtx)  audioCtx.close().catch(()=>{});
  try { stream.getTracks().forEach(t => t.stop()); } catch {}
  try { canvas.remove(); } catch {}

  if (!chunks.length) {
    const diag = {
      codec: mime, frames: frameCount, drawErrors,
      dataEvents, emptyEvents, recState: rec.state,
      canvasW: w, canvasH: h, totalDur,
      hasOverlay: !!overlayEl, hasMusic: !!music?.url,
      streamTracks: stream.getTracks().map(t => `${t.kind}:${t.readyState}`).join(','),
    };
    console.error('[VideoAuto] NO CHUNKS — render diagnostics:', diag);
    throw new Error(
      `No video data captured. Diagnostics: ` +
      `frames=${frameCount}, drawErrors=${drawErrors}, ` +
      `dataEvents=${dataEvents}, emptyEvents=${emptyEvents}, ` +
      `recState=${rec.state}, tracks=[${diag.streamTracks}]. ` +
      `Full report in F12 console.`
    );
  }
  onProgress?.(1);
  onLog?.(`Encoding complete · ${chunks.length} chunks · ${(chunks.reduce((s,c)=>s+c.size,0)/1024/1024).toFixed(1)} MB`);
  return new Blob(chunks, { type: mime });

  // ─ inner ──────────────────────────────────────────────────────────────────
  function drawFrame(t) {
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, w, h);

    let cur = t;
    // LOGO SPLASH (premium brand intro before the hook)
    if (splashDur > 0 && cur < splashDur) {
      drawLogoSplash(ctx, w, h, cur / splashDur, logoEl, effectivePrimary, brand?.name);
      return;
    }
    cur -= splashDur;
    // INTRO HOOK
    if (cur < introDur) {
      const p = cur / introDur;
      const intro = (hookText && hookText.trim()) || template.intro || template.name;
      drawHookIntro(ctx, w, h, p, hookStyle, intro, effectiveAccent, loaded[0]);
      return;
    }
    cur -= introDur;

    // SCENES (with per-clip durations; loop if overlay extends scenesDur beyond totalClipDur)
    if (cur < scenesDur) {
      // Map `cur` into a cycle position
      const cyclePos = totalClipDur > 0 ? (cur % totalClipDur) : cur;
      let sceneIdx = 0;
      let sceneTime = 0;
      for (let i = 0; i < clipDurs.length; i++) {
        if (cyclePos < sceneStarts[i] + clipDurs[i]) {
          sceneIdx = i;
          sceneTime = cyclePos - sceneStarts[i];
          break;
        }
      }
      const dur = clipDurs[sceneIdx];
      const sceneT = dur > 0 ? sceneTime / dur : 0;
      const clip   = loaded[sceneIdx];

      // Ken Burns
      const zoom = 1 + sceneT * 0.18;
      const panX = (sceneIdx % 2 ? -1 : 1) * (sceneT - 0.5) * 0.6;
      const panY = (sceneIdx % 3 === 0) ? (sceneT - 0.5) * 0.4 : 0;

      // Manage video clip playback (start/stop when scene changes)
      if (clip.kind === 'video') {
        if (lastSceneIdx !== sceneIdx) {
          if (videoPlaying) { try { videoPlaying.pause(); } catch{} }
          clip.el.currentTime = 0;
          clip.el.play().catch(()=>{});
          videoPlaying = clip.el;
          lastSceneIdx = sceneIdx;
        }
      } else if (videoPlaying) {
        try { videoPlaying.pause(); } catch{}
        videoPlaying = null;
      }

      // Transition logic: during first TRANSITION_DUR of each scene (after first),
      // crossfade / slide / zoom from previous scene.
      const transitioning = sceneIdx > 0 && sceneTime < TRANSITION_DUR && transition !== 'none';
      if (transitioning) {
        const tFade = Math.min(1, sceneTime / TRANSITION_DUR);
        const prevIdx = sceneIdx - 1;
        const prevDur = clipDurs[prevIdx];

        if (transition === 'fade') {
          ctx.save();
          ctx.globalAlpha = 1 - tFade;
          drawSceneBackground(ctx, loaded, prevIdx, 0.99, clipDurs, w, h, filter, clips, null);
          ctx.restore();
          ctx.save();
          ctx.globalAlpha = tFade;
          drawSceneBackground(ctx, loaded, sceneIdx, sceneT, clipDurs, w, h, filter, clips, null);
          ctx.restore();
        } else if (transition === 'slide') {
          // Prev slides left, current slides in from right
          drawSceneBackground(ctx, loaded, prevIdx, 0.99, clipDurs, w, h, filter, clips, { dx: -w * tFade });
          drawSceneBackground(ctx, loaded, sceneIdx, sceneT, clipDurs, w, h, filter, clips, { dx: w * (1 - tFade) });
        } else if (transition === 'zoom') {
          // Prev at full size with fade-out; current zooms in from 0.85→1.0 with fade-in
          ctx.save();
          ctx.globalAlpha = 1 - tFade;
          drawSceneBackground(ctx, loaded, prevIdx, 0.99, clipDurs, w, h, filter, clips, null);
          ctx.restore();
          ctx.save();
          ctx.globalAlpha = tFade;
          const s = 0.85 + 0.15 * tFade;
          drawSceneBackground(ctx, loaded, sceneIdx, sceneT, clipDurs, w, h, filter, clips, { scale: s });
          ctx.restore();
        }
      } else {
        drawSceneBackground(ctx, loaded, sceneIdx, sceneT, clipDurs, w, h, filter, clips, null);
      }

      // dark gradient overlay (top & bottom) for legibility
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0,    'rgba(0,0,0,0.45)');
      grad.addColorStop(0.25, 'rgba(0,0,0,0.0)');
      grad.addColorStop(0.75, 'rgba(0,0,0,0.0)');
      grad.addColorStop(1,    'rgba(0,0,0,0.55)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // ── OVERLAYS ───────────────────────────────────────────────────────────
      // Primary field = first non-empty field; pinned to bottom area
      const primary = template.fields.find(f => fields[f.key]);
      if (primary) {
        drawCard(ctx, [fields[primary.key]], w/2, h - h*0.14, {
          fontSize: Math.floor(w * 0.06), weight: 800,
          maxWidth: w * 0.85, bg: 'rgba(0,0,0,0.55)',
          accent: effectiveAccent, pad: 22, radius: 14,
        });
      }

      // Per-clip custom caption overrides the rotating secondary field
      const customCap = clips[sceneIdx].customCaption?.trim();
      if (customCap) {
        const slide = Math.max(0, 1 - sceneT * 4);
        ctx.save();
        ctx.globalAlpha = 1 - slide;
        ctx.translate(0, -slide * 80);
        drawCard(ctx, [customCap], w/2, h*0.13, {
          fontSize: Math.floor(w * 0.052), weight: 700,
          maxWidth: w * 0.85,
          bg: effectiveAccent || '#1a5aa0',
          pad: 18, radius: 12,
        });
        ctx.restore();
      } else {
        // Secondary fields rotate top-center, one per scene
        const secondaries = template.fields.slice(1).filter(f => fields[f.key]);
        if (secondaries.length) {
          const idx = sceneIdx % secondaries.length;
          const fld = secondaries[idx];
          const text = labelize(fld, fields[fld.key]);
          const slide = Math.max(0, 1 - sceneT * 4);
          ctx.save();
          ctx.globalAlpha = 1 - slide;
          ctx.translate(0, -slide * 80);
          drawCard(ctx, [text], w/2, h*0.13, {
            fontSize: Math.floor(w * 0.052), weight: 700,
            maxWidth: w * 0.85,
            bg: effectiveAccent || '#1a5aa0',
            pad: 18, radius: 12,
          });
          ctx.restore();
        }
      }

      // scene tick markers (based on actual position in scenesDur)
      const overallScene = Math.floor(cur / sceneDur);
      const overallT = (cur % sceneDur) / sceneDur;
      const totalScenes = Math.max(clips.length, Math.ceil(scenesDur / sceneDur));
      drawProgressBar(ctx, w, h, overallScene, totalScenes, overallT, effectiveAccent);

      // Overlay PIP (talking-head) — only when the overlay actually has video frames
      // (audio-only voiceovers have no videoWidth so the PIP is skipped automatically)
      if (overlayEl && overlayEl.videoWidth > 0 && !overlay?.audioOnly) {
        drawOverlayPIP(ctx, overlayEl, w, h, overlay);
      }

      // Burned-in captions (TikTok-style)
      if (overlay?.burnCaptions && overlay?.captions?.length && overlayEl) {
        const overlayTime = cur; // relative to scenes phase = overlay playback time
        drawBurnedCaption(ctx, overlay.captions, overlayTime, w, h, effectiveAccent, overlay.captionStyle || 'bold');
      }

      // Per-scene emoji sticker
      const sceneStickerEmoji = clips[sceneIdx]?.stickerEmoji;
      if (sceneStickerEmoji) {
        drawSceneSticker(ctx, sceneStickerEmoji, clips[sceneIdx]?.stickerPos, sceneT, t, w, h);
      }

      // Brand watermark
      if (brand?.watermark && logoEl) {
        drawWatermark(ctx, logoEl, w, h, brand.watermarkPos || 'bottom-right');
      }

      // Call-to-Action sticker
      if (cta) {
        drawCTA(ctx, t, totalDur, w, h, cta, effectiveAccent);
      }
      return;
    }
    cur -= scenesDur;

    // OUTRO
    if (outroDur > 0 && cur < outroDur) {
      // Use a vertical gradient with brand primary → darker for richer look
      const gradFill = ctx.createLinearGradient(0, 0, 0, h);
      gradFill.addColorStop(0,   effectivePrimary);
      gradFill.addColorStop(1,   shadeColor(effectivePrimary, -25));
      ctx.fillStyle = gradFill;
      ctx.fillRect(0, 0, w, h);
      const fadeIn = Math.min(1, (cur / outroDur) * 2.5);
      ctx.globalAlpha = fadeIn;

      // Draw logo at the top if present
      let blockY = h * 0.36;
      if (logoEl) {
        const logoW = w * 0.40;
        const logoH = logoW * (logoEl.naturalHeight / Math.max(1, logoEl.naturalWidth));
        ctx.drawImage(logoEl, w/2 - logoW/2, h * 0.24, logoW, logoH);
        blockY = h * 0.24 + logoH + h * 0.04;
      }

      const lines = [
        brand?.name,
        brand?.tagline,
        brand?.phone,
        brand?.email,
        brand?.website,
      ].filter(Boolean);
      lines.forEach((line, i) => {
        const isPrimary = i === 0;
        drawCard(ctx, [line], w/2, blockY + i * h*0.075, {
          fontSize: Math.floor(w * (isPrimary ? 0.07 : 0.04)),
          weight: isPrimary ? 900 : 600,
          color: '#fff', bg: 'transparent', maxWidth: w * 0.9,
        });
      });
      ctx.globalAlpha = 1;
    }
  }
}

// Shade a hex color by an amount (positive = lighter, negative = darker)
function shadeColor(hex, percent) {
  const m = hex.replace('#','').match(/.{2}/g);
  if (!m) return hex;
  const adj = (v) => Math.max(0, Math.min(255, parseInt(v,16) + Math.round(255 * (percent/100))));
  return '#' + m.map(v => adj(v).toString(16).padStart(2,'0')).join('');
}

// Pull a single thumbnail frame from a video blob — used for Recent Renders.
async function captureThumbFromBlob(blob, aspect) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      // Seek to a frame about 1.5s in (past intro)
      v.currentTime = Math.min(1.5, (v.duration || 2) * 0.25);
    };
    v.onseeked = () => {
      try {
        const c = document.createElement('canvas');
        const target = ASPECTS[aspect] || ASPECTS['9:16'];
        const ratio = target.w / target.h;
        const tw = 240;
        const th = Math.round(tw / ratio);
        c.width = tw; c.height = th;
        const ctx = c.getContext('2d');
        ctx.drawImage(v, 0, 0, tw, th);
        const dataUrl = c.toDataURL('image/jpeg', 0.7);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('thumb capture failed')); };
    v.src = url;
  });
}

function labelize(field, value) {
  // For Real Estate numeric fields, format with unit
  const k = field.key;
  if (k === 'beds')   return `${value} BD`;
  if (k === 'baths')  return `${value} BA`;
  if (k === 'sqft')   return `${value} SQFT`;
  return `${field.label.toUpperCase()}:  ${value}`;
}

// Beauty filter presets for the overlay (talking-head)
const BEAUTY_FILTERS = {
  off:     'none',
  soft:    'brightness(1.06) contrast(1.04) saturate(1.05) blur(0.6px)',
  glow:    'brightness(1.10) contrast(1.03) saturate(1.10) blur(0.8px)',
  studio:  'brightness(1.08) contrast(1.12) saturate(1.12) blur(0.4px)',
  matte:   'brightness(1.04) contrast(1.18) saturate(0.92) blur(0.3px)',
};

function drawOverlayPIP(ctx, videoEl, canvasW, canvasH, cfg) {
  const sizePct = (cfg?.size ?? 0.28); // fraction of canvas width
  const posKey  = cfg?.position || 'top-right';
  const shape   = cfg?.shape || 'circle';
  const beauty  = cfg?.beauty || 'off';
  const pos     = OVERLAY_POS[posKey] || OVERLAY_POS['top-right'];

  const iw = videoEl.videoWidth, ih = videoEl.videoHeight;
  if (!iw || !ih) return;

  const boxW = canvasW * sizePct;
  const boxH = shape === 'circle' ? boxW : boxW * (ih / iw);
  const baseX = canvasW * pos.x - boxW * pos.ax;
  const baseY = canvasH * pos.y - boxH * pos.ay;

  ctx.save();
  // soft shadow
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 6;

  // build clip path
  ctx.beginPath();
  if (shape === 'circle') {
    const r = boxW / 2;
    ctx.arc(baseX + r, baseY + r, r, 0, Math.PI * 2);
  } else {
    const r = boxW * 0.08;
    ctx.moveTo(baseX + r, baseY);
    ctx.arcTo(baseX + boxW, baseY,         baseX + boxW, baseY + boxH, r);
    ctx.arcTo(baseX + boxW, baseY + boxH,  baseX,        baseY + boxH, r);
    ctx.arcTo(baseX,        baseY + boxH,  baseX,        baseY,        r);
    ctx.arcTo(baseX,        baseY,         baseX + boxW, baseY,        r);
  }
  ctx.closePath();
  ctx.clip();
  ctx.shadowColor = 'transparent';

  // Beauty filter for face content
  ctx.filter = BEAUTY_FILTERS[beauty] || 'none';

  // cover-fit the video into the box
  const targetAspect = boxW / boxH;
  const srcAspect    = iw / ih;
  let sw, sh, sx, sy;
  if (srcAspect > targetAspect) { sh = ih; sw = ih * targetAspect; sx = (iw - sw)/2; sy = 0; }
  else                           { sw = iw; sh = iw / targetAspect; sx = 0; sy = (ih - sh)/2; }
  ctx.drawImage(videoEl, sx, sy, sw, sh, baseX, baseY, boxW, boxH);
  ctx.filter = 'none';
  ctx.restore();

  // crisp white border
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.lineWidth = Math.max(3, canvasW * 0.004);
  ctx.beginPath();
  if (shape === 'circle') {
    const r = boxW / 2;
    ctx.arc(baseX + r, baseY + r, r - ctx.lineWidth/2, 0, Math.PI * 2);
  } else {
    const r = boxW * 0.08;
    const lw = ctx.lineWidth/2;
    ctx.moveTo(baseX + r, baseY + lw);
    ctx.arcTo(baseX + boxW - lw, baseY + lw,        baseX + boxW - lw, baseY + boxH - lw, r);
    ctx.arcTo(baseX + boxW - lw, baseY + boxH - lw, baseX + lw,        baseY + boxH - lw, r);
    ctx.arcTo(baseX + lw,        baseY + boxH - lw, baseX + lw,        baseY + lw,        r);
    ctx.arcTo(baseX + lw,        baseY + lw,        baseX + boxW - lw, baseY + lw,        r);
  }
  ctx.stroke();
  ctx.restore();
}

// Logo splash — premium brand card at the very start.
// p is 0→1 progress. If no logo, falls back to brand name in big text on primary color.
function drawLogoSplash(ctx, w, h, p, logoEl, primary, brandName) {
  // Background: brand primary with subtle radial vignette
  ctx.fillStyle = primary || '#1a5aa0';
  ctx.fillRect(0, 0, w, h);
  const grad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w, h)/1.4);
  grad.addColorStop(0, 'rgba(255,255,255,0.08)');
  grad.addColorStop(1, 'rgba(0,0,0,0.20)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Easing: ease-out bounce-ish
  // Scale: 0.6 → 1.0 with overshoot to 1.05 at 75% then settle
  let scale;
  if (p < 0.75) scale = 0.6 + (p / 0.75) * 0.45; // 0.6 → 1.05
  else          scale = 1.05 - ((p - 0.75) / 0.25) * 0.05; // 1.05 → 1.0
  // Fade in over first 30%
  const alpha = Math.min(1, p / 0.3);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(w/2, h/2);
  ctx.scale(scale, scale);
  ctx.translate(-w/2, -h/2);

  if (logoEl && logoEl.naturalWidth > 0) {
    const targetW = w * 0.55;
    const targetH = targetW * (logoEl.naturalHeight / logoEl.naturalWidth);
    ctx.drawImage(logoEl, w/2 - targetW/2, h/2 - targetH/2, targetW, targetH);
  } else if (brandName) {
    ctx.font = `900 ${Math.floor(w * 0.13)}px "DM Serif Display", "DM Sans", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(brandName, w/2, h/2);
  }
  ctx.restore();
}

// Hook intro renderer — 4 styles. `p` is 0→1 progress within introDur.
function drawHookIntro(ctx, w, h, p, style, text, accent, firstClip) {
  const accentColor = accent || '#1a5aa0';

  if (style === 'photo' && firstClip) {
    // Photo as background with subtle zoom + dark overlay + bold hook text
    const zoom = 1 + p * 0.10;
    drawCoverFit(ctx, firstClip.el, 0, 0, w, h, zoom, 0, 0);
    // Vignette + bottom darken for legibility
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0,    'rgba(0,0,0,0.45)');
    grad.addColorStop(0.4,  'rgba(0,0,0,0.6)');
    grad.addColorStop(1,    'rgba(0,0,0,0.75)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // Slide-in text
    const slide = Math.max(0, 1 - p * 2.5);
    ctx.save();
    ctx.globalAlpha = 1 - slide;
    ctx.translate(0, slide * 60);
    drawCard(ctx, [text], w/2, h/2, {
      fontSize: Math.floor(w * 0.105), weight: 900,
      color: '#fff', bg: 'transparent', accent: accentColor, maxWidth: w * 0.88,
    });
    // Accent underline
    ctx.fillStyle = accentColor;
    ctx.fillRect(w * 0.2, h/2 + Math.floor(w*0.075), w * 0.6, 6);
    ctx.restore();
    return;
  }

  if (style === 'typein') {
    ctx.fillStyle = accentColor;
    ctx.fillRect(0, 0, w, h);
    const fullText = text;
    // type-in: reveal characters over first 80% of intro, hold last 20%
    const reveal = Math.min(1, p / 0.8);
    const chars  = Math.max(1, Math.ceil(reveal * fullText.length));
    const shown  = fullText.slice(0, chars);
    // Blinking cursor for the last bit
    const showCursor = p < 0.9 && Math.floor(p * 12) % 2 === 0;
    const display = shown + (showCursor && reveal < 1 ? '|' : '');
    drawCard(ctx, [display], w/2, h/2, {
      fontSize: Math.floor(w * 0.13), weight: 900,
      color: '#fff', bg: 'transparent', maxWidth: w * 0.86,
    });
    return;
  }

  if (style === 'burst') {
    ctx.fillStyle = accentColor;
    ctx.fillRect(0, 0, w, h);
    // Bounce-in scale curve
    let scale;
    if (p < 0.5) {
      // start huge (2.5), shrink toward 1.0
      scale = 2.5 - (p / 0.5) * 1.8;
    } else {
      // overshoot to 1.08, settle to 1
      const q = (p - 0.5) / 0.5;
      scale = 0.7 + 0.4 * Math.sin(q * Math.PI * 0.5) - 0.02 * Math.sin(q * Math.PI * 1.5);
    }
    const alpha = Math.min(1, p * 3);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(w/2, h/2);
    ctx.scale(scale, scale);
    ctx.translate(-w/2, -h/2);
    drawCard(ctx, [text], w/2, h/2, {
      fontSize: Math.floor(w * 0.13), weight: 900,
      color: '#fff', bg: 'transparent', maxWidth: w * 0.86,
    });
    ctx.restore();
    return;
  }

  // Default: solid card (was the original behavior)
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = Math.min(1, p * 2.2);
  drawCard(ctx, [text], w/2, h/2, {
    fontSize: Math.floor(w * 0.12), weight: 900,
    color: '#fff', bg: 'transparent', maxWidth: w * 0.86,
  });
  ctx.globalAlpha = 1;
}

// Caption styles for burned-in word-level captions.
export const CAPTION_STYLES = [
  { id:'bold',    name:'Bold Outline', emoji:'🔤', desc:'White text with thick black outline · active word in accent color (default)' },
  { id:'box',     name:'Accent Box',   emoji:'🟪', desc:'Words in solid accent-color box · white text · TikTok-influencer look' },
  { id:'shadow',  name:'Drop Shadow',  emoji:'☁️', desc:'White text with soft drop shadow · cleaner / softer / cinematic' },
  { id:'gradient',name:'Gradient',     emoji:'🌈', desc:'Active word with vibrant gradient fill · pop look' },
];

// Pack the words into lines so the total width of each line fits maxWidth.
// Returns array of { words: [{ text, isActive }], width: pixels }.
function wrapCaptionLines(ctx, items, spaceW, maxWidth) {
  const lines = [];
  let current = { words: [], width: 0 };
  for (const it of items) {
    const wW = ctx.measureText(it.text).width;
    const addW = current.words.length === 0 ? wW : spaceW + wW;
    if (current.words.length && current.width + addW > maxWidth) {
      lines.push(current);
      current = { words: [{ ...it, width: wW }], width: wW };
    } else {
      current.words.push({ ...it, width: wW });
      current.width += addW;
    }
  }
  if (current.words.length) lines.push(current);
  return lines;
}

// TikTok-style burned-in captions. Highlights current word + shows ±1 neighbor.
// Wraps to multiple lines if the 3-word window is too wide.
function drawBurnedCaption(ctx, captions, t, canvasW, canvasH, accent, style='bold') {
  if (!captions || !captions.length) return;
  let curIdx = -1;
  for (let i = 0; i < captions.length; i++) {
    const c = captions[i];
    if (t >= c.start - 0.05 && t <= c.end + 0.15) { curIdx = i; break; }
  }
  if (curIdx === -1) {
    for (let i = captions.length - 1; i >= 0; i--) {
      if (captions[i].end < t && t - captions[i].end < 0.6) { curIdx = i; break; }
    }
  }
  if (curIdx === -1) return;

  const start = Math.max(0, curIdx - 1);
  const end   = Math.min(captions.length, curIdx + 2);
  const window = captions.slice(start, end);
  if (!window.length) return;

  const fontSize = Math.floor(canvasW * 0.072);
  ctx.font = `900 ${fontSize}px "DM Sans", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const spaceW = ctx.measureText(' ').width;
  const maxLineWidth = canvasW * 0.88;
  const accentColor = accent || '#fbbf24';

  // Build word items with active flag, then wrap
  const items = window.map((w, i) => ({
    text: w.text.toUpperCase(),
    isActive: (start + i) === curIdx,
  }));
  const lines = wrapCaptionLines(ctx, items, spaceW, maxLineWidth);
  const lineHeight = fontSize * 1.15;
  const totalHeight = lines.length * lineHeight;
  // Center the block vertically around 62% canvas height
  const blockTopY = canvasH * 0.62 - totalHeight / 2 + lineHeight / 2;

  ctx.save();

  // Stroke / shadow setup common to most styles
  ctx.lineJoin = 'round';
  if (style === 'bold' || style === 'gradient') {
    ctx.lineWidth = Math.max(6, fontSize * 0.13);
    ctx.strokeStyle = 'rgba(0,0,0,0.95)';
  } else if (style === 'shadow') {
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = fontSize * 0.18;
    ctx.shadowOffsetY = fontSize * 0.05;
  }

  lines.forEach((line, lineIdx) => {
    const cy = blockTopY + lineIdx * lineHeight;
    let drawX = canvasW / 2 - line.width / 2;

    for (let i = 0; i < line.words.length; i++) {
      const word = line.words[i];
      const wW = word.width;
      const cx = drawX + wW / 2;
      const isActive = word.isActive;

      if (style === 'box') {
        const padX = wW * 0.18, padY = fontSize * 0.22;
        ctx.fillStyle = isActive ? accentColor : 'rgba(0,0,0,0.7)';
        ctx.fillRect(cx - wW/2 - padX, cy - fontSize/2 - padY, wW + padX*2, fontSize + padY*2);
        ctx.fillStyle = '#fff';
      } else if (style === 'shadow') {
        ctx.fillStyle = isActive ? accentColor : '#fff';
      } else if (style === 'gradient') {
        ctx.strokeText(word.text, cx, cy);
        if (isActive) {
          const grad = ctx.createLinearGradient(cx - wW/2, cy - fontSize/2, cx + wW/2, cy + fontSize/2);
          grad.addColorStop(0, accentColor);
          grad.addColorStop(1, shadeColor(accentColor, 25));
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = '#fff';
        }
      } else {
        // bold default
        ctx.strokeText(word.text, cx, cy);
        ctx.fillStyle = isActive ? accentColor : '#fff';
      }
      ctx.fillText(word.text, cx, cy);
      drawX += wW + (i < line.words.length - 1 ? spaceW : 0);
    }
  });

  ctx.restore();
}

// CTA sticker — pulses, fades in last 2 seconds, or stays continuous.
function drawCTA(ctx, t, totalDur, canvasW, canvasH, cta, accent) {
  if (!cta?.text) return;

  // Timing: visibility 0..1
  let visibility = 1;
  if (cta.timing === 'last') {
    const showFrom = totalDur - 2.2;
    if (t < showFrom) return;
    visibility = Math.min(1, (t - showFrom) / 0.35);
  } else if (cta.timing === 'pulse') {
    // 2.5s cycle: visible 0.0-1.8, hidden 1.8-2.5
    const phase = (t % 2.5) / 2.5;
    if (phase > 0.72) return;
    if (phase < 0.05)      visibility = phase / 0.05;     // fade-in
    else if (phase > 0.62) visibility = (0.72 - phase) / 0.10; // fade-out
  }

  // Position
  const positions = {
    'top-left':     { x: 0.05, y: 0.07,  ax: 0,   ay: 0   },
    'top-right':    { x: 0.95, y: 0.07,  ax: 1,   ay: 0   },
    'bottom-left':  { x: 0.05, y: 0.78,  ax: 0,   ay: 1   },
    'bottom-right': { x: 0.95, y: 0.78,  ax: 1,   ay: 1   },
    'center':       { x: 0.50, y: 0.45,  ax: 0.5, ay: 0.5 },
  };
  const pos = positions[cta.position || 'bottom-left'];

  // Subtle scale pulse if pulse mode
  let scale = 1;
  if (cta.timing === 'pulse') {
    scale = 1 + Math.sin(t * 5) * 0.04;
  }

  ctx.save();
  ctx.globalAlpha = visibility;

  const fontSize = Math.floor(canvasW * 0.046);
  ctx.font = `900 ${fontSize}px "DM Sans", system-ui, sans-serif`;
  const textW = ctx.measureText(cta.text).width;
  const pad = canvasW * 0.028;
  const pillW = textW + pad * 2;
  const pillH = fontSize * 1.9;
  const px = canvasW * pos.x - pillW * pos.ax;
  const py = canvasH * pos.y - pillH * pos.ay;

  ctx.translate(px + pillW/2, py + pillH/2);
  ctx.scale(scale, scale);
  ctx.translate(-pillW/2, -pillH/2);

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 5;

  // Pill background
  ctx.fillStyle = accent || '#1a5aa0';
  roundedRect(ctx, 0, 0, pillW, pillH, pillH / 2);
  ctx.fill();

  ctx.shadowColor = 'transparent';

  // Text
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cta.text, pillW / 2, pillH / 2);

  ctx.restore();
}

// Animated scene emoji sticker. Bounces in, then subtle pulse.
function drawSceneSticker(ctx, emoji, position, sceneT, absoluteT, w, h) {
  if (!emoji) return;
  const positions = {
    'center':       { x: 0.50, y: 0.45 },
    'top-left':     { x: 0.18, y: 0.30 },
    'top-right':    { x: 0.82, y: 0.30 },
    'bottom-left':  { x: 0.18, y: 0.55 },
    'bottom-right': { x: 0.82, y: 0.55 },
  };
  const pos = positions[position || 'top-right'];
  const cx = w * pos.x;
  const cy = h * pos.y;

  // Animation: bounce-in (0→0.15) → settle (0.15→0.30) → idle pulse
  let scale;
  if (sceneT < 0.15) {
    scale = (sceneT / 0.15) * 1.25;
  } else if (sceneT < 0.30) {
    scale = 1.25 - ((sceneT - 0.15) / 0.15) * 0.25;
  } else {
    scale = 1 + Math.sin(absoluteT * 4) * 0.06;
  }

  // Subtle rotation wobble
  const rot = Math.sin(absoluteT * 2.5) * 0.06;

  const fontSize = Math.floor(w * 0.14);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 0, 0);
  ctx.restore();
}

// Tiny brand logo overlay in a corner of every scene
function drawWatermark(ctx, logoEl, canvasW, canvasH, pos) {
  if (!logoEl || !logoEl.naturalWidth) return;
  const targetW = canvasW * 0.10;
  const targetH = targetW * (logoEl.naturalHeight / logoEl.naturalWidth);
  const pad = canvasW * 0.035;
  let x = 0, y = 0;
  switch (pos) {
    case 'top-left':     x = pad;                  y = pad; break;
    case 'top-right':    x = canvasW - targetW - pad; y = pad; break;
    case 'bottom-left':  x = pad;                  y = canvasH - targetH - pad; break;
    case 'bottom-right':
    default:             x = canvasW - targetW - pad; y = canvasH - targetH - pad;
  }
  ctx.save();
  ctx.globalAlpha = 0.78;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8;
  ctx.drawImage(logoEl, x, y, targetW, targetH);
  ctx.restore();
}

function drawProgressBar(ctx, w, h, idx, total, sceneT, accent) {
  const pad = w * 0.04;
  const gap = w * 0.012;
  const barH = 4;
  const innerW = w - pad*2;
  const segW = (innerW - gap * (total - 1)) / total;
  for (let i = 0; i < total; i++) {
    const x = pad + i * (segW + gap);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    roundedRect(ctx, x, h - h*0.04, segW, barH, 2); ctx.fill();
    if (i < idx) {
      ctx.fillStyle = '#fff';
      roundedRect(ctx, x, h - h*0.04, segW, barH, 2); ctx.fill();
    } else if (i === idx) {
      ctx.fillStyle = '#fff';
      roundedRect(ctx, x, h - h*0.04, segW * sceneT, barH, 2); ctx.fill();
    }
  }
}

// ─── LIVE PREVIEW THUMBNAIL ──────────────────────────────────────────────────
// Shows a static composition (scene 1 mid-frame) with all overlays so the user
// sees what the video will look like before rendering.
function PreviewThumbnail({ clips, focusedClipId, fields, aspect, filter, tpl, brand, cta, overlay, transition='fade', hookStyle='card', hookText }) {
  const canvasRef = useRef();
  const [imgEl, setImgEl] = useState(null);
  const [logoEl, setLogoEl] = useState(null);
  const [overlayEl, setOverlayEl] = useState(null);
  const [allImgs, setAllImgs] = useState([]); // loaded HTMLImageElements for ALL clips, for animated preview
  const [playing, setPlaying] = useState(false);
  const playTimeRef = useRef(0);
  const rafRef = useRef(null);
  const lastTickRef = useRef(0);

  // Resolve which clip is currently focused for the static preview
  const focusedClip = clips.find(c => c.id === focusedClipId) || clips.find(c => c.kind === 'image') || null;
  const focusedIdx  = focusedClip ? clips.indexOf(focusedClip) : 0;

  // Load the FOCUSED clip as the preview image (defaults to first if none focused)
  useEffect(() => {
    const target = focusedClip && focusedClip.kind === 'image' ? focusedClip : clips.find(c => c.kind === 'image');
    if (!target) { setImgEl(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImgEl(img);
    img.onerror = () => setImgEl(null);
    img.src = target.url;
  }, [clips, focusedClip]);

  // Load ALL clip images for the animated preview-play feature
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      clips.filter(c => c.kind === 'image').map(c => new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload  = () => resolve({ kind: 'image', el: img, clip: c });
        img.onerror = () => resolve(null);
        img.src = c.url;
      }))
    ).then(arr => { if (!cancelled) setAllImgs(arr.filter(Boolean)); });
    return () => { cancelled = true; };
  }, [clips]);

  // Load brand logo
  useEffect(() => {
    if (!brand?.logoUrl) { setLogoEl(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setLogoEl(img);
    img.onerror = () => setLogoEl(null);
    img.src = brand.logoUrl;
  }, [brand?.logoUrl]);

  // Load overlay video first-frame
  useEffect(() => {
    if (!overlay?.url) { setOverlayEl(null); return; }
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 2) * 0.3); };
    v.onseeked = () => setOverlayEl(v);
    v.onerror = () => setOverlayEl(null);
    v.src = overlay.url;
  }, [overlay?.url]);

  // Redraw whenever anything changes
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const target = ASPECTS[aspect] || ASPECTS['9:16'];
    const scale = 0.32;
    c.width  = Math.round(target.w * scale);
    c.height = Math.round(target.h * scale);
    const ctx = c.getContext('2d', { alpha: false });
    const w = c.width, h = c.height;

    // Background
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, w, h);

    if (imgEl) {
      const targetClip = focusedClip || clips[0];
      const filterId = targetClip?.filterOverride || filter;
      const filterCss = getFilterCss({ ...(targetClip || {}), autoFilterCss: targetClip?.autoFilterCss }, filterId);
      ctx.filter = filterCss || 'none';
      drawCoverFit(ctx, imgEl, 0, 0, w, h, 1.08, 0.1, 0);
      ctx.filter = 'none';
    } else {
      // No image yet — show placeholder gradient
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, tpl?.accent || '#1a5aa0');
      grad.addColorStop(1, '#050810');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `600 ${Math.floor(w*0.04)}px "DM Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Drop photos →', w/2, h/2);
      return;
    }

    // Dark gradient mask
    const mask = ctx.createLinearGradient(0, 0, 0, h);
    mask.addColorStop(0,    'rgba(0,0,0,0.45)');
    mask.addColorStop(0.25, 'rgba(0,0,0,0.0)');
    mask.addColorStop(0.75, 'rgba(0,0,0,0.0)');
    mask.addColorStop(1,    'rgba(0,0,0,0.55)');
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, w, h);

    const effectiveAccent = (brand?.useBrandColors && brand?.accentColor) ? brand.accentColor : tpl?.accent;

    // Primary field (address) at bottom
    const primary = tpl?.fields?.find(f => fields[f.key]);
    if (primary) {
      drawCard(ctx, [fields[primary.key]], w/2, h - h*0.14, {
        fontSize: Math.floor(w * 0.06), weight: 800,
        maxWidth: w * 0.85, bg: 'rgba(0,0,0,0.55)',
        accent: effectiveAccent, pad: 18, radius: 12,
      });
    }

    // Custom caption for the focused scene (overrides rotating secondary field)
    const customCap = focusedClip?.customCaption?.trim();
    if (customCap) {
      drawCard(ctx, [customCap], w/2, h*0.13, {
        fontSize: Math.floor(w * 0.052), weight: 700,
        maxWidth: w * 0.85,
        bg: effectiveAccent || '#1a5aa0',
        pad: 14, radius: 10,
      });
    } else {
      const secondaries = tpl?.fields?.slice(1).filter(f => fields[f.key]) || [];
      if (secondaries.length) {
        const idx = focusedIdx % secondaries.length;
        const fld = secondaries[idx];
        const text = labelize(fld, fields[fld.key]);
        drawCard(ctx, [text], w/2, h*0.13, {
          fontSize: Math.floor(w * 0.052), weight: 700,
          maxWidth: w * 0.85,
          bg: effectiveAccent || '#1a5aa0',
          pad: 14, radius: 10,
        });
      }
    }

    // Focused scene's emoji sticker
    if (focusedClip?.stickerEmoji) {
      drawSceneSticker(ctx, focusedClip.stickerEmoji, focusedClip.stickerPos, 0.5, 1.0, w, h);
    }

    // Overlay PIP placeholder
    if (overlayEl && !overlay?.audioOnly) {
      drawOverlayPIP(ctx, overlayEl, w, h, overlay);
    }

    // Watermark
    if (brand?.watermark && logoEl) {
      drawWatermark(ctx, logoEl, w, h, brand.watermarkPos || 'bottom-right');
    }

    // CTA
    if (cta) {
      // Always-visible preview (force visibility=1 by faking continuous)
      drawCTA(ctx, 0, 100, w, h, { ...cta, timing: 'continuous' }, effectiveAccent);
    }
  }, [imgEl, logoEl, overlayEl, fields, aspect, filter, brand, cta, overlay, tpl, clips, focusedClipId, focusedClip, focusedIdx]);

  // Animated preview-play loop: cycle through scenes at faster pace, in the preview canvas.
  // No MediaRecorder, no audio — purely visual.
  useEffect(() => {
    if (!playing || !canvasRef.current || allImgs.length === 0) return;

    const c = canvasRef.current;
    const ctx = c.getContext('2d', { alpha: false });
    const w = c.width, h = c.height;
    const baseScene = 1.6; // faster than real render
    const introDur = 1.0;
    const totalScene = allImgs.length * baseScene;
    const fullDur = introDur + totalScene;
    const effectiveAccent = (brand?.useBrandColors && brand?.accentColor) ? brand.accentColor : tpl?.accent;

    playTimeRef.current = 0;
    lastTickRef.current = performance.now();

    const tick = () => {
      const now = performance.now();
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      playTimeRef.current += dt;
      if (playTimeRef.current >= fullDur) playTimeRef.current = 0; // loop

      const t = playTimeRef.current;
      ctx.fillStyle = '#050810';
      ctx.fillRect(0, 0, w, h);

      // INTRO
      if (t < introDur) {
        const p = t / introDur;
        const intro = (hookText && hookText.trim()) || tpl?.intro || tpl?.name || '';
        drawHookIntro(ctx, w, h, p, hookStyle, intro, effectiveAccent, allImgs[0]);
        if (cta) drawCTA(ctx, t, fullDur, w, h, { ...cta, timing: 'continuous' }, effectiveAccent);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      // SCENES
      const cur = t - introDur;
      const sceneIdx = Math.floor(cur / baseScene);
      const sceneT = (cur % baseScene) / baseScene;
      const idx = sceneIdx % allImgs.length;
      const clip = allImgs[idx];
      const zoom = 1 + sceneT * 0.18;
      const panX = (idx % 2 ? -1 : 1) * (sceneT - 0.5) * 0.6;
      const panY = (idx % 3 === 0) ? (sceneT - 0.5) * 0.4 : 0;

      const filterId = clip.clip?.filterOverride || filter;
      const filterCss = getFilterCss(clip.clip || {}, filterId);
      ctx.filter = filterCss || 'none';

      // Fade transition during first 25% of scene
      if (transition === 'fade' && idx > 0 && sceneT < 0.25) {
        const f = sceneT / 0.25;
        ctx.globalAlpha = 1 - f;
        drawCoverFit(ctx, allImgs[(idx - 1 + allImgs.length) % allImgs.length].el, 0, 0, w, h, 1.15, 0, 0);
        ctx.globalAlpha = f;
        drawCoverFit(ctx, clip.el, 0, 0, w, h, zoom, panX, panY);
        ctx.globalAlpha = 1;
      } else {
        drawCoverFit(ctx, clip.el, 0, 0, w, h, zoom, panX, panY);
      }
      ctx.filter = 'none';

      // Mask + overlays
      const mask = ctx.createLinearGradient(0, 0, 0, h);
      mask.addColorStop(0,    'rgba(0,0,0,0.45)');
      mask.addColorStop(0.25, 'rgba(0,0,0,0.0)');
      mask.addColorStop(0.75, 'rgba(0,0,0,0.0)');
      mask.addColorStop(1,    'rgba(0,0,0,0.55)');
      ctx.fillStyle = mask;
      ctx.fillRect(0, 0, w, h);

      const primary = tpl?.fields?.find(f => fields[f.key]);
      if (primary) {
        drawCard(ctx, [fields[primary.key]], w/2, h - h*0.14, {
          fontSize: Math.floor(w * 0.06), weight: 800,
          maxWidth: w * 0.85, bg: 'rgba(0,0,0,0.55)',
          accent: effectiveAccent, pad: 16, radius: 10,
        });
      }

      const customCap = clip.clip?.customCaption?.trim();
      if (customCap) {
        drawCard(ctx, [customCap], w/2, h*0.13, {
          fontSize: Math.floor(w * 0.052), weight: 700,
          maxWidth: w * 0.85, bg: effectiveAccent || '#1a5aa0', pad: 13, radius: 10,
        });
      } else {
        const secondaries = tpl?.fields?.slice(1).filter(f => fields[f.key]) || [];
        if (secondaries.length) {
          const fld = secondaries[idx % secondaries.length];
          drawCard(ctx, [labelize(fld, fields[fld.key])], w/2, h*0.13, {
            fontSize: Math.floor(w * 0.052), weight: 700,
            maxWidth: w * 0.85, bg: effectiveAccent || '#1a5aa0', pad: 13, radius: 10,
          });
        }
      }

      // Overlay PIP
      if (overlayEl) drawOverlayPIP(ctx, overlayEl, w, h, overlay);
      // Watermark
      if (brand?.watermark && logoEl) drawWatermark(ctx, logoEl, w, h, brand.watermarkPos || 'bottom-right');
      // CTA
      if (cta) drawCTA(ctx, t, fullDur, w, h, { ...cta, timing: cta.timing || 'continuous' }, effectiveAccent);

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, allImgs, fields, tpl, filter, transition, hookStyle, hookText, brand, cta, overlay, overlayEl, logoEl]);

  return (
    <div style={{
      background:'rgba(8,12,24,.65)', border:'1px solid rgba(255,255,255,.05)',
      borderRadius:14, padding:14, backdropFilter:'blur(12px)',
    }}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
        <div style={{
          fontSize:11, fontWeight:800, color:'#7eb8f7', letterSpacing:1.5,
          textTransform:'uppercase',
        }}>
          👁️ Live Preview {focusedClip && clips.length > 1 && (
            <span style={{color:'#94a3b8', fontWeight:600, letterSpacing:0, textTransform:'none'}}>
              · Scene {focusedIdx + 1}
            </span>
          )}
        </div>
        {allImgs.length > 0 && (
          <button onClick={()=>setPlaying(p=>!p)}
            style={{
              background: playing ? 'rgba(239,68,68,.15)' : 'rgba(16,185,129,.15)',
              border: `1px solid ${playing ? 'rgba(239,68,68,.4)' : 'rgba(16,185,129,.4)'}`,
              color: playing ? '#fca5a5' : '#6ee7b7',
              borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:700, cursor:'pointer',
            }}>
            {playing ? '⏹ Stop' : '▶ Play preview'}
          </button>
        )}
      </div>
      <div style={{
        background:'#000', borderRadius:8, overflow:'hidden',
        display:'flex', justifyContent:'center', maxHeight: 360,
      }}>
        <canvas ref={canvasRef} style={{
          maxWidth:'100%', maxHeight:360, display:'block', borderRadius:8,
        }}/>
      </div>
      <div style={{fontSize:10.5, color:'#64748b', marginTop:8, lineHeight:1.4}}>
        {playing
          ? '▶ Animating — no captions/audio shown · just the visual layout'
          : 'Click any clip thumbnail (below) to focus the preview on that scene · ▶ Play to animate · ✎ icon to edit a scene'}
      </div>
    </div>
  );
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function VideoAuto({ setPage, toast }) {
  const [tplId, setTplId]   = useLS('va_tpl', 'just-listed');
  const [aspect, setAspect] = useLS('va_aspect', '9:16');
  const [filter, setFilter] = useLS('va_filter', 'auto');
  const [transition, setTransition] = useLS('va_transition', 'fade');
  const [quality, setQuality] = useLS('va_quality', 'standard');
  const [cta, setCta] = useLS('va_cta', {
    enabled: false,
    text: 'DM ME 📩',
    position: 'bottom-left',
    timing: 'pulse',
  });
  const [testing, setTesting] = useState(false);
  const [hookStyle, setHookStyle] = useLS('va_hookstyle', 'photo');
  const [hookText, setHookText]   = useState('');
  const [clips, setClips]   = useState([]);
  const [fields, setFields] = useState({});
  const [overlay, setOverlay] = useState(null); // {url, file, position, size, shape, volume, status, autoClean, denoise}
  const overlayRef = useRef();
  const [music, setMusic] = useLS('va_music', null); // { id, name, url, volume }
  const musicRef = useRef();
  const [aiBusy, setAiBusy] = useState(false);
  const [editingClipId, setEditingClipId] = useState(null);
  const [focusedClipId, setFocusedClipId] = useState(null);
  const [fubPickerOpen, setFubPickerOpen] = useState(false);
  const [fubSearch, setFubSearch] = useState('');
  const [fubFilter, setFubFilter] = useState('all');
  const [fubLeads] = useLS('leads', []);
  const [fubMultiSelect, setFubMultiSelect] = useState(false);
  const [fubSelected, setFubSelected] = useState({});
  const [batchProgress, setBatchProgress] = useState(null); // {done, total, current}
  const [presets, setPresets] = useLS('va_presets', []);
  const [recording, setRecording] = useState(null); // { stream, recorder, chunks, ts }
  const camPreviewRef = useRef();
  const [scriptModal, setScriptModal] = useState(null); // { text, busy }
  const [transcoding, setTranscoding] = useState(false);
  const [recent, setRecent] = useIDB('va_recent_renders', []);
  const [massExporting, setMassExporting] = useState(false);
  const [hashtags, setHashtags] = useState('');
  const [hashtagsBusy, setHashtagsBusy] = useState(false);
  const [brand, setBrand]   = useLS('rehub_brand', {
    name: 'Monica Iskra',
    tagline: '',
    phone: '',
    email: '',
    website: '',
    logoUrl: '',
    primaryColor: '#1a5aa0',
    accentColor:  '#d4a017',
    useBrandColors: false,
    watermark: false,
    watermarkPos: 'bottom-right',
    show: true,
  });
  const logoRef = useRef();
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [log, setLog]             = useState('');
  const [outputUrl, setOutputUrl] = useState(null);
  const [outputMime, setOutputMime] = useState('video/webm');
  const fileRef = useRef();
  const previewRef = useRef();

  const tpl = useMemo(() => TEMPLATES.find(t => t.id === tplId) || TEMPLATES[0], [tplId]);

  // Group templates by category for the picker
  const grouped = useMemo(() => {
    const m = {};
    TEMPLATES.forEach(t => { (m[t.cat] = m[t.cat] || []).push(t); });
    return m;
  }, []);

  // Reset fields when template changes
  useEffect(() => {
    setFields(prev => {
      const next = {};
      tpl.fields.forEach(f => { next[f.key] = prev[f.key] ?? ''; });
      return next;
    });
  }, [tplId, tpl]);

  // Cleanup blob URLs
  useEffect(() => () => {
    clips.forEach(c => c.url?.startsWith('blob:') && URL.revokeObjectURL(c.url));
    outputUrl?.startsWith('blob:') && URL.revokeObjectURL(outputUrl);
  }, []); // eslint-disable-line

  const handleFiles = useCallback(async (files) => {
    const arr = Array.from(files).slice(0, tpl.maxClips - clips.length);
    if (!arr.length) return;

    // Add all clips immediately with 'converting' or 'ready' status so the user sees them
    const pendings = arr.map(f => {
      const isVideo = f.type.startsWith('video') || /\.(mov|mp4|webm|m4v)$/i.test(f.name);
      return {
        id: `${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        kind: isVideo ? 'video' : 'image',
        url: URL.createObjectURL(f),
        name: f.name,
        file: f,
        status: needsConversion(f) ? 'converting' : 'ready',
        progress: 0,
      };
    });
    setClips(prev => [...prev, ...pendings]);

    // Convert iPhone formats in series (FFmpeg is single-threaded)
    for (const c of pendings) {
      let finalUrl = c.url;
      let finalKind = c.kind;
      let finalFile = c.file;
      if (c.status === 'converting') {
        try {
          const t0 = performance.now();
          const newFile = await convertFile(
            c.file,
            (msg) => setClips(prev => prev.map(x => x.id === c.id ? { ...x, statusMsg: msg } : x)),
            (p)   => setClips(prev => prev.map(x => x.id === c.id ? { ...x, progress: p } : x)),
          );
          const elapsed = ((performance.now() - t0)/1000).toFixed(1);
          finalUrl = URL.createObjectURL(newFile);
          finalKind = newFile.type.startsWith('video') ? 'video' : 'image';
          finalFile = newFile;
          const oldUrl = c.url;
          setClips(prev => prev.map(x => x.id === c.id
            ? { ...x, url: finalUrl, kind: finalKind, status: 'ready', file: finalFile, statusMsg: `Converted in ${elapsed}s` }
            : x));
          setTimeout(() => URL.revokeObjectURL(oldUrl), 1000);
        } catch (e) {
          console.error('[VideoAuto] convertFile failed', e);
          setClips(prev => prev.map(x => x.id === c.id
            ? { ...x, status: 'failed', statusMsg: e.message || 'Conversion failed' }
            : x));
          toast?.error?.(`Couldn't convert ${c.name}: ${e.message || 'unknown error'}`);
          continue;
        }
      }

      // Compute Auto-Enhance filter per image (one-time analysis, stored on the clip)
      if (finalKind === 'image') {
        try {
          const img = await new Promise((res, rej) => {
            const i = new Image();
            i.onload = () => res(i); i.onerror = rej; i.src = finalUrl;
          });
          const autoCss = computeAutoFilter(img);
          setClips(prev => prev.map(x => x.id === c.id ? { ...x, autoFilterCss: autoCss } : x));
        } catch (e) { /* leave clip without auto filter; renderer falls back to safe default */ }
      }
    }
  }, [clips.length, tpl.maxClips, toast]);

  const removeClip = (id) => {
    setClips(prev => {
      const x = prev.find(c => c.id === id);
      if (x?.url?.startsWith('blob:')) URL.revokeObjectURL(x.url);
      return prev.filter(c => c.id !== id);
    });
  };

  const moveClip = (id, dir) => {
    setClips(prev => {
      const idx = prev.findIndex(c => c.id === id);
      if (idx < 0) return prev;
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const out = [...prev];
      [out[idx], out[j]] = [out[j], out[idx]];
      return out;
    });
  };

  const readyClips = clips.filter(c => c.status === 'ready' || !c.status);
  const stillConverting = clips.some(c => c.status === 'converting');
  const canGenerate = readyClips.length >= tpl.minClips && !stillConverting;
  const reasonDisabled = stillConverting
    ? 'Waiting for iPhone conversion…'
    : (readyClips.length < tpl.minClips
        ? `Add ${tpl.minClips - readyClips.length} more clip${tpl.minClips - readyClips.length === 1 ? '' : 's'} to start`
        : null);

  const handleGenerate = async () => {
    if (!canGenerate) {
      toast?.error?.(`Need at least ${tpl.minClips} clip${tpl.minClips>1?'s':''}`);
      return;
    }
    setRendering(true);
    setProgress(0);
    setLog('Starting render…');
    setOutputUrl(null);
    try {
      // Step 0: trim overlay if user set trim points
      let effectiveOverlay = overlay?.status === 'ready' ? overlay : null;
      if (effectiveOverlay) effectiveOverlay = await applyTrimIfNeeded(effectiveOverlay);
      // Step 1: auto-clean / denoise / caption overlay voice if requested
      const wantsAudioWork = effectiveOverlay
        && (effectiveOverlay.autoClean || effectiveOverlay.denoise || effectiveOverlay.burnCaptions)
        && effectiveOverlay.file;
      if (wantsAudioWork) {
        setLog('Processing voice (downloading Whisper on first run)…');
        try {
          const result = await cleanAudio(effectiveOverlay.file, {
            removeFillers: !!effectiveOverlay.autoClean,
            denoise:       !!effectiveOverlay.denoise,
            onLog: (msg) => setLog(msg),
            onProgress: (p) => setProgress(p * 0.4), // first 40% of progress = audio work
          });
          // If file changed, use cleaned file; otherwise keep original
          if (result.cleanedFile !== effectiveOverlay.file) {
            const cleanedUrl = URL.createObjectURL(result.cleanedFile);
            effectiveOverlay = { ...effectiveOverlay, url: cleanedUrl, file: result.cleanedFile, cleanResult: result };
            const parts = [];
            if (result.removed > 0) parts.push(`removed ${result.removed} filler${result.removed===1?'':'s'}`);
            if (result.denoised || effectiveOverlay.denoise) parts.push('noise reduced');
            if (effectiveOverlay.burnCaptions && result.captions?.length) parts.push(`${result.captions.length} captioned words`);
            if (parts.length) toast?.success?.(`Voice: ${parts.join(', ')}`);
          }
          // Attach captions either way (cleaned or original)
          effectiveOverlay = { ...effectiveOverlay, captions: result.captions || [], cleanResult: result };
          setOverlay(o => o ? { ...o, cleanResult: { removed: result.removed, denoised: !!result.denoised, captionCount: result.captions?.length || 0 } } : o);
        } catch (e) {
          console.error('[VideoAuto] cleanAudio failed', e);
          setLog(`Voice processing skipped: ${e.message}. Continuing with original audio.`);
        }
      }

      const blob = await renderVideo({
        template: tpl,
        aspect,
        clips: readyClips,
        fields,
        brand,
        filter,
        transition,
        hookStyle,
        hookText: hookText?.trim() || undefined,
        quality,
        cta: cta?.enabled ? cta : null,
        overlay: effectiveOverlay,
        music: music?.url ? music : null,
        onProgress: (p) => setProgress(wantsAudioWork ? 0.4 + p * 0.6 : p),
        onLog: setLog,
      });
      const url = URL.createObjectURL(blob);
      setOutputUrl(url);
      setOutputMime(blob.type);
      toast?.success?.('Video ready!');
      setLog(`Done · ${(blob.size/1024/1024).toFixed(1)} MB`);

      // Auto-save to Recent Renders (capture a thumbnail from the output video)
      try {
        const thumb = await captureThumbFromBlob(blob, aspect);
        const record = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
          ts: Date.now(),
          tplId: tpl.id,
          tplName: tpl.name,
          aspect,
          fields: { ...fields },
          filter,
          size: blob.size,
          mime: blob.type,
          blob,
          thumb,
        };
        setRecent(prev => {
          const next = [record, ...(prev || [])].slice(0, 5);
          return next;
        });
      } catch (e) { console.warn('[VideoAuto] save to Recent failed', e); }
    } catch (e) {
      console.error(e);
      toast?.error?.(`Render failed: ${e.message}`);
      setLog(`Failed: ${e.message}`);
    }
    setRendering(false);
  };

  const downloadOutput = () => {
    if (!outputUrl) return;
    const a = document.createElement('a');
    a.href = outputUrl;
    const ext = outputMime.includes('webm') ? 'webm' : 'mp4';
    a.download = `${tpl.id}_${Date.now()}.${ext}`;
    a.click();
  };

  // Mass export — render all 3 aspect ratios in series, reuse the cleaned overlay across runs.
  const handleMassExport = async () => {
    if (!canGenerate) { toast?.error?.(reasonDisabled || 'Add clips first'); return; }
    if (rendering || massExporting) return;
    setMassExporting(true);
    setOutputUrl(null);

    // Pre-trim + clean overlay once
    let effectiveOverlay = overlay?.status === 'ready' ? overlay : null;
    if (effectiveOverlay) effectiveOverlay = await applyTrimIfNeeded(effectiveOverlay);
    const wantsAudioWork = effectiveOverlay
      && (effectiveOverlay.autoClean || effectiveOverlay.denoise || effectiveOverlay.burnCaptions)
      && effectiveOverlay.file;
    if (wantsAudioWork) {
      setLog('Processing voice (one-time, reused across 3 renders)…');
      try {
        const result = await cleanAudio(effectiveOverlay.file, {
          removeFillers: !!effectiveOverlay.autoClean,
          denoise:       !!effectiveOverlay.denoise,
          onLog: setLog,
          onProgress: () => {},
        });
        if (result.cleanedFile !== effectiveOverlay.file) {
          const cleanedUrl = URL.createObjectURL(result.cleanedFile);
          effectiveOverlay = { ...effectiveOverlay, url: cleanedUrl, file: result.cleanedFile };
        }
        effectiveOverlay = { ...effectiveOverlay, captions: result.captions || [] };
      } catch (e) {
        toast?.error?.(`Audio prep failed: ${e.message}`);
      }
    }

    const aspects = ['9:16', '1:1', '16:9'];
    const successes = [];
    for (let i = 0; i < aspects.length; i++) {
      const a = aspects[i];
      setLog(`Rendering ${i+1}/3: ${a}…`);
      try {
        const blob = await renderVideo({
          template: tpl,
          aspect: a,
          clips: readyClips,
          fields, brand, filter, transition, hookStyle,
          hookText: hookText?.trim() || undefined,
          overlay: effectiveOverlay,
          music: music?.url ? music : null,
          onProgress: (p) => setProgress((i + p) / 3),
          onLog: (msg) => setLog(`[${i+1}/3 · ${a}] ${msg}`),
        });
        const thumb = await captureThumbFromBlob(blob, a).catch(() => null);
        const record = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
          ts: Date.now(),
          tplId: tpl.id, tplName: `${tpl.name} · ${a}`,
          aspect: a, fields: { ...fields }, filter,
          size: blob.size, mime: blob.type, blob, thumb,
        };
        setRecent(prev => [record, ...(prev || [])].slice(0, 5));
        successes.push(a);
      } catch (e) {
        console.error('[VideoAuto] mass export failed for', a, e);
        toast?.error?.(`${a} failed: ${e.message}`);
      }
    }
    setMassExporting(false);
    setProgress(0);
    if (successes.length === 3) {
      toast?.success?.('All 3 aspect ratios saved to Recent Renders!');
      setLog(`Mass export complete · 3 versions saved`);
    } else if (successes.length > 0) {
      toast?.info?.(`Saved ${successes.length}/3 versions. Check Recent Renders.`);
      setLog(`Partial mass export · ${successes.join(', ')} saved`);
    } else {
      setLog('Mass export failed — see toast');
    }
  };

  // If the overlay has a non-trivial trim range, FFmpeg-trim the file first.
  // Returns the (possibly new) overlay with the file replaced.
  const applyTrimIfNeeded = async (ov) => {
    if (!ov) return ov;
    const start = ov.trimStart ?? 0;
    const end   = ov.trimEnd   ?? ov.duration ?? 0;
    if (!ov.duration) return ov;
    const trimsApplied = start > 0.1 || end < ov.duration - 0.1;
    if (!trimsApplied) return ov;
    try {
      setLog(`Trimming overlay to ${start.toFixed(1)}s–${end.toFixed(1)}s…`);
      const trimmed = await trimVideo(ov.file, start, end, {
        onLog: setLog,
        onProgress: () => {},
      });
      const newUrl = URL.createObjectURL(trimmed);
      return { ...ov, file: trimmed, url: newUrl, trimApplied: true };
    } catch (e) {
      toast?.error?.(`Trim failed: ${e.message}. Using original overlay.`);
      return ov;
    }
  };

  // Extract template-fillable fields from a FUB lead (address/price/beds/baths/sqft/area).
  const extractFieldsFromLead = useCallback((lead) => {
    const fullAddr = [lead.address, lead.area].filter(Boolean).join(', ');
    const notes = lead.notes || '';
    const priceMatch = notes.match(/\$[\d,]+(?:\.\d+)?/);
    const bedsMatch  = notes.match(/(\d+)\s*(?:BD|bed)/i);
    const bathsMatch = notes.match(/(\d+(?:\.\d+)?)\s*(?:BA|bath)/i);
    const sqftMatch  = notes.match(/([\d,]+)\s*sqft/i);
    return {
      address: fullAddr,
      price:   priceMatch?.[0] || '',
      beds:    bedsMatch?.[1]  || '',
      baths:   bathsMatch?.[1] || '',
      sqft:    sqftMatch?.[1]?.replace(/,/g,'') || '',
      area:    lead.area || '',
      // For Just Sold / Past Client templates, auto-compose a congrats line
      message: lead.name ? `Congrats to ${lead.name}!` : '',
    };
  }, []);

  // Batch render: produce a video for each selected FUB contact.
  const handleBatchRender = async () => {
    const selectedLeads = (fubLeads || []).filter(l => fubSelected[l.id || l.fubId]);
    if (!selectedLeads.length) { toast?.error?.('Pick at least one contact'); return; }
    if (readyClips.length < 1) { toast?.error?.('Add at least one photo to use as background for all reels'); return; }
    if (!window.confirm(`Batch render ${selectedLeads.length} reel${selectedLeads.length===1?'':'s'} using the same template + photos + brand? Each one auto-downloads.`)) return;

    setFubPickerOpen(false);
    setBatchProgress({ done: 0, total: selectedLeads.length, current: '' });
    setLog(`Batch starting (${selectedLeads.length})…`);

    // Pre-trim + clean overlay once (reused across all renders if present)
    let effectiveOverlay = overlay?.status === 'ready' ? overlay : null;
    if (effectiveOverlay) effectiveOverlay = await applyTrimIfNeeded(effectiveOverlay);
    const wantsAudio = effectiveOverlay
      && (effectiveOverlay.autoClean || effectiveOverlay.denoise || effectiveOverlay.burnCaptions)
      && effectiveOverlay.file;
    if (wantsAudio) {
      setLog('Processing voice (one-time, reused for all)…');
      try {
        const result = await cleanAudio(effectiveOverlay.file, {
          removeFillers: !!effectiveOverlay.autoClean,
          denoise:       !!effectiveOverlay.denoise,
          onLog: setLog, onProgress: () => {},
        });
        if (result.cleanedFile !== effectiveOverlay.file) {
          effectiveOverlay = {
            ...effectiveOverlay,
            url:  URL.createObjectURL(result.cleanedFile),
            file: result.cleanedFile,
          };
        }
        effectiveOverlay = { ...effectiveOverlay, captions: result.captions || [] };
      } catch (e) {
        toast?.error?.(`Audio prep failed: ${e.message}`);
      }
    }

    let successCount = 0;
    for (let i = 0; i < selectedLeads.length; i++) {
      const lead = selectedLeads[i];
      const leadFields = extractFieldsFromLead(lead);
      setBatchProgress({ done: i, total: selectedLeads.length, current: lead.name || 'Unnamed' });
      setLog(`[${i+1}/${selectedLeads.length}] Rendering ${lead.name || 'Unnamed'}…`);
      try {
        const blob = await renderVideo({
          template: tpl,
          aspect,
          clips: readyClips,
          fields: { ...fields, ...leadFields },
          brand, filter, transition, hookStyle, quality,
          hookText: hookText?.trim() || undefined,
          cta: cta?.enabled ? cta : null,
          overlay: effectiveOverlay,
          music: music?.url ? music : null,
          onProgress: (p) => setBatchProgress(b => b ? { ...b, fractional: p } : b),
          onLog: () => {},
        });
        // Auto-download each one
        const url = URL.createObjectURL(blob);
        const safeName = (lead.name || 'lead').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${tpl.id}_${safeName}.webm`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);

        // Also save to Recent Renders (will trim to last 5)
        try {
          const thumb = await captureThumbFromBlob(blob, aspect);
          const record = {
            id: `${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
            ts: Date.now(),
            tplId: tpl.id, tplName: `${tpl.name} · ${lead.name || 'Unnamed'}`,
            aspect, fields: { ...fields, ...leadFields }, filter,
            size: blob.size, mime: blob.type, blob, thumb,
          };
          setRecent(prev => [record, ...(prev || [])].slice(0, 5));
        } catch {}
        successCount++;
      } catch (e) {
        console.error('[VideoAuto] batch render failed for', lead.name, e);
        toast?.error?.(`${lead.name || 'Unnamed'} failed: ${e.message}`);
      }
    }

    setBatchProgress(null);
    setLog(`Batch complete · ${successCount}/${selectedLeads.length} rendered + downloaded`);
    if (successCount === selectedLeads.length) {
      toast?.success?.(`Batched ${successCount} reels — all downloaded`);
    } else {
      toast?.info?.(`Batched ${successCount}/${selectedLeads.length} reels. Check your Downloads folder.`);
    }
    setFubSelected({});
    setFubMultiSelect(false);
  };

  // Save current setup as a named preset (recipe).
  const saveCurrentAsPreset = () => {
    const name = window.prompt('Name this preset (e.g. "My Just Sold Template"):');
    if (!name?.trim()) return;
    const preset = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      name: name.trim(),
      ts: Date.now(),
      // Snapshot the workflow settings — NOT the clips or overlay file
      tplId, aspect, filter, transition, hookStyle, hookText,
      fields,
      music: music ? { ...music } : null,
      // brand is saved separately in its own useLS key — we don't snapshot it
    };
    setPresets(prev => [preset, ...(prev || [])].slice(0, 12));
    toast?.success?.(`Saved preset "${name.trim()}"`);
  };

  const loadPreset = (p) => {
    if (p.tplId)      setTplId(p.tplId);
    if (p.aspect)     setAspect(p.aspect);
    if (p.filter)     setFilter(p.filter);
    if (p.transition) setTransition(p.transition);
    if (p.hookStyle)  setHookStyle(p.hookStyle);
    if (p.hookText !== undefined) setHookText(p.hookText || '');
    if (p.fields)     setFields(prev => ({ ...prev, ...p.fields }));
    if (p.music)      setMusic(p.music);
    toast?.success?.(`Loaded "${p.name}"`);
  };

  // Start recording from webcam + microphone (or audio only).
  const startWebcamRecording = async (audioOnly = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: audioOnly ? false : { width: { ideal: 1080 }, height: { ideal: 1920 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (camPreviewRef.current && !audioOnly) {
        camPreviewRef.current.srcObject = stream;
        camPreviewRef.current.play().catch(()=>{});
      }
      const mime = audioOnly
        ? (['audio/webm;codecs=opus','audio/webm'].find(m => MediaRecorder.isTypeSupported(m)) || 'audio/webm')
        : (['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm');
      const chunks = [];
      const recorder = new MediaRecorder(stream, audioOnly
        ? { mimeType: mime, audioBitsPerSecond: 128_000 }
        : { mimeType: mime, videoBitsPerSecond: 4_000_000 });
      recorder.ondataavailable = e => e.data?.size && chunks.push(e.data);
      recorder.start(500);
      setRecording({ stream, recorder, chunks, ts: Date.now(), mime, audioOnly });
    } catch (e) {
      toast?.error?.(`${audioOnly ? 'Microphone' : 'Camera'} access failed: ${e.message}. Check browser permissions.`);
    }
  };

  const stopWebcamRecording = async () => {
    if (!recording) return;
    const { stream, recorder, chunks, mime, audioOnly } = recording;
    const done = new Promise(r => recorder.onstop = r);
    try { recorder.stop(); } catch {}
    await Promise.race([done, new Promise(r => setTimeout(r, 5000))]);
    stream.getTracks().forEach(t => t.stop());
    if (camPreviewRef.current) camPreviewRef.current.srcObject = null;

    const blob = new Blob(chunks, { type: mime });
    if (blob.size < 1024) {
      toast?.error?.('Recording too short or empty');
      setRecording(null);
      return;
    }
    const ext = audioOnly ? 'webm' : 'webm';
    const filename = audioOnly ? `voiceover_${Date.now()}.${ext}` : `selfie_${Date.now()}.${ext}`;
    const file = new File([blob], filename, { type: mime });
    const url = URL.createObjectURL(file);
    setOverlay({
      url, file, name: file.name,
      position:'top-right', size:0.28, shape:'circle', volume:1.0,
      autoClean: true, denoise: true, beauty: 'soft', burnCaptions: true, captionStyle: 'bold',
      audioOnly: !!audioOnly,
      status: 'ready',
    });
    setRecording(null);
    toast?.success?.(audioOnly
      ? `Recorded voiceover · ${(blob.size/1024).toFixed(0)} KB — captions will burn in automatically`
      : `Recorded ${(blob.size/1024/1024).toFixed(1)} MB · ready as overlay`);
  };

  // Generate a voiceover script from template + fields via Claude.
  const generateVoiceoverScript = async () => {
    setScriptModal({ text: '', busy: true });
    try {
      const filledFields = Object.entries(fields).filter(([_,v]) => v).map(([k,v]) => `${k}: ${v}`).join(' · ');
      const sceneCount = clips.length;
      const targetSec = Math.max(15, Math.min(45, sceneCount * 3));
      const prompt = `Write a ${targetSec}-second voiceover script for a ${tpl.name} real estate / personal brand video. The agent reads this aloud while recording themselves; their voice plays over ${sceneCount} photos cycling behind.

Listing context: ${filledFields || '(no fields filled — be generic)'}

Brand voice: ${brand?.name || 'Monica Iskra'}, real estate broker in Livonia / Metro Detroit, MI. Warm, confident, direct. Not salesy.

Rules:
- ${targetSec} seconds when spoken at a natural pace (~150 words per minute = ~${Math.round(targetSec * 2.5)} words total)
- ONE paragraph, no headers, no scene labels, no stage directions
- First 1.5 sec must be a strong HOOK (a question, a number, a curiosity loop)
- End with a soft CTA (DM me, link in bio, etc.)
- No emojis, no markdown, no quotes — just plain spoken text the agent reads aloud
- Punchy sentences, conversational rhythm`;

      const out = await callClaudeLocal(prompt, 'You write punchy, on-brand voiceover scripts for real estate agents.', 400);
      setScriptModal({ text: out.trim(), busy: false });
    } catch (e) {
      setScriptModal({ text: '', busy: false, error: e.message });
      toast?.error?.(`Script AI failed: ${e.message}`);
    }
  };

  const cancelWebcamRecording = () => {
    if (!recording) return;
    try { recording.recorder.stop(); } catch {}
    recording.stream.getTracks().forEach(t => t.stop());
    if (camPreviewRef.current) camPreviewRef.current.srcObject = null;
    setRecording(null);
  };

  // ─── Export / Import Hub data (sync between machines) ────────────────────
  const importInputRef = useRef();

  const exportHubData = () => {
    const KEYS = [
      'rehub_brand', 'va_presets',
      'va_tpl', 'va_aspect', 'va_filter',
      'va_transition', 'va_hookstyle', 'va_quality',
      'va_cta', 'va_music',
    ];
    const data = {
      _format: 're-hub-export',
      _version: 1,
      _exportedAt: new Date().toISOString(),
      _exportedBy: brand?.name || 'Monica Iskra',
      settings: {},
    };
    KEYS.forEach(k => {
      const raw = localStorage.getItem(k);
      if (raw !== null) {
        try { data.settings[k] = JSON.parse(raw); }
        catch { data.settings[k] = raw; }
      }
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `re-hub-${stamp}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast?.success?.('Hub data exported · copy this file to your other machine');
  };

  const importHubData = async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data._format !== 're-hub-export') {
        toast?.error?.('Not a Hub export file');
        return;
      }
      const keyCount = Object.keys(data.settings || {}).length;
      if (!window.confirm(`Import ${keyCount} setting${keyCount===1?'':'s'} from ${data._exportedBy || 'unknown'} (${data._exportedAt?.slice(0,10) || 'unknown date'})?\n\nThis overwrites your current Brand Kit, Presets, and preferences. Recent Renders + clips are NOT affected.`)) return;
      Object.entries(data.settings).forEach(([k, v]) => {
        localStorage.setItem(k, JSON.stringify(v));
      });
      toast?.success?.(`Imported ${keyCount} settings — reloading…`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast?.error?.(`Import failed: ${e.message}`);
    }
  };

  const generateHashtags = async () => {
    setHashtagsBusy(true);
    try {
      const filledFields = Object.entries(fields).filter(([_,v]) => v).map(([k,v]) => `${k}: ${v}`).join(' · ');
      const prompt = `Generate 18 high-engagement social hashtags for a ${tpl.name} video. Context: ${filledFields || '(no fields filled)'}. Mix:
- 5 broad (high reach): #realestate, #realtor, #homesforsale
- 6 niche (medium reach): area-specific, niche-specific
- 4 local (Livonia / Metro Detroit / Michigan if relevant)
- 3 trending/branded

Output: ONE line, space-separated, # prefix, lowercase, no commentary, no quotes.`;
      const out = await callClaudeLocal(prompt, 'You write engaging real-estate social hashtags optimized for IG/TikTok reach.', 220);
      setHashtags(out.trim());
      toast?.success?.('Hashtags ready');
    } catch (e) {
      toast?.error?.(`Hashtag AI failed: ${e.message}`);
    }
    setHashtagsBusy(false);
  };

  // ── styles ──────────────────────────────────────────────────────────────────
  const S = STYLES;

  return (
    <div className="page-content" style={S.page}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
      {batchProgress && (
        <div style={{
          position:'fixed', bottom:24, right:24, zIndex:1100,
          background:'rgba(12,16,28,.96)', border:'1px solid rgba(168,85,247,.4)',
          borderRadius:12, padding:'14px 18px', maxWidth:360,
          boxShadow:'0 20px 60px rgba(0,0,0,.5)',
        }}>
          <div style={{fontSize:13, fontWeight:800, color:'#d8b4fe', marginBottom:6}}>
            🎬 Batch rendering · {batchProgress.done}/{batchProgress.total}
          </div>
          <div style={{fontSize:12, color:'#cbd5e1', marginBottom:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
            Now: <strong>{batchProgress.current || '…'}</strong>
          </div>
          <div style={{height:6, background:'rgba(255,255,255,.06)', borderRadius:3, overflow:'hidden'}}>
            <div style={{
              height:'100%',
              width: `${((batchProgress.done + (batchProgress.fractional || 0)) / batchProgress.total) * 100}%`,
              background:'linear-gradient(90deg, #a855f7, #6366f1)',
              transition:'width .15s',
            }}/>
          </div>
        </div>
      )}
      <div style={S.header}>
        <button onClick={() => setPage?.('dashboard')} style={S.backBtn}>← Dashboard</button>
        <div>
          <div style={S.title}>Auto Video Maker</div>
          <div style={S.sub}>Pick a template · drop clips · one button · done.</div>
        </div>
      </div>

      {/* Saved Presets row */}
      <div style={{
        background:'rgba(8,12,24,.45)', border:'1px solid rgba(255,255,255,.04)',
        borderRadius:10, padding:'10px 14px', marginBottom:18,
        display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
      }}>
        <div style={{fontSize:11, fontWeight:800, color:'#7eb8f7', letterSpacing:1.2, textTransform:'uppercase'}}>
          📦 Presets
        </div>
        {(presets || []).length === 0 ? (
          <div style={{fontSize:11, color:'#475569', flex:1}}>
            Save your current setup as a one-click recipe →
          </div>
        ) : (
          <div style={{display:'flex', gap:6, flexWrap:'wrap', flex:1}}>
            {presets.map(p => (
              <div key={p.id} style={{
                display:'flex', alignItems:'center', gap:0,
                background:'rgba(168,85,247,.10)', border:'1px solid rgba(168,85,247,.3)',
                borderRadius:6, overflow:'hidden',
              }}>
                <button onClick={()=>loadPreset(p)}
                  title={`${p.tplId} · ${p.aspect} · filter:${p.filter} · hook:${p.hookStyle}`}
                  style={{
                    background:'transparent', border:'none', color:'#d8b4fe',
                    padding:'5px 10px', fontSize:11.5, fontWeight:700, cursor:'pointer',
                  }}>
                  {p.name}
                </button>
                <button onClick={()=>{
                  if (window.confirm(`Delete preset "${p.name}"?`)) setPresets(prev => prev.filter(x => x.id !== p.id));
                }} style={{
                  background:'transparent', border:'none', borderLeft:'1px solid rgba(168,85,247,.3)',
                  color:'#a855f7', padding:'5px 8px', cursor:'pointer', fontSize:11,
                }}>✕</button>
              </div>
            ))}
          </div>
        )}
        <button onClick={saveCurrentAsPreset} style={{
          background:'rgba(168,85,247,.18)', border:'1px solid rgba(168,85,247,.4)',
          color:'#d8b4fe', borderRadius:6, padding:'5px 12px',
          fontSize:11.5, fontWeight:700, cursor:'pointer',
        }}>
          💾 Save current as preset
        </button>

        <div style={{width:1, height:18, background:'rgba(255,255,255,.08)', margin:'0 4px'}}/>

        <button
          onClick={exportHubData}
          title="Download Brand Kit + Presets + preferences as a JSON file — copy to your other machine."
          style={{
            background:'rgba(6,182,212,.12)', border:'1px solid rgba(6,182,212,.35)',
            color:'#67e8f9', borderRadius:6, padding:'5px 12px',
            fontSize:11.5, fontWeight:700, cursor:'pointer',
          }}>
          ⬇ Export
        </button>

        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          style={{display:'none'}}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            e.target.value = '';
            importHubData(f);
          }}
        />
        <button
          onClick={() => importInputRef.current?.click()}
          title="Restore Brand Kit + Presets + preferences from a Hub export JSON file."
          style={{
            background:'rgba(6,182,212,.12)', border:'1px solid rgba(6,182,212,.35)',
            color:'#67e8f9', borderRadius:6, padding:'5px 12px',
            fontSize:11.5, fontWeight:700, cursor:'pointer',
          }}>
          ⬆ Import
        </button>
      </div>

      <div style={S.grid}>
        {/* LEFT: template picker + fields + brand */}
        <div style={S.col}>
          <div style={S.card}>
            <div style={S.cardLabel}>1 · Template</div>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              {Object.entries(grouped).map(([cat, tpls]) => (
                <div key={cat}>
                  <div style={S.catLabel}>{cat}</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:6}}>
                    {tpls.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setTplId(t.id)}
                        style={{
                          ...S.tplBtn,
                          ...(t.id === tplId ? S.tplBtnActive(t.accent) : {}),
                        }}
                      >
                        <span style={{fontSize:18}}>{t.emoji}</span>
                        <span style={{fontWeight:700,fontSize:12.5}}>{t.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={S.card}>
            <div style={S.cardLabel}>2 · Intro Hook</div>
            <div style={{fontSize:10.5, color:'#64748b', marginBottom:10, lineHeight:1.5}}>
              First 1.4 sec — most viewers decide here whether to keep watching.
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:6,marginBottom:12}}>
              {HOOK_STYLES.map(hs => (
                <button key={hs.id}
                  onClick={()=>setHookStyle(hs.id)}
                  title={hs.desc}
                  style={{
                    ...S.tplBtn,
                    ...(hookStyle === hs.id ? S.tplBtnActive(tpl.accent) : {}),
                    padding:'9px 11px',
                  }}>
                  <span style={{fontSize:16}}>{hs.emoji}</span>
                  <div style={{flex:1,minWidth:0,textAlign:'left'}}>
                    <div style={{fontSize:12, fontWeight:700}}>{hs.name}</div>
                  </div>
                </button>
              ))}
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={S.fieldLabel}>Hook text (leave empty to use template default)</span>
              <button
                disabled={aiBusy}
                onClick={async () => {
                  setAiBusy(true);
                  try {
                    const ctx = Object.entries(fields).filter(([_,v])=>v).map(([k,v])=>`${k}: ${v}`).join(' · ');
                    const prompt = `Write ONE punchy, scroll-stopping hook for the first 1.4 seconds of a ${tpl.name} video. Template default is "${tpl.intro || tpl.name}". Context: ${ctx || '(none yet)'}. Constraints: 1-5 words, ALL CAPS works great, no punctuation, no emojis, no quotes, no preamble. Just the hook line.`;
                    const out = await callClaudeLocal(prompt, 'You write scroll-stopping social hooks for real estate agents.', 60);
                    setHookText(out.trim().replace(/^["']|["']$/g, '').toUpperCase());
                    toast?.success?.('Hook generated');
                  } catch (e) {
                    toast?.error?.(`AI failed: ${e.message}`);
                  }
                  setAiBusy(false);
                }}
                style={{
                  background:'rgba(168,85,247,.12)', border:'1px solid rgba(168,85,247,.3)',
                  color:'#d8b4fe', borderRadius:6, padding:'2px 8px',
                  fontSize:10, fontWeight:700, cursor: aiBusy ? 'wait' : 'pointer',
                }}>
                {aiBusy ? '…' : '✨ AI'}
              </button>
            </div>
            <input
              type="text"
              value={hookText}
              placeholder={tpl.intro || tpl.name}
              onChange={e=>setHookText(e.target.value.toUpperCase())}
              style={{...S.input, marginTop:4}}/>
          </div>

          <div style={S.card}>
            <div style={S.cardLabel}>3 · Aspect & Motion</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
              {Object.entries(ASPECTS).map(([key, a]) => (
                <button key={key}
                  onClick={() => setAspect(key)}
                  style={{...S.chip, ...(aspect === key ? S.chipActive : {})}}
                >
                  <strong>{key}</strong>&nbsp;{a.label}
                </button>
              ))}
            </div>
            <div style={{...S.fieldLabel, marginBottom:6}}>Transition between scenes</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:5,marginBottom:14}}>
              {[
                {id:'none',  label:'Hard Cut', emoji:'✂️'},
                {id:'fade',  label:'Fade',     emoji:'🌊'},
                {id:'slide', label:'Slide',    emoji:'➡️'},
                {id:'zoom',  label:'Zoom',     emoji:'🔍'},
              ].map(t => (
                <button key={t.id}
                  onClick={()=>setTransition(t.id)}
                  style={{
                    ...S.chip, ...(transition===t.id ? S.chipActive : {}),
                    padding:'8px 4px', textAlign:'center', fontSize:11,
                  }}>
                  <div style={{fontSize:14, marginBottom:2}}>{t.emoji}</div>
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{...S.fieldLabel, marginBottom:6}}>Export quality</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:5,marginBottom:8}}>
              {Object.entries(QUALITY).map(([id, q]) => (
                <button key={id}
                  onClick={()=>setQuality(id)}
                  title={q.desc}
                  style={{
                    ...S.chip, ...(quality===id ? S.chipActive : {}),
                    padding:'8px 4px', textAlign:'center', fontSize:11,
                  }}>
                  <div style={{fontSize:14, marginBottom:2}}>{q.emoji}</div>
                  {q.name}
                </button>
              ))}
            </div>
            <div style={{fontSize:10.5, color:'#64748b', lineHeight:1.4}}>
              {QUALITY[quality]?.desc}
            </div>

            <button
              disabled={testing}
              onClick={async () => {
                setTesting(true);
                setLog('Running 1-sec recorder self-test…');
                try {
                  // Tiny 240×240 canvas, paint red, capture 1s of webm
                  const c = document.createElement('canvas');
                  c.width = 240; c.height = 240;
                  c.style.cssText = 'position:fixed;left:-99999px;top:-99999px;';
                  document.body.appendChild(c);
                  const cx = c.getContext('2d');
                  cx.fillStyle = '#ef4444'; cx.fillRect(0,0,240,240);

                  if (typeof c.captureStream !== 'function') throw new Error('captureStream not supported in this browser');
                  const s = c.captureStream(30);
                  if (!s || !s.getVideoTracks().length) throw new Error('captureStream returned no tracks');

                  const mime = ['video/webm;codecs=vp8','video/webm']
                    .find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
                  const cs = [];
                  const r = new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: 1_000_000 });
                  r.ondataavailable = e => e.data?.size && cs.push(e.data);
                  const done = new Promise(rr => r.onstop = rr);
                  r.start(200);
                  // Paint moving rectangle to give the encoder something to encode
                  const t0 = performance.now();
                  await new Promise(res => {
                    const tick = () => {
                      const t = (performance.now() - t0)/1000;
                      cx.fillStyle = '#ef4444'; cx.fillRect(0,0,240,240);
                      cx.fillStyle = '#fff'; cx.fillRect((t*200)%240, 60, 40, 40);
                      if (t > 1.2) return res();
                      requestAnimationFrame(tick);
                    };
                    tick();
                  });
                  r.stop();
                  await Promise.race([done, new Promise(rs => setTimeout(rs, 3000))]);
                  s.getTracks().forEach(t=>t.stop());
                  c.remove();
                  const totalBytes = cs.reduce((a,b)=>a+b.size,0);
                  if (cs.length > 0 && totalBytes > 1000) {
                    toast?.success?.(`✓ Recorder works! ${cs.length} chunks, ${totalBytes} bytes`);
                    setLog(`✓ Recorder OK · ${cs.length} chunks, ${(totalBytes/1024).toFixed(1)} KB`);
                  } else {
                    toast?.error?.(`Recorder broken — 0 valid chunks. Your browser doesn't support canvas recording. Try Chrome/Edge.`);
                    setLog(`✗ Recorder produced ${cs.length} chunks, ${totalBytes} bytes. Try a different browser.`);
                  }
                } catch (e) {
                  toast?.error?.(`Self-test failed: ${e.message}`);
                  setLog(`✗ ${e.message}`);
                }
                setTesting(false);
              }}
              style={{
                ...S.chip, width:'100%', marginTop:10, padding:'8px',
                textAlign:'center', fontSize:11.5, fontWeight:700,
                cursor: testing ? 'wait' : 'pointer',
              }}>
              {testing ? '⏳ Testing…' : '🔧 Test recorder (1 sec)'}
            </button>
          </div>

          <div style={S.card}>
            <div style={S.cardLabel}>4 · Filter</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
              {FILTERS.map(f => {
                const previewClip = readyClips.find(c => c.kind === 'image');
                const previewCss = f.id === 'auto'
                  ? (previewClip?.autoFilterCss || 'brightness(1.04) contrast(1.08) saturate(1.12)')
                  : (f.css || 'none');
                const active = filter === f.id;
                return (
                  <button key={f.id} onClick={() => setFilter(f.id)} style={{
                    ...S.filterTile,
                    ...(active ? S.filterTileActive : {}),
                  }}>
                    <div style={{
                      ...S.filterTileImg,
                      backgroundImage: previewClip ? `url(${previewClip.url})` : `linear-gradient(135deg, ${tpl.accent || '#1a5aa0'}, #050810)`,
                      filter: previewClip ? previewCss : 'none',
                    }}/>
                    <div style={S.filterTileLabel}>
                      <span style={{fontSize:11}}>{f.emoji}</span>
                      <span style={{fontWeight:700,fontSize:10.5}}>{f.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {filter === 'auto' && (
              <div style={{fontSize:10.5, color:'#64748b', marginTop:10, lineHeight:1.5}}>
                ✨ <strong style={{color:'#7eb8f7'}}>Auto Enhance</strong> analyzes every photo individually and tunes brightness, contrast, saturation, and color cast for top-of-the-line results.
              </div>
            )}
          </div>

          <div style={S.card}>
            <div style={S.cardLabel}>5 · Talking-Head Overlay (optional)</div>
            <div style={{fontSize:11, color:'#64748b', marginBottom:10, lineHeight:1.5}}>
              Drop a selfie video here to appear as a PIP circle/card on top of your photos. Its audio becomes the soundtrack.
            </div>
            <input
              ref={overlayRef}
              type="file"
              accept="video/*,.mov,.mp4,.webm"
              style={{display:'none'}}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                e.target.value = '';
                const url = URL.createObjectURL(f);
                setOverlay({ url, file:f, name:f.name, position:'top-right', size:0.28, shape:'circle', volume:1.0,
                  autoClean: true, denoise: true, beauty: 'soft', burnCaptions: true, captionStyle: 'bold',
                  status: needsConversion(f) ? 'converting' : 'ready' });
                if (needsConversion(f)) {
                  try {
                    const newFile = await convertFile(f,
                      (msg)=>setOverlay(o=>o?{...o, statusMsg:msg}:o),
                      (p)=>setOverlay(o=>o?{...o, progress:p}:o));
                    const newUrl = URL.createObjectURL(newFile);
                    setOverlay(o => o ? { ...o, url: newUrl, file: newFile, status:'ready', statusMsg:'Ready' } : o);
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  } catch (err) {
                    toast?.error?.(`Overlay convert failed: ${err.message}`);
                    setOverlay(o => o ? { ...o, status:'failed', statusMsg:err.message } : o);
                  }
                }
              }}
            />

            {!overlay && !recording ? (
              <div style={{display:'flex', flexDirection:'column', gap:8}}>
                <button onClick={() => overlayRef.current?.click()} style={{
                  ...S.dropzone, width:'100%', padding:'18px 16px',
                }}>
                  <div style={{fontSize:22, opacity:.5}}>📁</div>
                  <div style={{fontSize:12, color:'#94a3b8'}}>Drop or click to upload video</div>
                  <div style={{fontSize:10, color:'#475569'}}>iPhone .mov works · auto-converts</div>
                </button>
                <button onClick={() => startWebcamRecording(false)} style={{
                  background:'linear-gradient(135deg, rgba(239,68,68,.18), rgba(239,68,68,.08))',
                  border:'1px solid rgba(239,68,68,.35)',
                  color:'#fca5a5', borderRadius:10, padding:'12px',
                  fontSize:12.5, fontWeight:700, cursor:'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                }}>
                  🎥 Record yourself (face + voice)
                </button>
                <button onClick={() => startWebcamRecording(true)} style={{
                  background:'linear-gradient(135deg, rgba(168,85,247,.18), rgba(168,85,247,.08))',
                  border:'1px solid rgba(168,85,247,.35)',
                  color:'#d8b4fe', borderRadius:10, padding:'12px',
                  fontSize:12.5, fontWeight:700, cursor:'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                }}>
                  🎙️ Record voiceover (audio only — no face shown)
                </button>
                <button onClick={generateVoiceoverScript} style={{
                  background:'rgba(168,85,247,.08)',
                  border:'1px dashed rgba(168,85,247,.35)',
                  color:'#c4b5fd', borderRadius:10, padding:'10px',
                  fontSize:11.5, fontWeight:700, cursor:'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:6,
                }}>
                  ✨ Need help? Generate a script for me to read
                </button>
              </div>
            ) : recording ? (
              <div style={{
                position:'relative', borderRadius:10, overflow:'hidden',
                background: recording.audioOnly
                  ? 'linear-gradient(135deg, #1a0a3e, #2d1456)'
                  : '#000',
                aspectRatio:'9/16',
                border:`1px solid ${recording.audioOnly ? 'rgba(168,85,247,.6)' : 'rgba(239,68,68,.5)'}`,
                display: recording.audioOnly ? 'flex' : 'block',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {!recording.audioOnly && (
                  <video ref={camPreviewRef} muted playsInline autoPlay
                    style={{width:'100%',height:'100%',objectFit:'cover',display:'block',transform:'scaleX(-1)'}}/>
                )}
                {recording.audioOnly && (
                  <div style={{textAlign:'center', padding:'40px 20px'}}>
                    <div style={{fontSize:64, opacity:.85, marginBottom:14, animation:'pulse 1.5s ease-in-out infinite'}}>🎙️</div>
                    <div style={{fontSize:15, color:'#fff', fontWeight:700, marginBottom:6}}>Voiceover Recording</div>
                    <div style={{fontSize:11.5, color:'#cbd5e1'}}>No video — just your voice. Photos will play behind it during render.</div>
                  </div>
                )}
                <div style={{
                  position:'absolute', top:12, left:12,
                  background: recording.audioOnly ? 'rgba(168,85,247,.95)' : 'rgba(239,68,68,.95)',
                  color:'#fff',
                  padding:'4px 10px', borderRadius:6,
                  fontSize:11.5, fontWeight:800,
                  display:'flex',alignItems:'center',gap:6,
                }}>
                  <span style={{
                    display:'inline-block', width:8, height:8, borderRadius:'50%',
                    background:'#fff', animation:'pulse 1.5s ease-in-out infinite',
                  }}/>
                  REC · {((Date.now() - recording.ts) / 1000).toFixed(0)}s
                </div>
                <div style={{position:'absolute', bottom:14, left:14, right:14, display:'flex', gap:8}}>
                  <button onClick={cancelWebcamRecording} style={{
                    flex:1, padding:'10px',
                    background:'rgba(0,0,0,.75)', color:'#fff', borderRadius:8,
                    border:'1px solid rgba(255,255,255,.2)',
                    fontSize:12, fontWeight:700, cursor:'pointer',
                  }}>Cancel</button>
                  <button onClick={stopWebcamRecording} style={{
                    flex:2, padding:'10px',
                    background: recording.audioOnly
                      ? 'linear-gradient(135deg, #a855f7, #7c3aed)'
                      : 'linear-gradient(135deg, #ef4444, #b91c1c)',
                    color:'#fff',
                    border:'none', borderRadius:8,
                    fontSize:13, fontWeight:800, cursor:'pointer',
                  }}>⏹ Stop & Use</button>
                </div>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <div style={{
                  position:'relative', borderRadius:10, overflow:'hidden',
                  background:'#000', aspectRatio:'16/9',
                  border: overlay.status === 'failed' ? '1px solid #ef4444' :
                          overlay.status === 'converting' ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,.08)',
                }}>
                  <video src={overlay.url} controls muted playsInline preload="metadata"
                    onLoadedMetadata={(e) => {
                      const d = e.target.duration;
                      if (isFinite(d) && d > 0 && overlay?.duration !== d) {
                        setOverlay(o => o ? {
                          ...o,
                          duration: d,
                          trimStart: o.trimStart ?? 0,
                          trimEnd:   o.trimEnd ?? d,
                        } : o);
                      }
                    }}
                    style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                  {overlay.status === 'converting' && (
                    <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.6)',
                      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6}}>
                      <div style={{color:'#fbbf24',fontSize:13,fontWeight:700}}>
                        Transcoding HEVC → MP4{overlay.progress ? ` · ${Math.round(overlay.progress*100)}%` : '…'}
                      </div>
                      <div style={{color:'#fde68a',fontSize:10}}>{overlay.statusMsg || 'Please wait'}</div>
                    </div>
                  )}
                  <button onClick={() => { if (overlay?.url?.startsWith('blob:')) URL.revokeObjectURL(overlay.url); setOverlay(null); }}
                    style={{position:'absolute',top:6,right:6,background:'rgba(0,0,0,.7)',color:'#fff',
                    border:'none',borderRadius:6,padding:'4px 8px',fontSize:11,cursor:'pointer'}}>✕ Remove</button>
                </div>

                {overlay.duration > 0 && (
                  <div>
                    <div style={{...S.fieldLabel, marginBottom:6, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                      <span>✂️ Trim &nbsp;
                        <span style={{color:'#94a3b8', fontWeight:600, textTransform:'none', letterSpacing:0}}>
                          {(overlay.trimStart ?? 0).toFixed(1)}s → {(overlay.trimEnd ?? overlay.duration).toFixed(1)}s
                          &nbsp;({((overlay.trimEnd ?? overlay.duration) - (overlay.trimStart ?? 0)).toFixed(1)}s kept)
                        </span>
                      </span>
                      {(overlay.trimStart > 0 || overlay.trimEnd < overlay.duration) && (
                        <button onClick={()=>setOverlay(o=>({...o, trimStart:0, trimEnd:o.duration}))}
                          style={{...S.chip, fontSize:10, padding:'3px 8px'}}>Reset</button>
                      )}
                    </div>
                    {/* Visual track with selected range */}
                    <div style={{
                      position:'relative', height:8, background:'rgba(255,255,255,.06)',
                      borderRadius:4, overflow:'hidden', marginBottom:8,
                    }}>
                      <div style={{
                        position:'absolute',
                        left: `${((overlay.trimStart || 0) / overlay.duration) * 100}%`,
                        right: `${(1 - (overlay.trimEnd || overlay.duration) / overlay.duration) * 100}%`,
                        top:0, bottom:0,
                        background:'linear-gradient(90deg, rgba(168,85,247,.7), rgba(99,102,241,.7))',
                      }}/>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                      <div>
                        <div style={{fontSize:10.5,color:'#94a3b8',marginBottom:2}}>Start ({(overlay.trimStart ?? 0).toFixed(1)}s)</div>
                        <input type="range"
                          min={0} max={overlay.duration} step={0.1}
                          value={overlay.trimStart ?? 0}
                          onChange={(e)=>{
                            const v = parseFloat(e.target.value);
                            setOverlay(o => ({...o, trimStart: Math.min(v, (o.trimEnd ?? o.duration) - 0.5)}));
                          }}
                          style={{width:'100%', accentColor:'#a855f7'}}/>
                      </div>
                      <div>
                        <div style={{fontSize:10.5,color:'#94a3b8',marginBottom:2}}>End ({(overlay.trimEnd ?? overlay.duration).toFixed(1)}s)</div>
                        <input type="range"
                          min={0} max={overlay.duration} step={0.1}
                          value={overlay.trimEnd ?? overlay.duration}
                          onChange={(e)=>{
                            const v = parseFloat(e.target.value);
                            setOverlay(o => ({...o, trimEnd: Math.max(v, (o.trimStart ?? 0) + 0.5)}));
                          }}
                          style={{width:'100%', accentColor:'#a855f7'}}/>
                      </div>
                    </div>
                    <div style={{fontSize:10.5, color:'#64748b', marginTop:6, lineHeight:1.4}}>
                      Cuts dead air off the start/end. Audio gets re-transcribed on the trimmed segment so captions stay synced.
                    </div>
                  </div>
                )}

                {!overlay.audioOnly && (
                <>
                <div>
                  <div style={{...S.fieldLabel, marginBottom:6}}>Position</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
                    {[
                      {id:'top-left',label:'↖ TL'},{id:'top-right',label:'↗ TR'},{id:'center-low',label:'⬇ Bot Ctr'},
                      {id:'bottom-left',label:'↙ BL'},{id:'bottom-right',label:'↘ BR'},
                    ].map(p => (
                      <button key={p.id}
                        onClick={()=>setOverlay(o=>({...o, position:p.id}))}
                        style={{...S.chip, ...(overlay.position===p.id ? S.chipActive : {}), padding:'8px 6px', textAlign:'center'}}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{...S.fieldLabel, marginBottom:6}}>Shape</div>
                  <div style={{display:'flex',gap:6}}>
                    {['circle','rounded'].map(s => (
                      <button key={s} onClick={()=>setOverlay(o=>({...o, shape:s}))}
                        style={{...S.chip, ...(overlay.shape===s ? S.chipActive : {}), flex:1, textTransform:'capitalize'}}>
                        {s === 'circle' ? '⭕ Circle' : '▢ Rounded'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{...S.fieldLabel, marginBottom:6}}>Size {Math.round((overlay.size||0.28)*100)}% of frame</div>
                  <input type="range" min={0.15} max={0.55} step={0.01}
                    value={overlay.size || 0.28}
                    onChange={e=>setOverlay(o=>({...o, size:parseFloat(e.target.value)}))}
                    style={{width:'100%'}}/>
                </div>
                </>
                )}
                {overlay.audioOnly && (
                  <div style={{
                    padding:'10px 12px', borderRadius:9,
                    background:'rgba(168,85,247,.08)', border:'1px solid rgba(168,85,247,.3)',
                    fontSize:11.5, color:'#d8b4fe', display:'flex', alignItems:'center', gap:8,
                  }}>
                    🎙️ <strong>Voiceover mode</strong> — no face shown on screen. Your photos play full-frame with captions burned in over your voice.
                  </div>
                )}

                <div>
                  <div style={{...S.fieldLabel, marginBottom:6}}>Voice volume {Math.round((overlay.volume||1)*100)}%</div>
                  <input type="range" min={0} max={1.5} step={0.05}
                    value={overlay.volume ?? 1.0}
                    onChange={e=>setOverlay(o=>({...o, volume:parseFloat(e.target.value)}))}
                    style={{width:'100%'}}/>
                </div>

                <label style={{
                  display:'flex',alignItems:'flex-start',gap:10,padding:'10px 12px',
                  background: overlay.autoClean ? 'rgba(126,184,247,.08)' : 'rgba(255,255,255,.03)',
                  border: overlay.autoClean ? '1px solid rgba(126,184,247,.3)' : '1px solid rgba(255,255,255,.06)',
                  borderRadius:9, cursor:'pointer',
                }}>
                  <input type="checkbox"
                    checked={!!overlay.autoClean}
                    onChange={e=>setOverlay(o=>({...o, autoClean:e.target.checked}))}
                    style={{marginTop:3}}/>
                  <div>
                    <div style={{fontSize:12.5, fontWeight:700, color:'#f1f5f9'}}>
                      ✨ Auto-clean voice (remove ums)
                    </div>
                    <div style={{fontSize:10.5, color:'#94a3b8', marginTop:3, lineHeight:1.5}}>
                      AI detects and cuts "um", "uh", "you know", "i mean" in-browser. First run downloads ~75 MB; offline after.
                    </div>
                    {overlay.cleanResult && overlay.cleanResult.removed > 0 && (
                      <div style={{fontSize:11, color:'#10b981', marginTop:5, fontWeight:600}}>
                        ✓ Removed {overlay.cleanResult.removed} filler{overlay.cleanResult.removed===1?'':'s'} on last clean
                      </div>
                    )}
                  </div>
                </label>

                <label style={{
                  display:'flex',alignItems:'flex-start',gap:10,padding:'10px 12px',
                  background: overlay.denoise ? 'rgba(16,185,129,.08)' : 'rgba(255,255,255,.03)',
                  border: overlay.denoise ? '1px solid rgba(16,185,129,.3)' : '1px solid rgba(255,255,255,.06)',
                  borderRadius:9, cursor:'pointer',
                }}>
                  <input type="checkbox"
                    checked={!!overlay.denoise}
                    onChange={e=>setOverlay(o=>({...o, denoise:e.target.checked}))}
                    style={{marginTop:3}}/>
                  <div>
                    <div style={{fontSize:12.5, fontWeight:700, color:'#f1f5f9'}}>
                      🔇 Reduce background noise
                    </div>
                    <div style={{fontSize:10.5, color:'#94a3b8', marginTop:3, lineHeight:1.5}}>
                      Removes fan hum, traffic, AC, room noise. Powered by FFmpeg AFFT denoise.
                    </div>
                  </div>
                </label>

                <label style={{
                  display:'flex',alignItems:'flex-start',gap:10,padding:'10px 12px',
                  background: overlay.burnCaptions ? 'rgba(251,191,36,.08)' : 'rgba(255,255,255,.03)',
                  border: overlay.burnCaptions ? '1px solid rgba(251,191,36,.3)' : '1px solid rgba(255,255,255,.06)',
                  borderRadius:9, cursor:'pointer',
                }}>
                  <input type="checkbox"
                    checked={!!overlay.burnCaptions}
                    onChange={e=>setOverlay(o=>({...o, burnCaptions:e.target.checked}))}
                    style={{marginTop:3}}/>
                  <div>
                    <div style={{fontSize:12.5, fontWeight:700, color:'#f1f5f9'}}>
                      💬 Auto-burn captions (TikTok-style)
                    </div>
                    <div style={{fontSize:10.5, color:'#94a3b8', marginTop:3, lineHeight:1.5}}>
                      Words appear on screen as you say them. Current word highlighted in the template's accent color. 85% of social videos are watched on mute — this is the #1 view-rate boost.
                    </div>
                    {overlay.cleanResult?.captionCount > 0 && (
                      <div style={{fontSize:11, color:'#fbbf24', marginTop:5, fontWeight:600}}>
                        ✓ {overlay.cleanResult.captionCount} words captioned on last clean
                      </div>
                    )}
                  </div>
                </label>

                {overlay.burnCaptions && (
                  <div>
                    <div style={{...S.fieldLabel, marginBottom:6}}>Caption style</div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:5}}>
                      {CAPTION_STYLES.map(s => (
                        <button key={s.id}
                          onClick={()=>setOverlay(o=>({...o, captionStyle:s.id}))}
                          title={s.desc}
                          style={{
                            ...S.chip,
                            ...((overlay.captionStyle || 'bold')===s.id ? S.chipActive : {}),
                            padding:'8px 4px', textAlign:'center', fontSize:11,
                          }}>
                          <div style={{fontSize:14, marginBottom:2}}>{s.emoji}</div>
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!overlay.audioOnly && (
                  <div>
                    <div style={{...S.fieldLabel, marginBottom:6}}>💄 Beauty Mode (face smoothing + brightening)</div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:5}}>
                      {[
                        {id:'off',     label:'Off',    emoji:'⚪'},
                        {id:'soft',    label:'Soft',   emoji:'🌸'},
                        {id:'glow',    label:'Glow',   emoji:'✨'},
                        {id:'studio',  label:'Studio', emoji:'💎'},
                        {id:'matte',   label:'Matte',  emoji:'🎭'},
                      ].map(b => (
                        <button key={b.id}
                          onClick={()=>setOverlay(o=>({...o, beauty:b.id}))}
                          style={{
                            ...S.chip,
                            ...(overlay.beauty===b.id ? S.chipActive : {}),
                            padding:'7px 4px', textAlign:'center', fontSize:11,
                          }}>
                          <div style={{fontSize:13}}>{b.emoji}</div>
                          {b.label}
                        </button>
                      ))}
                    </div>
                    <div style={{fontSize:10.5, color:'#64748b', marginTop:7, lineHeight:1.5}}>
                      Soft & Glow add subtle smoothing + brightness. Studio = polished. Matte = cinematic.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={S.card}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={S.cardLabel}>6 · Fields</div>
              {tpl.cat === 'Real Estate' && (
                <button
                  onClick={()=>setFubPickerOpen(true)}
                  style={{
                    background:'rgba(26,90,160,.15)', border:'1px solid rgba(26,90,160,.4)',
                    color:'#7eb8f7', borderRadius:6, padding:'3px 10px',
                    fontSize:10.5, fontWeight:700, cursor:'pointer',
                  }}>
                  📇 Pull from FUB ({fubLeads?.length || 0})
                </button>
              )}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {tpl.fields.map(f => {
                const isLongText = ['tagline','tip','why','quote','message','event','tag'].includes(f.key);
                return (
                  <div key={f.key} style={{display:'flex',flexDirection:'column',gap:4}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <span style={S.fieldLabel}>{f.label}</span>
                      {isLongText && (
                        <div style={{display:'flex',gap:4}}>
                          <button
                            disabled={aiBusy}
                            onClick={async () => {
                              setAiBusy(true);
                              try {
                                const ctx = Object.entries(fields).filter(([_,v])=>v).map(([k,v])=>`${k}: ${v}`).join(' · ');
                                const prompt = `You're an expert real estate / content marketer. Generate ONE short, punchy ${f.label.toLowerCase()} for a ${tpl.name} video. Context: ${ctx || '(none yet — be creative)'}. Constraints: max 12 words, no quotation marks, no hashtags, no emojis, no preamble. Just the line.`;
                                const out = await callClaudeLocal(prompt, 'You write tight, on-brand social copy for real estate agents and personal brands.', 80);
                                setFields(prev => ({ ...prev, [f.key]: out.trim().replace(/^["']|["']$/g, '') }));
                                toast?.success?.('Caption generated');
                              } catch (e) {
                                toast?.error?.(`AI failed: ${e.message}`);
                              }
                              setAiBusy(false);
                            }}
                            style={{
                              background:'rgba(168,85,247,.12)', border:'1px solid rgba(168,85,247,.3)',
                              color:'#d8b4fe', borderRadius:6, padding:'2px 8px',
                              fontSize:10, fontWeight:700, cursor: aiBusy ? 'wait' : 'pointer',
                            }}>
                            {aiBusy ? '…' : '✨ AI'}
                          </button>
                          <button
                            disabled={aiBusy || !fields[f.key]}
                            title="Rewrite my text to hit harder"
                            onClick={async () => {
                              if (!fields[f.key]) return;
                              setAiBusy(true);
                              try {
                                const prompt = `Rewrite this ${f.label.toLowerCase()} to be MORE scroll-stopping, punchier, more emotionally compelling — but same length-ish (max 12 words). No emojis, no hashtags, no quotes, no preamble. Just the stronger line.\n\nOriginal: ${fields[f.key]}`;
                                const out = await callClaudeLocal(prompt, 'You sharpen weak real-estate social copy until it stops the scroll.', 80);
                                setFields(prev => ({ ...prev, [f.key]: out.trim().replace(/^["']|["']$/g, '') }));
                                toast?.success?.('Stronger version applied');
                              } catch (e) {
                                toast?.error?.(`AI failed: ${e.message}`);
                              }
                              setAiBusy(false);
                            }}
                            style={{
                              background:'rgba(251,191,36,.12)', border:'1px solid rgba(251,191,36,.3)',
                              color:'#fde68a', borderRadius:6, padding:'2px 8px',
                              fontSize:10, fontWeight:700,
                              cursor: aiBusy || !fields[f.key] ? 'not-allowed' : 'pointer',
                              opacity: !fields[f.key] ? 0.4 : 1,
                            }}>
                            {aiBusy ? '…' : '⚡ Stronger'}
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      value={fields[f.key] || ''}
                      placeholder={f.placeholder || ''}
                      onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                      style={S.input}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <details style={S.card} open={!!cta.enabled}>
            <summary style={{...S.cardLabel, cursor:'pointer', listStyle:'none', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <span>🏷️ Call-to-Action Sticker (optional) ▾</span>
              <label onClick={e=>e.stopPropagation()} style={{display:'flex',alignItems:'center',gap:6,fontSize:11}}>
                <input type="checkbox"
                  checked={!!cta.enabled}
                  onChange={e=>setCta(c=>({...c, enabled:e.target.checked}))}/>
                <span style={{color:'#cbd5e1'}}>{cta.enabled ? 'On' : 'Off'}</span>
              </label>
            </summary>
            {cta.enabled && (
              <div style={{marginTop:12, display:'flex', flexDirection:'column', gap:12}}>
                <div>
                  <div style={S.fieldLabel}>Text</div>
                  <div style={{display:'flex',gap:5,marginTop:4,marginBottom:6,flexWrap:'wrap'}}>
                    {['DM ME 📩','LINK IN BIO','CALL ME 📞','SAVE THIS','COMMENT BELOW','FOLLOW FOR MORE','MUST SEE 👀','TOUR TODAY'].map(p => (
                      <button key={p}
                        onClick={()=>setCta(c=>({...c, text:p}))}
                        style={{...S.chip, padding:'4px 9px', fontSize:11}}>
                        {p}
                      </button>
                    ))}
                  </div>
                  <input type="text"
                    value={cta.text || ''}
                    onChange={e=>setCta(c=>({...c, text:e.target.value}))}
                    placeholder="Custom text…"
                    style={S.input}/>
                </div>

                <div>
                  <div style={S.fieldLabel}>Position</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:5,marginTop:4}}>
                    {[
                      {id:'top-left',     label:'↖ TL'},
                      {id:'top-right',    label:'↗ TR'},
                      {id:'center',       label:'⊙ Mid'},
                      {id:'bottom-left',  label:'↙ BL'},
                      {id:'bottom-right', label:'↘ BR'},
                    ].map(p => (
                      <button key={p.id}
                        onClick={()=>setCta(c=>({...c, position:p.id}))}
                        style={{
                          ...S.chip,
                          ...(cta.position===p.id ? S.chipActive : {}),
                          padding:'6px 4px', textAlign:'center', fontSize:11,
                        }}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={S.fieldLabel}>Timing</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:5,marginTop:4}}>
                    {[
                      {id:'continuous', label:'Always on', emoji:'🔵'},
                      {id:'pulse',      label:'Pulse',     emoji:'💓'},
                      {id:'last',       label:'Final 2s',  emoji:'🏁'},
                    ].map(t => (
                      <button key={t.id}
                        onClick={()=>setCta(c=>({...c, timing:t.id}))}
                        style={{
                          ...S.chip,
                          ...(cta.timing===t.id ? S.chipActive : {}),
                          padding:'7px 4px', textAlign:'center', fontSize:11,
                        }}>
                        <div style={{fontSize:13, marginBottom:1}}>{t.emoji}</div>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div style={{fontSize:10.5, color:'#64748b', marginTop:6, lineHeight:1.4}}>
                    {cta.timing === 'continuous' && 'Sticker visible the entire video — best for "LINK IN BIO".'}
                    {cta.timing === 'pulse'      && 'Sticker fades in and out every 2.5s — best for "DM ME".'}
                    {cta.timing === 'last'       && 'Sticker appears only in the last 2 seconds — best for closing CTAs like "TOUR TODAY".'}
                  </div>
                </div>
              </div>
            )}
          </details>

          <div style={S.card}>
            <div style={S.cardLabel}>7 · Music (optional)</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:6,marginBottom:10}}>
              {FREE_MUSIC.map(m => {
                const active = music?.id === m.id;
                return (
                  <button key={m.id}
                    onClick={() => setMusic({ ...m, volume: music?.volume ?? 0.7 })}
                    style={{
                      ...S.tplBtn,
                      ...(active ? S.tplBtnActive('#a855f7') : {}),
                      padding:'9px 11px',
                    }}>
                    <span style={{fontSize:16}}>{m.emoji}</span>
                    <div style={{flex:1,minWidth:0,textAlign:'left'}}>
                      <div style={{fontSize:12, fontWeight:700}}>{m.name}</div>
                      <div style={{fontSize:10, color:'#64748b'}}>{m.mood}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <input
              ref={musicRef}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.aac"
              style={{display:'none'}}
              onChange={(e)=>{
                const f = e.target.files?.[0];
                if (!f) return;
                e.target.value = '';
                const url = URL.createObjectURL(f);
                setMusic({ id:'custom', name:f.name, mood:'Custom', emoji:'🎵', url, volume: music?.volume ?? 0.7, custom:true });
              }}
            />
            <button onClick={()=>musicRef.current?.click()}
              style={{...S.chip, width:'100%', textAlign:'center', padding:'8px'}}>
              ⬆ Upload your own track
            </button>

            {music && (
              <div style={{marginTop:12,display:'flex',flexDirection:'column',gap:8}}>
                <div style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#cbd5e1'}}>
                  <span style={{fontSize:16}}>{music.emoji}</span>
                  <span style={{flex:1}}><strong>{music.name}</strong> · {music.mood}</span>
                  <button onClick={()=>setMusic(null)}
                    style={{...S.chip, padding:'3px 9px', fontSize:11}}>Remove</button>
                </div>
                <audio src={music.url} controls style={{width:'100%', height:32}}/>
                <div style={{...S.fieldLabel}}>Volume {Math.round((music.volume??0.7)*100)}% {overlay && ' (auto-ducked under voice)'}</div>
                <input type="range" min={0} max={1.2} step={0.05}
                  value={music.volume ?? 0.7}
                  onChange={e=>setMusic(m=>({...m, volume:parseFloat(e.target.value)}))}
                  style={{width:'100%'}}/>
              </div>
            )}
          </div>

          <details style={S.card} open>
            <summary style={{...S.cardLabel, cursor:'pointer', listStyle:'none'}}>8 · Brand Kit (logo, colors, contact) ▾</summary>
            <div style={{display:'flex',flexDirection:'column',gap:12, marginTop:12}}>

              {/* Logo */}
              <div>
                <div style={S.fieldLabel}>Logo (PNG with transparent background works best)</div>
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  style={{display:'none'}}
                  onChange={(e)=>{
                    const f = e.target.files?.[0];
                    if (!f) return;
                    e.target.value = '';
                    const reader = new FileReader();
                    reader.onload = () => setBrand(b => ({ ...b, logoUrl: reader.result }));
                    reader.readAsDataURL(f);
                  }}
                />
                <div style={{display:'flex',gap:8,alignItems:'center',marginTop:5}}>
                  {brand.logoUrl ? (
                    <>
                      <div style={{
                        width:80, height:80, borderRadius:8, background:'rgba(255,255,255,.06)',
                        display:'flex',alignItems:'center',justifyContent:'center',padding:8,
                        border:'1px solid rgba(255,255,255,.08)',
                      }}>
                        <img src={brand.logoUrl} alt="logo" style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain'}}/>
                      </div>
                      <button onClick={()=>logoRef.current?.click()} style={{...S.chip, fontSize:11}}>Replace</button>
                      <button onClick={()=>setBrand(b=>({...b, logoUrl:''}))}
                        style={{...S.chip, fontSize:11, color:'#ef4444'}}>Remove</button>
                    </>
                  ) : (
                    <button onClick={()=>logoRef.current?.click()}
                      style={{...S.chip, width:'100%', textAlign:'center', padding:'10px'}}>
                      ⬆ Upload logo
                    </button>
                  )}
                </div>
              </div>

              {/* Brand colors */}
              <div>
                <div style={S.fieldLabel}>Brand colors</div>
                <div style={{display:'flex',gap:10,alignItems:'center',marginTop:4}}>
                  <label style={{display:'flex',flexDirection:'column',gap:4,flex:1}}>
                    <span style={{fontSize:10.5,color:'#94a3b8'}}>Primary (backgrounds)</span>
                    <div style={{display:'flex',gap:6,alignItems:'center'}}>
                      <input type="color"
                        value={brand.primaryColor || '#1a5aa0'}
                        onChange={e=>setBrand(b=>({...b, primaryColor:e.target.value}))}
                        style={{width:40,height:32,border:'none',background:'transparent',cursor:'pointer'}}/>
                      <input type="text"
                        value={brand.primaryColor || ''}
                        onChange={e=>setBrand(b=>({...b, primaryColor:e.target.value}))}
                        style={{...S.input, flex:1, fontFamily:'monospace'}}/>
                    </div>
                  </label>
                  <label style={{display:'flex',flexDirection:'column',gap:4,flex:1}}>
                    <span style={{fontSize:10.5,color:'#94a3b8'}}>Accent (highlights)</span>
                    <div style={{display:'flex',gap:6,alignItems:'center'}}>
                      <input type="color"
                        value={brand.accentColor || '#d4a017'}
                        onChange={e=>setBrand(b=>({...b, accentColor:e.target.value}))}
                        style={{width:40,height:32,border:'none',background:'transparent',cursor:'pointer'}}/>
                      <input type="text"
                        value={brand.accentColor || ''}
                        onChange={e=>setBrand(b=>({...b, accentColor:e.target.value}))}
                        style={{...S.input, flex:1, fontFamily:'monospace'}}/>
                    </div>
                  </label>
                </div>
                <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#cbd5e1',marginTop:8,cursor:'pointer'}}>
                  <input type="checkbox"
                    checked={!!brand.useBrandColors}
                    onChange={e=>setBrand(b=>({...b, useBrandColors:e.target.checked}))}/>
                  Override template colors with my brand colors
                </label>
              </div>

              {/* Logo Splash */}
              <div>
                <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12.5,color:'#f1f5f9',cursor:'pointer',fontWeight:700}}>
                  <input type="checkbox"
                    checked={!!brand.splash}
                    onChange={e=>setBrand(b=>({...b, splash:e.target.checked}))}/>
                  ✨ Logo Splash — animated logo card before the hook
                </label>
                {brand.splash && (
                  <div style={{marginTop:8}}>
                    <div style={{fontSize:10.5,color:'#94a3b8',marginBottom:4}}>Duration · {(brand.splashDur ?? 0.7).toFixed(1)}s</div>
                    <input type="range" min={0.3} max={1.5} step={0.1}
                      value={brand.splashDur ?? 0.7}
                      onChange={e=>setBrand(b=>({...b, splashDur:parseFloat(e.target.value)}))}
                      style={{width:'100%'}}/>
                    {!brand.logoUrl && (
                      <div style={{fontSize:10.5,color:'#f59e0b',marginTop:6}}>
                        No logo uploaded — splash will show your brand name in big text instead.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Watermark */}
              <div>
                <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12.5,color:'#f1f5f9',cursor:'pointer',fontWeight:700}}>
                  <input type="checkbox"
                    checked={!!brand.watermark}
                    onChange={e=>setBrand(b=>({...b, watermark:e.target.checked}))}/>
                  💧 Watermark — show logo in a corner of every scene
                </label>
                {brand.watermark && (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:5,marginTop:8}}>
                    {[
                      {id:'top-left',label:'↖'},{id:'top-right',label:'↗'},
                      {id:'bottom-left',label:'↙'},{id:'bottom-right',label:'↘'},
                    ].map(p => (
                      <button key={p.id}
                        onClick={()=>setBrand(b=>({...b, watermarkPos:p.id}))}
                        style={{
                          ...S.chip,
                          ...((brand.watermarkPos||'bottom-right')===p.id ? S.chipActive : {}),
                          padding:'8px', textAlign:'center', fontSize:14,
                        }}>{p.label}</button>
                    ))}
                  </div>
                )}
                {brand.watermark && !brand.logoUrl && (
                  <div style={{fontSize:10.5,color:'#f59e0b',marginTop:6}}>
                    ⚠ Upload a logo above first.
                  </div>
                )}
              </div>

              {/* Contact info */}
              <div>
                <div style={S.fieldLabel}>Contact info (shown on the outro card)</div>
                <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#cbd5e1',marginBottom:8,marginTop:4,cursor:'pointer'}}>
                  <input type="checkbox" checked={!!brand.show} onChange={e => setBrand(b => ({ ...b, show: e.target.checked }))}/>
                  Show outro card at end of video
                </label>
                {['name','tagline','phone','email','website'].map(k => (
                  <input key={k}
                    type="text"
                    placeholder={k.charAt(0).toUpperCase() + k.slice(1)}
                    value={brand[k] || ''}
                    onChange={e => setBrand(b => ({ ...b, [k]: e.target.value }))}
                    style={{...S.input, marginBottom:6}}
                  />
                ))}
              </div>
            </div>
          </details>
        </div>

        {/* RIGHT: clips + generate + output */}
        <div style={S.col}>
          <div style={S.card}>
            <div style={S.cardLabel}>9 · Clips ({clips.length}/{tpl.maxClips}, min {tpl.minClips})</div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,video/*"
              style={{display:'none'}}
              onChange={e => { handleFiles(e.target.files); e.target.value=''; }}
            />
            <div
              style={S.dropzone}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.background='rgba(26,90,160,.08)'; }}
              onDragLeave={e => { e.currentTarget.style.background='transparent'; }}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.style.background='transparent';
                handleFiles(e.dataTransfer.files);
              }}
              onClick={() => fileRef.current?.click()}
            >
              <div style={{fontSize:32, opacity:.5}}>⬆</div>
              <div style={{fontSize:13, color:'#94a3b8'}}>Drop photos & videos here</div>
              <div style={{fontSize:11, color:'#475569'}}>or click to browse</div>
              <div style={{fontSize:10.5, color:'#64748b', marginTop:8, lineHeight:1.5, maxWidth:280, textAlign:'center'}}>
                📱 iPhone HEIC / HEVC files auto-convert on upload.<br/>
                <span style={{color:'#475569'}}>(First video transcode loads FFmpeg ~30 MB · one-time)</span>
              </div>
            </div>

            {clips.length > 0 && (
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginTop:12}}>
                {clips.map((c, i) => {
                  const hasEdits = !!(c.customCaption || c.durationOverride || c.filterOverride || c.stickerEmoji);
                  const isFocused = focusedClipId === c.id;
                  return (
                  <div key={c.id} style={{
                    ...S.thumb,
                    border: c.status === 'failed' ? '1px solid #ef4444' :
                             c.status === 'converting' ? '1px solid #f59e0b' :
                             isFocused ? '2px solid #7eb8f7' :
                             hasEdits ? '1px solid #a855f7' : S.thumb.border,
                    boxShadow: isFocused ? '0 0 14px rgba(126,184,247,.4)' : 'none',
                    transition: 'all .15s',
                  }}
                  onClick={() => {
                    if (c.status !== 'ready' && c.status) return;
                    // Toggle focus on this clip — preview canvas will show this scene
                    setFocusedClipId(prev => prev === c.id ? null : c.id);
                  }}
                  >
                    {c.kind === 'video'
                      ? <video src={c.url} style={S.thumbImg} muted playsInline preload="metadata"/>
                      : <img src={c.url} alt="" style={S.thumbImg}/>}
                    <div style={S.thumbBadge}>{i + 1}</div>
                    {hasEdits && (
                      <div style={{
                        position:'absolute', top:4, right:4,
                        background:'rgba(168,85,247,.85)', color:'#fff',
                        fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:5,
                      }}>✎</div>
                    )}
                    {c.status === 'converting' && (
                      <div style={S.thumbOverlay}>
                        <div style={{fontSize:10, fontWeight:700, color:'#fbbf24'}}>
                          {c.progress > 0 ? `${Math.round(c.progress*100)}%` : '…'}
                        </div>
                        <div style={{fontSize:8.5, color:'#fde68a', marginTop:2, textAlign:'center', padding:'0 4px'}}>
                          Converting iPhone format
                        </div>
                      </div>
                    )}
                    {c.status === 'failed' && (
                      <div style={{...S.thumbOverlay, background:'rgba(127,29,29,.85)'}}>
                        <div style={{fontSize:10, color:'#fecaca'}}>Failed</div>
                      </div>
                    )}
                    <div style={S.thumbActions} onClick={e=>e.stopPropagation()}>
                      <button onClick={() => moveClip(c.id, -1)} disabled={i===0} style={S.thumbBtn}>◀</button>
                      <button onClick={() => moveClip(c.id, +1)} disabled={i===clips.length-1} style={S.thumbBtn}>▶</button>
                      <button onClick={() => setEditingClipId(c.id)} style={{...S.thumbBtn, color:'#d8b4fe'}}>✎</button>
                      <button onClick={() => removeClip(c.id)} style={{...S.thumbBtn, color:'#ef4444'}}>✕</button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          <PreviewThumbnail
            clips={readyClips}
            focusedClipId={focusedClipId}
            fields={fields}
            aspect={aspect}
            filter={filter}
            tpl={tpl}
            brand={brand}
            cta={cta?.enabled ? cta : null}
            overlay={overlay?.status === 'ready' ? overlay : null}
            transition={transition}
            hookStyle={hookStyle}
            hookText={hookText}
          />

          <div style={S.card}>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || rendering || massExporting}
              style={{
                ...S.bigBtn,
                background: canGenerate && !rendering && !massExporting
                  ? `linear-gradient(135deg, ${tpl.accent}, #1a5aa0)`
                  : 'rgba(255,255,255,.07)',
                cursor: canGenerate && !rendering && !massExporting ? 'pointer' : 'not-allowed',
                opacity: canGenerate && !rendering && !massExporting ? 1 : 0.6,
              }}
            >
              {rendering
                ? (log.toLowerCase().includes('finaliz')
                    ? 'Finalizing video…'
                    : `Rendering… ${Math.round(progress*100)}%`)
                : massExporting
                  ? `Mass-rendering 3 aspects… ${Math.round(progress*100)}%`
                  : reasonDisabled
                    ? `⬆ ${reasonDisabled}`
                    : `✨ Generate ${tpl.name}`}
            </button>

            <button
              onClick={handleMassExport}
              disabled={!canGenerate || rendering || massExporting}
              style={{
                ...S.btnGhost,
                width:'100%', marginTop:8, padding:'12px',
                background: !canGenerate || rendering || massExporting
                  ? 'rgba(255,255,255,.04)'
                  : 'rgba(168,85,247,.12)',
                border: '1px solid rgba(168,85,247,.35)',
                color: '#d8b4fe',
                fontSize: 13, fontWeight: 700,
                cursor: !canGenerate || rendering || massExporting ? 'not-allowed' : 'pointer',
                opacity: !canGenerate || rendering || massExporting ? 0.5 : 1,
              }}
            >
              🎬 Export all 3 aspects (Reel · Post · YouTube)
            </button>

            {(rendering || massExporting) && (
              <div style={S.progressOuter}>
                <div style={{...S.progressInner, width: `${progress*100}%`, background: tpl.accent}}/>
              </div>
            )}
            {log && <div style={S.log}>{log}</div>}
          </div>

          {scriptModal && (
            <div style={S.modalBackdrop} onClick={()=>setScriptModal(null)}>
              <div style={{...S.modal, maxWidth:560}} onClick={e=>e.stopPropagation()}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                  <div style={{fontWeight:800,fontSize:16,color:'#f8fafc'}}>✨ Your Voiceover Script</div>
                  <button onClick={()=>setScriptModal(null)} style={S.btnGhost}>✕ Close</button>
                </div>

                {scriptModal.busy ? (
                  <div style={{padding:'40px 20px', textAlign:'center', color:'#94a3b8'}}>
                    <div style={{fontSize:32, marginBottom:12}}>✨</div>
                    <div style={{fontSize:13}}>Claude is writing your script…</div>
                  </div>
                ) : scriptModal.text ? (
                  <>
                    <div style={{
                      background:'rgba(0,0,0,.4)', border:'1px solid rgba(168,85,247,.25)',
                      borderRadius:10, padding:'18px 20px',
                      fontSize:16, lineHeight:1.65, color:'#f1f5f9',
                      fontFamily:'Georgia, "DM Serif Display", serif',
                      whiteSpace:'pre-wrap',
                    }}>
                      {scriptModal.text}
                    </div>
                    <div style={{
                      fontSize:11, color:'#64748b', marginTop:10, lineHeight:1.5,
                      display:'flex', justifyContent:'space-between',
                    }}>
                      <span>~{scriptModal.text.split(/\s+/).length} words · ~{Math.round(scriptModal.text.split(/\s+/).length / 2.5)}s spoken</span>
                      <button onClick={()=>{
                        navigator.clipboard?.writeText(scriptModal.text);
                        toast?.success?.('Script copied');
                      }} style={{...S.chip, fontSize:11}}>📋 Copy</button>
                    </div>

                    <div style={{display:'flex', gap:8, marginTop:16}}>
                      <button onClick={generateVoiceoverScript}
                        style={{...S.btnGhost, flex:1}}>
                        🔄 Regenerate
                      </button>
                      <button onClick={() => {
                        setScriptModal(null);
                        startWebcamRecording(true);
                      }}
                        style={{
                          flex:2, padding:'10px',
                          background:'linear-gradient(135deg, #a855f7, #7c3aed)',
                          color:'#fff', border:'none', borderRadius:9,
                          fontSize:13, fontWeight:800, cursor:'pointer',
                        }}>
                        🎙️ Start Recording (read this aloud)
                      </button>
                    </div>
                    <div style={{fontSize:10.5, color:'#475569', marginTop:8, lineHeight:1.4, textAlign:'center'}}>
                      Tip: keep this window open while you record — read the script naturally, like you're talking to a friend.
                    </div>
                  </>
                ) : scriptModal.error ? (
                  <div style={{color:'#ef4444', fontSize:13, padding:'20px'}}>
                    Failed: {scriptModal.error}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {fubPickerOpen && (() => {
            const stages = Array.from(new Set((fubLeads || []).map(l => l.status).filter(Boolean)));
            const filtered = (fubLeads || []).filter(l => {
              if (fubFilter !== 'all' && l.status !== fubFilter) return false;
              if (fubSearch) {
                const q = fubSearch.toLowerCase();
                return (l.name||'').toLowerCase().includes(q)
                    || (l.address||'').toLowerCase().includes(q)
                    || (l.area||'').toLowerCase().includes(q);
              }
              return true;
            });
            const applyLead = (lead) => {
              const extracted = extractFieldsFromLead(lead);
              setFields(prev => ({
                ...prev,
                ...Object.fromEntries(Object.entries(extracted).filter(([_, v]) => v)),
              }));
              setFubPickerOpen(false);
              toast?.success?.(`Filled fields from ${lead.name}`);
            };
            const toggleSelected = (id) => setFubSelected(s => ({ ...s, [id]: !s[id] }));
            const selectedCount = Object.values(fubSelected).filter(Boolean).length;
            return (
              <div style={S.modalBackdrop} onClick={()=>setFubPickerOpen(false)}>
                <div style={S.modal} onClick={e=>e.stopPropagation()}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                    <div style={{fontWeight:800,fontSize:16,color:'#f8fafc'}}>📇 Pull from Follow Up Boss</div>
                    <div style={{display:'flex', gap:6}}>
                      <button
                        onClick={()=>{ setFubMultiSelect(m => !m); setFubSelected({}); }}
                        style={{
                          ...S.chip,
                          ...(fubMultiSelect ? S.chipActive : {}),
                          fontSize:11, padding:'5px 10px',
                        }}>
                        {fubMultiSelect ? '✓ Multi-Select' : '☐ Multi-Select'}
                      </button>
                      <button onClick={()=>setFubPickerOpen(false)} style={S.btnGhost}>✕ Close</button>
                    </div>
                  </div>

                  {(!fubLeads || fubLeads.length === 0) ? (
                    <div style={{padding:'40px 20px', textAlign:'center'}}>
                      <div style={{fontSize:32,opacity:.4,marginBottom:12}}>📭</div>
                      <div style={{fontSize:14,color:'#cbd5e1',marginBottom:6}}>No FUB contacts cached yet.</div>
                      <div style={{fontSize:12,color:'#64748b',marginBottom:16}}>
                        Go to <strong>Lead Tracker</strong> and hit <strong>Sync FUB</strong>, then come back.
                      </div>
                      <button onClick={()=>{ setFubPickerOpen(false); setPage?.('leads'); }} style={S.btnPrimary}>
                        Go to Lead Tracker →
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
                        <input
                          type="text"
                          placeholder="Search name / address / area…"
                          value={fubSearch}
                          onChange={e=>setFubSearch(e.target.value)}
                          style={{...S.input, flex:'1 1 220px'}}/>
                        <select
                          value={fubFilter}
                          onChange={e=>setFubFilter(e.target.value)}
                          style={{...S.input, width:'auto', minWidth:160}}>
                          <option value="all">All stages ({fubLeads.length})</option>
                          {stages.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      <div style={{maxHeight:'52vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:6}}>
                        {filtered.length === 0 ? (
                          <div style={{fontSize:12, color:'#64748b', padding:20, textAlign:'center'}}>No matches</div>
                        ) : filtered.map(lead => {
                          const id = lead.id || lead.fubId;
                          const checked = !!fubSelected[id];
                          return (
                            <button key={id}
                              onClick={()=> fubMultiSelect ? toggleSelected(id) : applyLead(lead) }
                              style={{
                                display:'flex', alignItems:'center', gap:12,
                                padding:'10px 12px', borderRadius:8,
                                background: checked ? 'rgba(168,85,247,.12)' : 'rgba(255,255,255,.03)',
                                border: checked ? '1px solid rgba(168,85,247,.4)' : '1px solid rgba(255,255,255,.06)',
                                cursor:'pointer', textAlign:'left',
                                transition:'all .15s',
                              }}
                              onMouseEnter={e=>{ if(!checked) e.currentTarget.style.background='rgba(26,90,160,.12)'; }}
                              onMouseLeave={e=>{ if(!checked) e.currentTarget.style.background='rgba(255,255,255,.03)'; }}
                            >
                              {fubMultiSelect && (
                                <input type="checkbox" checked={checked} onChange={()=>toggleSelected(id)} onClick={e=>e.stopPropagation()}
                                  style={{width:16,height:16,accentColor:'#a855f7'}}/>
                              )}
                              <div style={{
                                width:36, height:36, borderRadius:'50%',
                                background:'linear-gradient(135deg,#1a5aa0,#d4a017)',
                                display:'flex', alignItems:'center', justifyContent:'center',
                                fontSize:13, fontWeight:800, color:'#fff', flexShrink:0,
                              }}>{(lead.name || '?').charAt(0).toUpperCase()}</div>
                              <div style={{flex:1, minWidth:0}}>
                                <div style={{fontSize:13, fontWeight:700, color:'#f1f5f9', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                                  {lead.name || 'Unnamed'}
                                </div>
                                <div style={{fontSize:11, color:'#94a3b8', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                                  {[lead.address, lead.area].filter(Boolean).join(' · ') || lead.email || lead.phone || 'No address on file'}
                                </div>
                              </div>
                              {lead.status && (
                                <span style={{
                                  fontSize:10, fontWeight:700,
                                  padding:'3px 8px', borderRadius:5,
                                  background: lead.status === 'Past Client' ? 'rgba(16,185,129,.15)' :
                                              lead.status === 'Hot Prospect' ? 'rgba(239,68,68,.15)' :
                                              'rgba(255,255,255,.08)',
                                  color: lead.status === 'Past Client' ? '#6ee7b7' :
                                         lead.status === 'Hot Prospect' ? '#fca5a5' : '#cbd5e1',
                                  whiteSpace:'nowrap',
                                }}>{lead.status}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {fubMultiSelect ? (
                        <div style={{
                          marginTop:14, padding:'12px 14px', borderRadius:10,
                          background:'rgba(168,85,247,.10)', border:'1px solid rgba(168,85,247,.35)',
                          display:'flex', gap:10, alignItems:'center', flexWrap:'wrap',
                        }}>
                          <div style={{flex:1, minWidth:160}}>
                            <div style={{fontSize:13, fontWeight:700, color:'#f1f5f9'}}>
                              {selectedCount} contact{selectedCount===1?'':'s'} selected
                            </div>
                            <div style={{fontSize:11, color:'#94a3b8', marginTop:2, lineHeight:1.4}}>
                              Same template + photos + brand. Each render auto-downloads with the contact's data.
                            </div>
                          </div>
                          <button onClick={()=>setFubSelected({})} style={{...S.chip, padding:'6px 12px'}}>
                            Clear
                          </button>
                          <button onClick={()=>{
                            const all = {};
                            filtered.forEach(l => { all[l.id || l.fubId] = true; });
                            setFubSelected(all);
                          }} style={{...S.chip, padding:'6px 12px'}}>
                            Select all visible ({filtered.length})
                          </button>
                          <button
                            disabled={selectedCount === 0}
                            onClick={handleBatchRender}
                            style={{
                              ...S.btnPrimary,
                              background: selectedCount > 0
                                ? 'linear-gradient(135deg, #a855f7, #6366f1)'
                                : 'rgba(255,255,255,.08)',
                              opacity: selectedCount > 0 ? 1 : 0.5,
                              cursor: selectedCount > 0 ? 'pointer' : 'not-allowed',
                              padding:'8px 14px',
                            }}>
                            🎬 Batch render {selectedCount}
                          </button>
                        </div>
                      ) : (
                        <div style={{fontSize:10.5, color:'#475569', marginTop:12, lineHeight:1.5}}>
                          Tip: MLS-imported contacts have sale price, beds/baths, sqft in notes — those auto-fill too. Try <strong>Multi-Select</strong> ↑ to batch-render reels for many contacts at once.
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {editingClipId && (() => {
            const editing = clips.find(c => c.id === editingClipId);
            if (!editing) return null;
            const editIdx = clips.findIndex(c => c.id === editingClipId);
            const update = (patch) => setClips(prev => prev.map(x => x.id === editingClipId ? { ...x, ...patch } : x));
            return (
              <div style={S.modalBackdrop} onClick={() => setEditingClipId(null)}>
                <div style={S.modal} onClick={e => e.stopPropagation()}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                    <div style={{fontWeight:800,fontSize:16,color:'#f8fafc'}}>Edit Scene {editIdx + 1}</div>
                    <button onClick={()=>setEditingClipId(null)} style={S.btnGhost}>✕ Close</button>
                  </div>

                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                    <div style={{position:'relative',borderRadius:10,overflow:'hidden',background:'#000',aspectRatio:'9/16'}}>
                      {editing.kind === 'video'
                        ? <video src={editing.url} controls muted playsInline preload="metadata"
                            style={{width:'100%',height:'100%',objectFit:'cover',
                                    filter: getFilterCss(editing, editing.filterOverride || filter)}}/>
                        : <img src={editing.url} alt=""
                            style={{width:'100%',height:'100%',objectFit:'cover',
                                    filter: getFilterCss(editing, editing.filterOverride || filter)}}/>}
                    </div>

                    <div style={{display:'flex',flexDirection:'column',gap:14}}>
                      <div>
                        <div style={S.fieldLabel}>Custom caption (overrides rotating field)</div>
                        <input type="text"
                          placeholder="Leave empty to use template default"
                          value={editing.customCaption || ''}
                          onChange={e=>update({ customCaption: e.target.value })}
                          style={S.input}/>
                      </div>

                      <div>
                        <div style={S.fieldLabel}>Scene duration {editing.durationOverride ? `${editing.durationOverride.toFixed(1)}s` : `(default ${tpl.sceneSeconds}s)`}</div>
                        <input type="range" min={1} max={6} step={0.1}
                          value={editing.durationOverride || tpl.sceneSeconds}
                          onChange={e=>update({ durationOverride: parseFloat(e.target.value) })}
                          style={{width:'100%'}}/>
                        {editing.durationOverride && (
                          <button onClick={()=>update({ durationOverride: null })}
                            style={{...S.chip, marginTop:6, padding:'4px 10px', fontSize:11}}>
                            Reset to default
                          </button>
                        )}
                      </div>

                      <div>
                        <div style={S.fieldLabel}>Filter override (or leave on global)</div>
                        <select
                          value={editing.filterOverride || ''}
                          onChange={e=>update({ filterOverride: e.target.value || null })}
                          style={S.input}>
                          <option value="">Use global: {FILTERS_BY_ID[filter]?.name}</option>
                          {FILTERS.map(f => (
                            <option key={f.id} value={f.id}>{f.emoji} {f.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div style={S.fieldLabel}>Animated emoji sticker</div>
                        <div style={{display:'flex',gap:5,flexWrap:'wrap',marginTop:5,marginBottom:6}}>
                          {['🔥','🏠','⭐','❤️','💰','✨','🎉','📈','🏆','💎','👀','🌟','💯','🚀','🎯'].map(e => (
                            <button key={e}
                              onClick={()=>update({ stickerEmoji: editing.stickerEmoji === e ? '' : e })}
                              style={{
                                background: editing.stickerEmoji === e ? 'rgba(168,85,247,.25)' : 'rgba(255,255,255,.04)',
                                border: editing.stickerEmoji === e ? '1px solid rgba(168,85,247,.5)' : '1px solid rgba(255,255,255,.08)',
                                borderRadius:6, padding:'4px 8px', fontSize:18, cursor:'pointer',
                              }}>
                              {e}
                            </button>
                          ))}
                        </div>
                        <input type="text"
                          placeholder="Or paste any emoji"
                          value={editing.stickerEmoji || ''}
                          onChange={e=>update({ stickerEmoji: e.target.value.slice(0, 4) })}
                          style={S.input}/>
                        {editing.stickerEmoji && (
                          <div style={{marginTop:8}}>
                            <div style={{fontSize:10.5, color:'#94a3b8', marginBottom:4}}>Position</div>
                            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:5}}>
                              {[
                                {id:'top-left',label:'↖'},
                                {id:'top-right',label:'↗'},
                                {id:'center',label:'⊙'},
                                {id:'bottom-left',label:'↙'},
                                {id:'bottom-right',label:'↘'},
                              ].map(p => (
                                <button key={p.id}
                                  onClick={()=>update({ stickerPos:p.id })}
                                  style={{
                                    ...S.chip,
                                    ...((editing.stickerPos || 'top-right') === p.id ? S.chipActive : {}),
                                    padding:'6px 4px', textAlign:'center', fontSize:13,
                                  }}>
                                  {p.label}
                                </button>
                              ))}
                            </div>
                            <div style={{fontSize:10.5, color:'#64748b', marginTop:6, lineHeight:1.4}}>
                              Bounces in with the scene, then gently pulses + wobbles. Soft drop shadow for depth.
                            </div>
                          </div>
                        )}
                      </div>

                      <div style={{display:'flex',gap:8,marginTop:6}}>
                        <button
                          onClick={()=>{
                            update({ customCaption:'', durationOverride:null, filterOverride:null, stickerEmoji:'', stickerPos:null });
                            toast?.info?.('Tweaks cleared');
                          }}
                          style={{...S.btnGhost, flex:1}}>
                          Clear tweaks
                        </button>
                        <button onClick={()=>setEditingClipId(null)} style={{...S.btnPrimary, flex:1}}>
                          Done
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {outputUrl && (
            <div style={S.card}>
              <div style={S.cardLabel}>Output · {outputMime.includes('mp4') ? '🎬 MP4' : '🎥 WebM'}</div>
              <video
                ref={previewRef}
                src={outputUrl}
                controls
                playsInline
                style={S.previewVideo(aspect)}
              />
              <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
                <button onClick={downloadOutput} style={S.btnPrimary}>⬇ Download</button>
                {!outputMime.includes('mp4') && (
                  <button
                    disabled={transcoding}
                    onClick={async () => {
                      setTranscoding(true);
                      setLog('Converting WebM → MP4 for Instagram / TikTok…');
                      try {
                        const res = await fetch(outputUrl);
                        const webm = await res.blob();
                        const mp4 = await transcodeWebMtoMP4(webm, {
                          onLog: setLog,
                          onProgress: (p) => setProgress(p),
                        });
                        const mp4Url = URL.createObjectURL(mp4);
                        URL.revokeObjectURL(outputUrl);
                        setOutputUrl(mp4Url);
                        setOutputMime('video/mp4');
                        setLog(`MP4 ready · ${(mp4.size/1024/1024).toFixed(1)} MB`);
                        toast?.success?.('Converted to MP4!');
                      } catch (e) {
                        toast?.error?.(`Transcode failed: ${e.message}`);
                        setLog(`MP4 transcode failed: ${e.message}`);
                      }
                      setTranscoding(false);
                    }}
                    style={{
                      ...S.btnGhost,
                      background:'rgba(168,85,247,.12)',
                      border:'1px solid rgba(168,85,247,.35)',
                      color:'#d8b4fe',
                    }}>
                    {transcoding ? '⏳ Converting…' : '🎬 Convert to MP4'}
                  </button>
                )}
                <button
                  onClick={async () => {
                    if (!previewRef.current) return;
                    const v = previewRef.current;
                    try {
                      const c = document.createElement('canvas');
                      c.width = v.videoWidth;
                      c.height = v.videoHeight;
                      c.getContext('2d').drawImage(v, 0, 0);
                      const dataUrl = c.toDataURL('image/jpeg', 0.92);
                      const a = document.createElement('a');
                      a.href = dataUrl;
                      a.download = `${tpl.id}_poster_${Date.now()}.jpg`;
                      a.click();
                      toast?.success?.('Poster saved');
                    } catch (e) { toast?.error?.(`Couldn't capture frame: ${e.message}`); }
                  }}
                  style={S.btnGhost}>📸 Save poster (current frame)</button>
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch(outputUrl);
                      const blob = await res.blob();
                      const ext = outputMime.includes('mp4') ? 'mp4' : 'webm';
                      const file = new File([blob], `${tpl.id}_${Date.now()}.${ext}`, { type: outputMime });
                      if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({ files: [file], title: tpl.name, text: fields.address || fields.tagline || tpl.name });
                      } else {
                        // Fallback: download + show instructions
                        downloadOutput();
                        toast?.info?.('Saved to Downloads. Open Instagram/TikTok/etc. and pick this file from your gallery.');
                      }
                    } catch (e) { toast?.error?.(`Share failed: ${e.message}`); }
                  }}
                  style={S.btnGhost}>📲 Share</button>
                <button onClick={() => { setOutputUrl(null); setLog(''); }} style={S.btnGhost}>Start over</button>
              </div>
              <div style={{fontSize:11,color:'#64748b',marginTop:8}}>
                {outputMime.includes('mp4')
                  ? 'MP4 / H.264 — works on every platform.'
                  : 'WebM works on YouTube, TikTok, Facebook. Convert to MP4 for Instagram or wider compatibility.'}
              </div>

              {/* Hashtag generator */}
              <div style={{marginTop:16, paddingTop:14, borderTop:'1px solid rgba(255,255,255,.05)'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                  <span style={S.fieldLabel}>📢 Suggested hashtags</span>
                  <button
                    disabled={hashtagsBusy}
                    onClick={generateHashtags}
                    style={{
                      background:'rgba(168,85,247,.12)', border:'1px solid rgba(168,85,247,.3)',
                      color:'#d8b4fe', borderRadius:6, padding:'3px 10px',
                      fontSize:10.5, fontWeight:700, cursor: hashtagsBusy ? 'wait' : 'pointer',
                    }}>
                    {hashtagsBusy ? '…' : '✨ Generate'}
                  </button>
                </div>
                {hashtags ? (
                  <>
                    <div style={{
                      background:'rgba(0,0,0,.35)', borderRadius:8, padding:'10px 12px',
                      fontSize:12, color:'#cbd5e1', lineHeight:1.5, fontFamily:'monospace',
                      maxHeight:120, overflow:'auto', wordBreak:'break-word',
                    }}>{hashtags}</div>
                    <div style={{display:'flex', gap:6, marginTop:6}}>
                      <button onClick={()=>{
                        navigator.clipboard?.writeText(hashtags);
                        toast?.success?.('Hashtags copied');
                      }} style={{...S.chip, flex:1, padding:'6px', textAlign:'center'}}>📋 Copy</button>
                      <button onClick={()=>setHashtags('')}
                        style={{...S.chip, padding:'6px 10px'}}>✕</button>
                    </div>
                  </>
                ) : (
                  <div style={{fontSize:11, color:'#475569', lineHeight:1.5}}>
                    Click ✨ Generate to get 18 AI-tuned hashtags mixing broad reach, niche, and local Michigan tags.
                  </div>
                )}
              </div>
            </div>
          )}

          {recent && recent.length > 0 && (
            <div style={S.card}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                <div style={S.cardLabel}>📚 Recent Renders ({recent.length})</div>
                <button onClick={()=>{ if(window.confirm('Clear all recent renders?')) setRecent([]); }}
                  style={{...S.chip, fontSize:10, padding:'3px 8px'}}>Clear</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8}}>
                {recent.map(r => (
                  <div key={r.id} style={{
                    background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.06)',
                    borderRadius:9, overflow:'hidden', display:'flex', flexDirection:'column',
                  }}>
                    {r.thumb && <img src={r.thumb} alt="" style={{width:'100%',height:120,objectFit:'cover',display:'block'}}/>}
                    <div style={{padding:'8px 10px'}}>
                      <div style={{fontSize:12, fontWeight:700, color:'#f1f5f9', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                        {r.tplName}
                      </div>
                      <div style={{fontSize:10, color:'#64748b', marginTop:2}}>
                        {r.aspect} · {(r.size/1024/1024).toFixed(1)} MB · {new Date(r.ts).toLocaleDateString()}
                      </div>
                      <div style={{display:'flex',gap:4,marginTop:6}}>
                        <button onClick={()=>{
                          const url = URL.createObjectURL(r.blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${r.tplId}_${r.id}.${r.mime.includes('mp4') ? 'mp4' : 'webm'}`;
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }} style={{...S.chip, fontSize:10, padding:'4px 8px', flex:1, textAlign:'center'}}>⬇ Save</button>
                        <button onClick={()=>{
                          const url = URL.createObjectURL(r.blob);
                          // Open in a new tab for preview
                          window.open(url, '_blank');
                        }} style={{...S.chip, fontSize:10, padding:'4px 8px', flex:1, textAlign:'center'}}>▶ View</button>
                        <button onClick={()=>setRecent(p => (p||[]).filter(x => x.id !== r.id))}
                          style={{...S.chip, fontSize:10, padding:'4px 8px', color:'#ef4444'}}>✕</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── INLINE STYLES ────────────────────────────────────────────────────────────
const STYLES = {
  page: { padding: '20px 28px 48px', maxWidth: 1400, margin: '0 auto' },
  header: { display:'flex', alignItems:'center', gap:18, marginBottom:22 },
  backBtn: {
    background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.08)',
    color:'#cbd5e1', padding:'7px 14px', borderRadius:9, cursor:'pointer', fontSize:12.5, fontWeight:600,
  },
  title: { fontFamily:"'DM Serif Display', serif", fontSize:28, color:'#f8fafc', lineHeight:1.1 },
  sub:   { fontSize:13, color:'#64748b', marginTop:2 },
  grid:  { display:'grid', gridTemplateColumns:'minmax(320px, 460px) 1fr', gap:22, alignItems:'flex-start' },
  col:   { display:'flex', flexDirection:'column', gap:16 },
  card:  {
    background:'rgba(8,12,24,.65)', border:'1px solid rgba(255,255,255,.05)',
    borderRadius:14, padding:18, backdropFilter:'blur(12px)',
  },
  cardLabel: {
    fontSize:11, fontWeight:800, color:'#7eb8f7', letterSpacing:1.5,
    textTransform:'uppercase', marginBottom:12,
  },
  catLabel: {
    fontSize:10, fontWeight:800, color:'#475569', letterSpacing:1.5,
    textTransform:'uppercase', marginBottom:5, paddingLeft:2,
  },
  tplBtn: {
    display:'flex', alignItems:'center', gap:8,
    padding:'10px 12px', borderRadius:10, border:'1px solid rgba(255,255,255,.06)',
    background:'rgba(255,255,255,.03)', color:'#cbd5e1', cursor:'pointer', textAlign:'left',
    transition:'all .15s',
  },
  tplBtnActive: (accent) => ({
    background: `linear-gradient(135deg, ${accent}22, ${accent}08)`,
    border:`1px solid ${accent}55`,
    color:'#fff',
    boxShadow:`inset 0 0 20px ${accent}11`,
  }),
  chip: {
    padding:'7px 12px', borderRadius:9, border:'1px solid rgba(255,255,255,.06)',
    background:'rgba(255,255,255,.03)', color:'#94a3b8', cursor:'pointer', fontSize:12,
  },
  filterTile: {
    position:'relative', display:'flex', flexDirection:'column',
    padding:0, borderRadius:8, overflow:'hidden',
    border:'1px solid rgba(255,255,255,.06)',
    background:'rgba(255,255,255,.03)', cursor:'pointer', transition:'all .15s',
    aspectRatio:'1/1.18',
  },
  filterTileActive: {
    border:'2px solid #7eb8f7',
    boxShadow:'0 0 18px rgba(126,184,247,.35)',
    transform:'scale(1.02)',
  },
  filterTileImg: {
    flex:1, width:'100%',
    backgroundSize:'cover', backgroundPosition:'center',
    transition:'filter .2s',
  },
  filterTileLabel: {
    display:'flex', alignItems:'center', justifyContent:'center', gap:4,
    padding:'4px 4px 5px', background:'rgba(5,8,16,.85)', color:'#cbd5e1',
  },
  chipActive: {
    background:'linear-gradient(135deg,#1a5aa0,#2d7dd2)', color:'#fff',
    border:'1px solid rgba(126,184,247,.4)',
  },
  fieldLabel: { fontSize:11, fontWeight:700, color:'#7eb8f7', letterSpacing:.5, textTransform:'uppercase' },
  input: {
    width:'100%', padding:'9px 11px', borderRadius:8,
    background:'rgba(0,0,0,.35)', color:'#f1f5f9', fontSize:13,
    border:'1px solid rgba(255,255,255,.07)', outline:'none',
  },
  dropzone: {
    border:'2px dashed rgba(26,90,160,.3)', borderRadius:12, padding:'24px 16px',
    textAlign:'center', cursor:'pointer', display:'flex', flexDirection:'column',
    alignItems:'center', gap:6, transition:'background .15s',
  },
  thumb: {
    position:'relative', borderRadius:8, overflow:'hidden', aspectRatio:'1/1',
    background:'#000', border:'1px solid rgba(255,255,255,.05)',
  },
  thumbImg: { width:'100%', height:'100%', objectFit:'cover', display:'block' },
  thumbBadge: {
    position:'absolute', top:4, left:4, background:'rgba(0,0,0,.7)',
    color:'#fff', fontSize:10, fontWeight:800, padding:'2px 6px', borderRadius:5,
  },
  thumbActions: {
    position:'absolute', bottom:0, left:0, right:0, display:'flex',
    background:'linear-gradient(to top, rgba(0,0,0,.8), transparent)', padding:'10px 4px 4px',
    justifyContent:'space-between',
  },
  thumbOverlay: {
    position:'absolute', inset:0,
    background:'rgba(0,0,0,.55)',
    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
    backdropFilter:'blur(2px)',
  },
  thumbBtn: {
    background:'rgba(0,0,0,.6)', color:'#fff', border:'none', borderRadius:4,
    padding:'2px 6px', fontSize:10, cursor:'pointer',
  },
  bigBtn: {
    width:'100%', padding:'16px', borderRadius:12, border:'none', color:'#fff',
    fontSize:15, fontWeight:800, letterSpacing:.3, transition:'all .15s',
    boxShadow:'0 8px 24px rgba(0,0,0,.4)',
  },
  progressOuter: { marginTop:10, height:6, background:'rgba(255,255,255,.06)', borderRadius:3, overflow:'hidden' },
  progressInner:{ height:'100%', transition:'width .15s', borderRadius:3 },
  log: { marginTop:10, fontSize:11, color:'#64748b', fontFamily:'monospace' },
  previewVideo: (aspect) => ({
    width:'100%', borderRadius:10, background:'#000', display:'block',
    maxHeight: aspect === '9:16' ? 520 : 360,
  }),
  btnPrimary: {
    flex:1, padding:'10px', borderRadius:9, border:'none',
    background:'linear-gradient(135deg,#1a5aa0,#2d7dd2)', color:'#fff',
    fontSize:13, fontWeight:700, cursor:'pointer',
  },
  btnGhost: {
    padding:'10px 14px', borderRadius:9,
    background:'rgba(255,255,255,.05)', color:'#94a3b8',
    border:'1px solid rgba(255,255,255,.07)', fontSize:13, cursor:'pointer',
  },
  modalBackdrop: {
    position:'fixed', inset:0, background:'rgba(2,4,12,.85)', backdropFilter:'blur(8px)',
    display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:24,
  },
  modal: {
    background:'rgba(12,16,28,.98)', border:'1px solid rgba(255,255,255,.08)',
    borderRadius:14, padding:22, width:'min(720px, 95vw)', maxHeight:'90vh', overflowY:'auto',
    boxShadow:'0 20px 80px rgba(0,0,0,.6)',
  },
};
