import {
  getBadgeForStatus, drawStatusBadge, drawStatStickers, drawFeatureSticker,
  drawAddressBar, drawBrandWatermark, drawLightLeak, buildStatStickers,
} from './aiReelOverlays';

/**
 * cinematicRender — purpose-built renderer for the AutoReel feature.
 *
 * This is a SEPARATE engine from VideoAuto's renderer. VideoAuto handles
 * Monica's "drop in photos + pick template" workflow. cinematicRender is
 * tuned for the AutoReel experience: AI-curated listing photos turned into
 * a polished cinematic reel that competes with AutoReel.ai / VideoTour.AI.
 *
 * Key differentiators vs. VideoAuto:
 *   - Smooth ease-in-out Ken Burns per scene (not linear robotic pan)
 *   - Each scene gets a randomized but cinematic camera move (zoom-in,
 *     zoom-out, pan-left, pan-right, push-pull) seeded by scene index so
 *     it doesn't feel mechanical
 *   - Whip-pan transitions (true "scroll past" feel between rooms)
 *   - Kinetic typography: room labels enter with letter-by-letter reveal
 *   - Stats card opener: $XXX · X BD · X BA · X sqft with animated reveal
 *   - Film grain + subtle vignette overlay = premium feel
 *   - Closing card with logo splash + agent contact CTA
 *
 * Output: same format as VideoAuto (webm or mp4 via MediaRecorder), can be
 * downloaded directly or uploaded for Meta posting.
 */

// ── Image loading helpers (mirror VideoAuto's behavior) ───────────────────────
const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

// ── Easing functions ──────────────────────────────────────────────────────────
// Cinematic motion needs smooth acceleration/deceleration, not linear ramps.
const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutCubic   = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic    = (t) => t * t * t;

// ── Vibe-driven settings ──────────────────────────────────────────────────────
// (Imported defaults — caller can pass overrides through opts)
// Recalibrated 2026-05-21 after user feedback that output was muddy and
// jittery. Changes from v1:
//   - Removed sepia tint from luxury/cinematic/open-house (was making warm
//     photos look yellow/muddy on phone screens)
//   - Reduced grain from 0.04-0.08 down to 0.01-0.02 (was adding visible noise
//     that read as "low quality" on dark phone screens)
//   - Reduced motion intensity ~40% (was zooming too aggressively, reducing
//     effective photo resolution and making motion feel jittery)
//   - Vignette toned down ~30% (was darkening the corners too much)
const VIBE_DEFAULTS = {
  luxury:        { sceneDuration: 3.4, motionScale: 0.11, transition: 'fade',  grainAmount: 0.012, vignette: 0.30, filterCss: 'contrast(1.10) saturate(1.06) brightness(1.00)' },
  'just-listed': { sceneDuration: 2.6, motionScale: 0.14, transition: 'whip',  grainAmount: 0.010, vignette: 0.22, filterCss: 'saturate(1.22) contrast(1.10) brightness(1.03)' },
  'price-drop':  { sceneDuration: 2.8, motionScale: 0.15, transition: 'zoom',  grainAmount: 0.010, vignette: 0.24, filterCss: 'contrast(1.14) saturate(1.18) brightness(1.04)' },
  'open-house':  { sceneDuration: 3.0, motionScale: 0.12, transition: 'fade',  grainAmount: 0.012, vignette: 0.22, filterCss: 'saturate(1.10) brightness(1.05) contrast(1.04)' },
  sold:          { sceneDuration: 3.0, motionScale: 0.12, transition: 'fade',  grainAmount: 0.012, vignette: 0.24, filterCss: 'brightness(1.05) saturate(1.18) contrast(1.05)' },
  cinematic:     { sceneDuration: 3.8, motionScale: 0.10, transition: 'fade',  grainAmount: 0.018, vignette: 0.34, filterCss: 'contrast(1.12) saturate(1.04) brightness(1.00)' },
};

// ── Per-scene cinematic motion ────────────────────────────────────────────────
// Returns { startScale, endScale, startX, endX, startY, endY } given a scene
// index. Deterministic seed = sceneIndex so re-renders are identical.
function pickMotion(sceneIdx, motionScale = 0.2, isHero = false) {
  // 5 cinematic moves rotated by index — feels varied but never random-feeling
  const moves = [
    'push-in',     // zoom in slowly
    'pull-out',    // zoom out from tight crop
    'pan-right',   // glide right
    'pan-left',    // glide left
    'pedestal-up', // glide up
  ];
  const move = isHero ? 'push-in' : moves[sceneIdx % moves.length];
  const mag = motionScale;
  switch (move) {
    case 'push-in':
      return { sScale: 1.00, eScale: 1.00 + mag, sX: 0, eX: 0, sY: 0, eY: -mag * 0.15 };
    case 'pull-out':
      return { sScale: 1.00 + mag, eScale: 1.00, sX: 0, eX: 0, sY: -mag * 0.15, eY: 0 };
    case 'pan-right':
      return { sScale: 1.00 + mag * 0.5, eScale: 1.00 + mag * 0.5, sX: -mag * 0.35, eX: mag * 0.35, sY: 0, eY: 0 };
    case 'pan-left':
      return { sScale: 1.00 + mag * 0.5, eScale: 1.00 + mag * 0.5, sX: mag * 0.35, eX: -mag * 0.35, sY: 0, eY: 0 };
    case 'pedestal-up':
      return { sScale: 1.00 + mag * 0.5, eScale: 1.00 + mag * 0.5, sX: 0, eX: 0, sY: mag * 0.40, eY: -mag * 0.40 };
    default:
      return { sScale: 1.00, eScale: 1.00 + mag, sX: 0, eX: 0, sY: 0, eY: 0 };
  }
}

// ── Cover-fit draw with optional zoom + pan offsets (in normalized units) ─────
function drawCoverWithMotion(ctx, img, cx, cy, w, h, scale, panX, panY) {
  const iw = img.naturalWidth || img.videoWidth || img.width;
  const ih = img.naturalHeight || img.videoHeight || img.height;
  if (!iw || !ih) return;
  const baseScale = Math.max(w / iw, h / ih);
  const finalScale = baseScale * scale;
  const dw = iw * finalScale;
  const dh = ih * finalScale;
  // panX/panY are normalized -1..1, multiplied by half the "extra" overscan
  const dx = cx - dw / 2 + panX * (dw - w) * 0.5;
  const dy = cy - dh / 2 + panY * (dh - h) * 0.5;
  ctx.drawImage(img, dx, dy, dw, dh);
}

// ── Rounded rect path ─────────────────────────────────────────────────────────
// Shade a hex color by a percentage (positive = lighter, negative = darker)
function shadeColor(hex, percent) {
  const m = hex.replace('#', '');
  if (m.length !== 6) return hex;
  const adj = (v) => Math.max(0, Math.min(255, parseInt(v, 16) + Math.round(255 * (percent / 100))));
  const r = adj(m.slice(0, 2)), g = adj(m.slice(2, 4)), b = adj(m.slice(4, 6));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
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

// ── Film grain ────────────────────────────────────────────────────────────────
// Cheap real-time grain using random alpha-noise dots. Amount 0..1.
function drawGrain(ctx, w, h, amount, frame) {
  if (amount <= 0) return;
  const dots = Math.floor(w * h * amount * 0.012);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  // Use frame-seeded RNG so grain shifts each frame (real grain look)
  let seed = frame * 9301 + 49297;
  for (let i = 0; i < dots; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const x = (seed / 233280) * w;
    seed = (seed * 9301 + 49297) % 233280;
    const y = (seed / 233280) * h;
    seed = (seed * 9301 + 49297) % 233280;
    const a = (seed / 233280) * 0.22;
    seed = (seed * 9301 + 49297) % 233280;
    const v = (seed / 233280) > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${a})`;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
}

// ── Vignette ──────────────────────────────────────────────────────────────────
function drawVignette(ctx, w, h, amount) {
  if (amount <= 0) return;
  const grad = ctx.createRadialGradient(w/2, h/2, Math.min(w,h) * 0.35, w/2, h/2, Math.max(w,h) * 0.75);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${amount})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// ── Text shadow helper ────────────────────────────────────────────────────────
function shadowedFill(ctx, text, x, y, opts = {}) {
  const { shadowBlur = 18, shadowColor = 'rgba(0,0,0,0.7)' } = opts;
  ctx.save();
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = shadowBlur;
  ctx.shadowOffsetY = 2;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ── Kinetic typography: letter-by-letter reveal ───────────────────────────────
function drawKineticLabel(ctx, text, x, y, w, h, p, accent) {
  if (!text) return;
  const chars = text.split('');
  // Calculate font size based on canvas width
  const fontSize = Math.floor(w * 0.052);
  ctx.font = `900 ${fontSize}px "Cabinet Grotesk", "Helvetica Neue", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Measure full string width with letter-spacing
  const letterSpacing = fontSize * 0.04;
  let totalWidth = 0;
  const widths = chars.map(c => {
    const cw = ctx.measureText(c).width;
    totalWidth += cw + letterSpacing;
    return cw;
  });
  totalWidth -= letterSpacing;

  // Background pill behind the label — fades in early
  const padX = fontSize * 0.7;
  const padY = fontSize * 0.4;
  const pillW = totalWidth + padX * 2;
  const pillH = fontSize + padY * 2;
  const pillX = x - pillW / 2;
  const pillY = y - pillH / 2;

  ctx.save();
  ctx.globalAlpha = Math.min(1, p * 3); // pill fades in fully by p=0.33
  ctx.fillStyle = accent || '#b8864b';
  roundedRect(ctx, pillX, pillY, pillW, pillH, pillH * 0.18);
  ctx.fill();
  ctx.restore();

  // Letter-by-letter reveal: each letter pops in sequentially
  const charsToShow = Math.ceil(chars.length * Math.min(1, p / 0.7));
  let cursor = x - totalWidth / 2;
  for (let i = 0; i < chars.length; i++) {
    const cw = widths[i];
    if (i < charsToShow) {
      // Subtle bounce-in animation for each new letter
      const letterP = Math.max(0, Math.min(1, (p - i * (0.7 / chars.length)) * 8));
      const offset = (1 - easeOutCubic(letterP)) * fontSize * 0.4;
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = letterP;
      ctx.fillText(chars[i], cursor + cw / 2, y + offset);
      ctx.restore();
    }
    cursor += cw + letterSpacing;
  }
}

// ── Text wrap helper ──────────────────────────────────────────────────────────
function wrapText(ctx, text, maxWidth) {
  const words = (text || '').toString().split(/\s+/);
  if (!words.length) return [];
  const lines = [];
  let cur = words[0] || '';
  for (let i = 1; i < words.length; i++) {
    const probe = cur + ' ' + words[i];
    if (ctx.measureText(probe).width <= maxWidth) cur = probe;
    else { lines.push(cur); cur = words[i]; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ── Stats card animation (opener) ─────────────────────────────────────────────
// p is 0..1 across the intro duration. Renders: hook text → stats line → fade out.
function drawStatsCard(ctx, w, h, p, { hook, statsLine, accent, primary, brandName }) {
  // Background: brand primary with subtle radial vignette
  ctx.fillStyle = primary || '#0f172a';
  ctx.fillRect(0, 0, w, h);
  // Subtle radial bloom in upper third
  const bloom = ctx.createRadialGradient(w/2, h * 0.4, 0, w/2, h * 0.4, Math.max(w, h) * 0.6);
  bloom.addColorStop(0, `${accent || '#b8864b'}33`);
  bloom.addColorStop(1, 'transparent');
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, w, h);

  // Subtle border frame
  ctx.save();
  ctx.strokeStyle = `${accent || '#b8864b'}66`;
  ctx.lineWidth = 2;
  const inset = w * 0.05;
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  ctx.restore();

  // Brand name at top — fades in first
  if (brandName) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, p * 2.5);
    ctx.fillStyle = accent || '#b8864b';
    const brandSize = Math.floor(w * 0.026);
    ctx.font = `800 ${brandSize}px "Cabinet Grotesk", "Helvetica Neue", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.letterSpacing = '4px';
    shadowedFill(ctx, brandName.toUpperCase(), w / 2, h * 0.18, { shadowBlur: 12 });
    ctx.restore();
  }

  // Hook — large, center
  if (hook) {
    ctx.save();
    const hookProgress = Math.max(0, Math.min(1, (p - 0.15) / 0.5));
    const hookSize = Math.floor(w * 0.085);
    ctx.font = `900 ${hookSize}px "DM Serif Display", "Playfair Display", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = hookProgress;
    const offsetY = (1 - easeOutCubic(hookProgress)) * h * 0.04;
    const lines = wrapText(ctx, hook, w * 0.82);
    const lineHeight = hookSize * 1.1;
    const startY = h * 0.42 - ((lines.length - 1) * lineHeight) / 2 + offsetY;
    lines.forEach((line, i) => {
      shadowedFill(ctx, line, w / 2, startY + i * lineHeight, { shadowBlur: 20 });
    });
    ctx.restore();
  }

  // Accent divider line
  if (statsLine) {
    ctx.save();
    const dividerP = Math.max(0, Math.min(1, (p - 0.4) / 0.3));
    ctx.strokeStyle = accent || '#b8864b';
    ctx.lineWidth = 3;
    const dividerW = w * 0.18 * dividerP;
    ctx.beginPath();
    ctx.moveTo(w/2 - dividerW/2, h * 0.62);
    ctx.lineTo(w/2 + dividerW/2, h * 0.62);
    ctx.stroke();
    ctx.restore();

    // Stats line
    const statsP = Math.max(0, Math.min(1, (p - 0.5) / 0.35));
    ctx.save();
    ctx.fillStyle = '#fff';
    const statsSize = Math.floor(w * 0.038);
    ctx.font = `700 ${statsSize}px "Cabinet Grotesk", "Helvetica Neue", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = statsP;
    const statsOffset = (1 - easeOutCubic(statsP)) * h * 0.03;
    shadowedFill(ctx, statsLine, w/2, h * 0.70 + statsOffset, { shadowBlur: 12 });
    ctx.restore();
  }
}

// ── Closing card — modern redesign 2026-05-21 ────────────────────────────────
// Full-bleed blurred photo backdrop (the standout photo from the reel) with a
// clean glassy overlay card containing logo + headline + CTA + contact info.
// Replaces the 2010s solid-color version that read as "stock template."
async function drawClosingCard(ctx, w, h, p, opts) {
  const { headline, cta, brand, accent, primary, logoEl, backdropImg } = opts;

  // ── Backdrop: blurred final photo, or fallback solid gradient ─────────────
  if (backdropImg) {
    ctx.save();
    ctx.filter = 'blur(28px) brightness(0.55) saturate(1.05)';
    const iw = backdropImg.naturalWidth;
    const ih = backdropImg.naturalHeight;
    const scale = Math.max(w / iw, h / ih) * 1.12;
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(backdropImg, w/2 - dw/2, h/2 - dh/2, dw, dh);
    ctx.restore();
  } else {
    // Fallback: subtle vertical gradient on the primary brand color
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, shadeColor(primary || '#0f172a', -8));
    grad.addColorStop(1, primary || '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // Dark scrim — pull contrast back so overlay text reads cleanly
  ctx.save();
  const scrim = ctx.createLinearGradient(0, 0, 0, h);
  scrim.addColorStop(0, 'rgba(0,0,0,0.45)');
  scrim.addColorStop(0.5, 'rgba(0,0,0,0.55)');
  scrim.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // ── Overlay card — centered, with soft glassy border ──────────────────────
  const cardW = w * 0.78;
  const cardH = h * 0.56;
  const cardX = w / 2 - cardW / 2;
  const cardY = h / 2 - cardH / 2;
  const cardP = Math.min(1, p * 1.8);

  ctx.save();
  ctx.globalAlpha = cardP;
  // Subtle card backdrop — slight tint so it reads as a card, not just text
  ctx.fillStyle = 'rgba(15,20,38,0.25)';
  roundedRect(ctx, cardX, cardY, cardW, cardH, 18);
  ctx.fill();
  // Hairline border in accent gold
  ctx.strokeStyle = `${accent || '#b8864b'}55`;
  ctx.lineWidth = 1.5;
  roundedRect(ctx, cardX, cardY, cardW, cardH, 18);
  ctx.stroke();
  ctx.restore();

  // ── Content layout ────────────────────────────────────────────────────────
  // Vertical stack: logo → headline → divider → CTA → contact lines
  let y = cardY + cardH * 0.13;
  const centerX = w / 2;

  // Logo
  if (logoEl) {
    const logoP = Math.min(1, p * 2);
    const logoMaxW = cardW * 0.42;
    const logoNatRatio = logoEl.naturalHeight / Math.max(1, logoEl.naturalWidth);
    const logoW = logoMaxW * easeOutCubic(logoP);
    const logoH = logoW * logoNatRatio;
    ctx.save();
    ctx.globalAlpha = logoP;
    ctx.drawImage(logoEl, centerX - logoW/2, y, logoW, logoH);
    ctx.restore();
    y += logoH + cardH * 0.06;
  }

  // Headline — large serif, white, no shadow needed (we have scrim)
  if (headline) {
    const hP = Math.max(0, Math.min(1, (p - 0.20) / 0.35));
    ctx.save();
    ctx.fillStyle = '#fff';
    const hSize = Math.floor(w * 0.062);
    ctx.font = `900 ${hSize}px "DM Serif Display", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = hP;
    const yOff = (1 - easeOutCubic(hP)) * 14;
    ctx.fillText(headline, centerX, y + hSize/2 + yOff);
    y += hSize * 1.3;
    ctx.restore();
  }

  // Accent divider
  const dP = Math.max(0, Math.min(1, (p - 0.40) / 0.20));
  ctx.save();
  ctx.strokeStyle = accent || '#b8864b';
  ctx.lineWidth = 2;
  const dW = cardW * 0.14 * dP;
  ctx.beginPath();
  ctx.moveTo(centerX - dW/2, y);
  ctx.lineTo(centerX + dW/2, y);
  ctx.stroke();
  ctx.restore();
  y += cardH * 0.05;

  // CTA
  if (cta) {
    const cP = Math.max(0, Math.min(1, (p - 0.50) / 0.25));
    ctx.save();
    ctx.fillStyle = '#fff';
    const cSize = Math.floor(w * 0.034);
    ctx.font = `600 ${cSize}px "Cabinet Grotesk", "Helvetica Neue", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = cP;
    const yOff = (1 - easeOutCubic(cP)) * 10;
    // Wrap CTA if it's too wide for the card
    const ctaLines = wrapText(ctx, cta, cardW * 0.85);
    const ctaH = cSize * 1.3;
    ctaLines.forEach((line, i) => ctx.fillText(line, centerX, y + i * ctaH + cSize/2 + yOff));
    y += ctaH * ctaLines.length + cardH * 0.04;
    ctx.restore();
  }

  // Contact lines — agent name + phone/email/website
  const contactLines = [
    brand?.name,
    brand?.phone,
    brand?.email || brand?.website,
  ].filter(Boolean);
  if (contactLines.length) {
    const cxP = Math.max(0, Math.min(1, (p - 0.65) / 0.30));
    ctx.save();
    const liSize = Math.floor(w * 0.022);
    ctx.font = `600 ${liSize}px "Cabinet Grotesk", "Helvetica Neue", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = cxP;
    contactLines.forEach((line, i) => {
      // First line (agent name) in accent gold, others in soft white
      ctx.fillStyle = i === 0 ? (accent || '#b8864b') : 'rgba(255,255,255,0.78)';
      ctx.fillText(line, centerX, y + i * liSize * 1.7 + liSize/2);
    });
    ctx.restore();
  }
}

// ── Main render function ──────────────────────────────────────────────────────
// Inputs:
//   scenes:     [{ photo: <File|Blob|{url}>, room, label }]  in playback order
//   narrative:  { hook, statsLine, sceneLabels[], closingHeadline, closingCta, igCaption, fbCaption }
//   brand:      { logoUrl, primaryColor, accentColor, name, phone, email, website }
//   vibe:       'luxury' | 'just-listed' | etc.
//   music:      { url, volume } | null
//   voiceover:  { blob, durationSec, perScene: string[], provider, speakConfig? } | null
//               When present, music auto-ducks during narration and burned-in
//               subtitles (per-scene text chunks) appear at the bottom.
//   opts:       { onProgress(0..1, label), onLog(text), aspect, quality, captions:bool }
//
// Returns: { blob, mime, durationSec, dimensions: {w,h} }
export async function renderCinematicReel({ scenes, narrative, brand, vibe = 'luxury', music, voiceover, listing, opts = {} }) {
  const onProgress = opts.onProgress || (() => {});
  const onLog      = opts.onLog || (() => {});
  const aspect     = opts.aspect || '9:16';
  const quality    = opts.quality || 'high';
  const showCaptions = opts.captions !== false; // default on when voiceover present

  // Render at 1.25x the target dimensions so photos stay sharp through the
  // Ken Burns zoom AND MediaRecorder's lossy encoding. Chrome's VP9 encoder
  // tends to cap actual output bitrate well below what we request, so
  // supersampling at the source level helps preserve detail.
  const ASPECTS = {
    '9:16': { w: 1080, h: 1920 },
    '1:1':  { w: 1080, h: 1080 },
    '16:9': { w: 1920, h: 1080 },
  };
  const QUALITY = {
    high: { scale: 1.25, bitrate: 16_000_000 },
    max:  { scale: 1.50, bitrate: 28_000_000 },
  };
  const baseAsp = ASPECTS[aspect];
  const qPreset = QUALITY[quality] || QUALITY.high;
  const w = Math.round(baseAsp.w * qPreset.scale / 2) * 2;
  const h = Math.round(baseAsp.h * qPreset.scale / 2) * 2;

  const cfg = VIBE_DEFAULTS[vibe] || VIBE_DEFAULTS.luxury;
  const accent = brand?.accentColor || '#b8864b';
  const primary = brand?.primaryColor || '#0f172a';

  onLog(`Rendering ${w}×${h} · ${vibe} vibe · ${scenes.length} scenes`);
  onProgress(0.02, 'Loading photos…');

  // Preload all photo images
  const photoEls = await Promise.all(scenes.map(async (s, i) => {
    const url = s.photo instanceof Blob
      ? URL.createObjectURL(s.photo)
      : (s.photo?.url || s.photo);
    try {
      const img = await loadImage(url);
      return img;
    } catch (e) {
      onLog(`Warn: scene ${i + 1} photo failed to load`);
      return null;
    }
  }));

  // Preload logo
  let logoEl = null;
  if (brand?.logoUrl) {
    try { logoEl = await loadImage(brand.logoUrl); } catch (e) { /* ignore */ }
  }

  // Pick the closing-card backdrop: the highest-scoring loaded photo, or the
  // first available. Used as a blurred full-bleed background under the
  // overlay card on the closing slide.
  let closingBackdrop = null;
  {
    const scored = scenes.map((s, i) => ({ img: photoEls[i], score: s.score || 0 }))
      .filter(x => x.img)
      .sort((a, b) => b.score - a.score);
    closingBackdrop = scored[0]?.img || photoEls.find(Boolean) || null;
  }

  // Compute timing — when voiceover is present, stretch scenes so the reel
  // is at least as long as the narration (no cutoff). Otherwise use vibe default.
  const introDur   = 2.2;      // stats card opener
  const outroDur   = 2.6;      // closing card
  const transDur   = 0.35;
  let   sceneDur   = cfg.sceneDuration;
  if (voiceover?.durationSec) {
    const minScenesDur = Math.max(0, voiceover.durationSec - 1.0); // leave 1s of outro overlap
    const fitSceneDur = minScenesDur / scenes.length;
    // Never go below vibe default — only stretch if narration is longer.
    if (fitSceneDur > sceneDur) sceneDur = fitSceneDur;
    onLog(`Voiceover ${voiceover.durationSec.toFixed(1)}s · pacing scenes at ${sceneDur.toFixed(2)}s each`);
  }
  const totalDur   = introDur + scenes.length * sceneDur + outroDur;
  onLog(`Total duration: ${totalDur.toFixed(1)}s`);

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.style.cssText = 'position:fixed;left:-99999px;top:-99999px;pointer-events:none;opacity:0;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Paint one frame so the stream has data immediately
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, w, h);

  // ── Audio mixing ────────────────────────────────────────────────────────────
  // When voiceover is present, music ducks to ~25% during the narration period
  // (introDur to introDur + voiceover.durationSec). Otherwise music plays at
  // configured volume throughout.
  let audioCtxNode, audioMixStream, audioCtxObj, musicGainNode, voiceEl;
  const hasMusic = !!(music?.url);
  const hasVoiceover = !!(voiceover?.blob);
  try {
    if (hasMusic || hasVoiceover) {
      audioCtxObj = new (window.AudioContext || window.webkitAudioContext)();
      const dest = audioCtxObj.createMediaStreamDestination();
      audioMixStream = dest.stream;

      // Music track
      let musicEl = null;
      if (hasMusic) {
        musicEl = new Audio();
        musicEl.crossOrigin = 'anonymous';
        musicEl.src = music.url;
        musicEl.loop = true;
        musicEl.volume = music.volume ?? 0.85;
        await musicEl.play().catch(() => {/* */});
        const musicNode = audioCtxObj.createMediaElementSource(musicEl);
        musicGainNode = audioCtxObj.createGain();
        musicGainNode.gain.value = music.volume ?? 0.85;
        musicNode.connect(musicGainNode).connect(dest);
      }

      // Voiceover track (if a blob is provided)
      if (voiceover?.blob) {
        const voUrl = URL.createObjectURL(voiceover.blob);
        voiceEl = new Audio();
        voiceEl.crossOrigin = 'anonymous';
        voiceEl.src = voUrl;
        voiceEl.volume = 1.0;
        const voNode = audioCtxObj.createMediaElementSource(voiceEl);
        const voGain = audioCtxObj.createGain();
        voGain.gain.value = 1.0;
        voNode.connect(voGain).connect(dest);
        // We'll start voiceEl at introDur (after the stats card)
      }

      audioCtxNode = { musicEl };
    }
  } catch (e) {
    onLog(`Audio setup failed (non-fatal): ${e.message}`);
  }

  // ── MediaRecorder setup ─────────────────────────────────────────────────────
  const videoStream = canvas.captureStream(30);
  const stream = audioMixStream
    ? new MediaStream([...videoStream.getVideoTracks(), ...audioMixStream.getAudioTracks()])
    : videoStream;

  const mime = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']
    .find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: qPreset.bitrate });
  rec.ondataavailable = e => e.data && e.data.size && chunks.push(e.data);

  const recordingDone = new Promise((resolve) => { rec.onstop = resolve; });
  rec.start();

  // ── Voiceover scheduling ─────────────────────────────────────────────────────
  // Start voiceover playback at introDur (when scenes begin). Music ducks to
  // 25% volume during the narration and ramps back to full afterward.
  let voiceStartedAt = null;
  const baseMusicGain = music?.volume ?? 0.85;
  const duckedMusicGain = baseMusicGain * 0.28;
  if (hasVoiceover && voiceEl) {
    setTimeout(() => {
      try {
        voiceEl.play().catch(() => {});
        voiceStartedAt = performance.now();
        if (musicGainNode && audioCtxObj) {
          // Smooth ramp down to ducked level
          const now = audioCtxObj.currentTime;
          musicGainNode.gain.cancelScheduledValues(now);
          musicGainNode.gain.linearRampToValueAtTime(duckedMusicGain, now + 0.4);
          // Ramp back up after voiceover ends
          const rampUpAt = now + (voiceover.durationSec || 30) + 0.2;
          musicGainNode.gain.linearRampToValueAtTime(baseMusicGain, rampUpAt + 0.6);
        }
      } catch (e) { onLog(`Voiceover play failed: ${e.message}`); }
    }, introDur * 1000);
  }

  // ── Pre-compute per-scene karaoke caption windows ───────────────────────────
  // If we have word-level timings from the TTS, slice them into per-scene
  // groups so each scene shows ONLY the words spoken during that scene,
  // highlighting the active one as it's spoken (TikTok karaoke style).
  // Voiceover starts at introDur, so word timings are offset by that.
  const hasWordTimings = !!(voiceover?.wordTimings?.length);
  const wordTimings    = voiceover?.wordTimings || [];
  const sceneWordGroups = [];
  if (hasWordTimings) {
    for (let i = 0; i < scenes.length; i++) {
      const sceneStartVoTime = i * sceneDur;       // scene start in voiceover-time
      const sceneEndVoTime   = (i + 1) * sceneDur;
      sceneWordGroups.push(
        wordTimings.filter(wt => wt.startSec >= sceneStartVoTime && wt.startSec < sceneEndVoTime)
      );
    }
  }

  // ── Caption helpers ─────────────────────────────────────────────────────────
  // Two modes:
  //   1. Karaoke mode — word-by-word highlight, used when wordTimings present
  //   2. Block mode   — entire per-scene sentence with fade in/out, fallback

  function drawKaraokeCaption(words, voTime, sceneT, w, h, accent) {
    if (!words?.length || !showCaptions) return;
    // Hide right at scene edges to avoid clipping during transitions
    if (sceneT < 0.02 || sceneT > 0.97) return;

    const fontSize = Math.floor(w * 0.042);
    ctx.font = `900 ${fontSize}px "Cabinet Grotesk", "Helvetica Neue", system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Wrap words into lines based on available width
    const maxLineWidth = w * 0.84;
    const spaceW = ctx.measureText(' ').width;
    const lines = [];
    let curLine = [];
    let curWidth = 0;
    for (const wt of words) {
      const ww = ctx.measureText(wt.word).width;
      const proposed = curWidth + (curLine.length ? spaceW : 0) + ww;
      if (proposed > maxLineWidth && curLine.length) {
        lines.push({ words: curLine, width: curWidth });
        curLine = [{ ...wt, width: ww }];
        curWidth = ww;
      } else {
        curWidth = proposed;
        curLine.push({ ...wt, width: ww });
      }
    }
    if (curLine.length) lines.push({ words: curLine, width: curWidth });

    const lineH = fontSize * 1.2;
    const pad   = fontSize * 0.5;
    const blockH = lines.length * lineH + pad * 2;
    const blockY = h * 0.78 - blockH / 2;
    const blockW = Math.min(w * 0.94, Math.max(...lines.map(l => l.width)) + pad * 2);
    const blockX = w / 2 - blockW / 2;

    // Caption backdrop — semi-opaque dark pill
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    roundedRect(ctx, blockX, blockY, blockW, blockH, 10);
    ctx.fill();
    ctx.restore();

    // Draw each word, highlighting the active one
    lines.forEach((line, li) => {
      const lineY = blockY + pad + li * lineH + lineH / 2;
      let x = w / 2 - line.width / 2;
      line.words.forEach((word) => {
        const isActive = voTime >= word.startSec && voTime <= word.endSec;
        const wasActive = voTime > word.endSec;
        const willBeActive = voTime < word.startSec;

        ctx.save();
        // Active word: scale up, accent color, glow
        if (isActive) {
          const ageT = (voTime - word.startSec) / Math.max(0.05, word.endSec - word.startSec);
          const pulse = 1.0 + 0.18 * Math.sin(ageT * Math.PI); // gentle pulse
          ctx.translate(x + word.width / 2, lineY);
          ctx.scale(pulse, pulse);
          ctx.translate(-(x + word.width / 2), -lineY);
          ctx.shadowColor = accent;
          ctx.shadowBlur = 16;
          ctx.fillStyle = accent;
        } else if (wasActive) {
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.shadowColor = 'rgba(0,0,0,0.7)';
          ctx.shadowBlur = 4;
        } else if (willBeActive) {
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 4;
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
        }
        ctx.fillText(word.word, x, lineY);
        ctx.restore();
        x += word.width + spaceW;
      });
    });
  }

  function drawBlockCaption(text, sceneT, w, h, accent) {
    if (!text || !showCaptions || !hasVoiceover) return;
    if (sceneT < 0.03 || sceneT > 0.95) return;
    const inP  = Math.min(1, sceneT / 0.12);
    const outP = Math.min(1, (1 - sceneT) / 0.10);
    const alpha = Math.min(inP, outP);

    ctx.save();
    ctx.globalAlpha = alpha;
    const fontSize = Math.floor(w * 0.038);
    ctx.font = `800 ${fontSize}px "Cabinet Grotesk", "Helvetica Neue", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lines = wrapText(ctx, text, w * 0.84);
    const lineH = fontSize * 1.15;
    const pad   = fontSize * 0.5;
    const blockH = lines.length * lineH + pad * 2;
    const blockY = h * 0.82 - blockH / 2;
    const blockW = Math.min(w * 0.92, Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2);
    const blockX = w / 2 - blockW / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    roundedRect(ctx, blockX, blockY, blockW, blockH, 8);
    ctx.fill();
    ctx.fillStyle = accent || '#b8864b';
    ctx.fillRect(blockX, blockY, 3, blockH);
    ctx.fillStyle = '#fff';
    lines.forEach((line, i) => {
      const ly = blockY + pad + i * lineH + lineH / 2;
      shadowedFill(ctx, line, w / 2, ly, { shadowBlur: 6 });
    });
    ctx.restore();
  }

  // ── Render loop ─────────────────────────────────────────────────────────────
  const t0 = performance.now();
  let stopped = false;
  let frameCount = 0;

  await new Promise((resolve) => {
    function tick() {
      const elapsed = (performance.now() - t0) / 1000;
      const t = Math.min(elapsed, totalDur);
      frameCount++;

      // ── INTRO (stats card) ────────────────────────────────────────────────
      if (t < introDur) {
        const p = t / introDur;
        drawStatsCard(ctx, w, h, p, {
          hook: narrative.hook,
          statsLine: narrative.statsLine,
          accent, primary,
          brandName: brand?.name,
        });
      }
      // ── SCENES ────────────────────────────────────────────────────────────
      else if (t < introDur + scenes.length * sceneDur) {
        const sceneTotal = t - introDur;
        const sceneIdx = Math.min(scenes.length - 1, Math.floor(sceneTotal / sceneDur));
        const sceneT   = (sceneTotal - sceneIdx * sceneDur) / sceneDur; // 0..1

        const img = photoEls[sceneIdx];
        const motion = pickMotion(sceneIdx, cfg.motionScale);
        const easedT = easeInOutCubic(sceneT);
        const sScale = motion.sScale + (motion.eScale - motion.sScale) * easedT;
        const sX = motion.sX + (motion.eX - motion.sX) * easedT;
        const sY = motion.sY + (motion.eY - motion.sY) * easedT;

        // Background fill in case image is missing
        ctx.fillStyle = primary;
        ctx.fillRect(0, 0, w, h);

        if (img) {
          ctx.save();
          ctx.filter = cfg.filterCss || 'none';
          drawCoverWithMotion(ctx, img, w/2, h/2, w, h, sScale, sX, sY);
          ctx.filter = 'none';
          ctx.restore();
        }

        // Transition from previous scene
        if (sceneIdx > 0 && sceneT < transDur / sceneDur) {
          const tFade = sceneT / (transDur / sceneDur);
          const prevImg = photoEls[sceneIdx - 1];
          if (prevImg) {
            ctx.save();
            if (cfg.transition === 'whip') {
              // Whip-pan: previous scene slides out fast left + blur
              const shift = -w * easeInCubic(tFade);
              ctx.filter = `${cfg.filterCss || 'none'} blur(${8 * (1 - tFade)}px)`;
              ctx.globalAlpha = 1 - tFade;
              ctx.translate(shift, 0);
              drawCoverWithMotion(ctx, prevImg, w/2, h/2, w, h, 1.05, 0, 0);
            } else if (cfg.transition === 'zoom') {
              const scale = 1 + 0.3 * tFade;
              ctx.filter = cfg.filterCss || 'none';
              ctx.globalAlpha = 1 - tFade;
              drawCoverWithMotion(ctx, prevImg, w/2, h/2, w, h, scale, 0, 0);
            } else {
              // fade
              ctx.filter = cfg.filterCss || 'none';
              ctx.globalAlpha = 1 - tFade;
              drawCoverWithMotion(ctx, prevImg, w/2, h/2, w, h, 1.0, 0, 0);
            }
            ctx.restore();
          }
        }

        // Vignette
        drawVignette(ctx, w, h, cfg.vignette);

        // Top + bottom gradient overlay for text legibility
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0,    'rgba(0,0,0,0.4)');
        grad.addColorStop(0.25, 'rgba(0,0,0,0.0)');
        grad.addColorStop(0.75, 'rgba(0,0,0,0.0)');
        grad.addColorStop(1,    'rgba(0,0,0,0.6)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // ── MOTION GRAPHICS OVERLAYS ─────────────────────────────────────
        // The "wow" layer — animated stickers, status badges, callouts that
        // make this feel like AutoReel/VideoTour-AI instead of a slideshow.

        // 1. Light-leak flash between scenes (cinematic transition snap)
        if (sceneIdx > 0) {
          drawLightLeak(ctx, w, h, sceneT, { duration: 0.30, accent });
        }

        // 2. Status badge ("JUST LISTED" / "PRICE DROP" / etc.) on first scene
        //    Anchored to lower-third like a yard sign.
        if (sceneIdx === 0) {
          const badge = getBadgeForStatus(listing?.status);
          if (badge) {
            // Pass scene-elapsed time in seconds
            drawStatusBadge(ctx, w, h, sceneT * sceneDur, { badge, sceneIdx });
          }
          // 3. Animated stat stickers stack ($425K · 4 BD · 3 BA · 2400 SQFT)
          const stickers = buildStatStickers(listing);
          drawStatStickers(ctx, w, h, sceneT * sceneDur, {
            stats: stickers, sceneIdx, accent,
          });
        }

        // 4. Per-scene feature sticker (swings in for scenes 2+)
        //    Uses AI-extracted specific labels ("WHITE QUARTZ ISLAND" etc.)
        //    Skips generic labels even if the AI sneaks one through.
        const rawLabel = (narrative.sceneLabels?.[sceneIdx] || scenes[sceneIdx]?.label || '').trim();
        const isGeneric = /^(KITCHEN|BEDROOM|LIVING ROOM|BATHROOM|DINING ROOM|OFFICE|BASEMENT|ENTRY|HALLWAY|FOYER|ROOM)$/i.test(rawLabel);
        const label = isGeneric ? '' : rawLabel;
        if (label && sceneIdx > 0) {
          drawFeatureSticker(ctx, w, h, sceneT, { label, sceneIdx, accent });
        }

        // 5. Address lower-third bar — slides in mid-reel
        //    Appears on a mid-tour scene so viewers see exactly which address
        if (sceneIdx === Math.floor(scenes.length / 2) && listing?.address) {
          drawAddressBar(ctx, w, h, sceneT * sceneDur, {
            address: listing.address,
            city: listing.city,
            windowStartSec: 0.3,
            accent,
          });
        }

        // 6. Persistent brand watermark (corner logo + agent name)
        drawBrandWatermark(ctx, w, h, t, {
          logoEl,
          agentName: brand?.name,
          accent,
        });

        // Caption (only when voiceover is active)
        // Karaoke mode when we have word-level timings; block mode otherwise.
        if (hasWordTimings) {
          // voTime = elapsed time since voiceover started (voice starts at introDur)
          const voTime = t - introDur;
          drawKaraokeCaption(sceneWordGroups[sceneIdx], voTime, sceneT, w, h, accent);
        } else {
          drawBlockCaption(voiceover?.perScene?.[sceneIdx], sceneT, w, h, accent);
        }

        // Scene counter in corner
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = `700 ${Math.floor(w * 0.022)}px "Cabinet Grotesk", system-ui, sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(`${sceneIdx + 1} / ${scenes.length}`, w * 0.95, h * 0.96);
        ctx.restore();

        // Film grain
        drawGrain(ctx, w, h, cfg.grainAmount, frameCount);
      }
      // ── OUTRO (closing card) ──────────────────────────────────────────────
      else {
        const outroT = t - introDur - scenes.length * sceneDur;
        const p = Math.min(1, outroT / outroDur);
        // Use the highest-quality photo as the closing-card backdrop. Falls
        // back to the first photo, or null (solid gradient) if none available.
        const backdrop = closingBackdrop;
        drawClosingCard(ctx, w, h, p, {
          headline: narrative.closingHeadline,
          cta: narrative.closingCta,
          brand, accent, primary, logoEl, backdropImg: backdrop,
        });
      }

      // Progress callback (rendering phase = 10..95% of overall progress)
      onProgress(0.10 + 0.85 * (t / totalDur), 'Rendering reel…');

      if (t < totalDur && !stopped) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });

  // Stop recording
  stopped = true;
  try { rec.stop(); } catch (e) { /* ignore */ }
  try { if (audioCtxNode?.musicEl) audioCtxNode.musicEl.pause(); } catch (e) {/* */}
  try { if (voiceEl) { voiceEl.pause(); voiceEl.src = ''; } } catch (e) {/* */}
  await recordingDone;

  // Cleanup
  try { canvas.remove(); } catch (e) {/* */}
  try { if (audioCtxObj) await audioCtxObj.close(); } catch (e) {/* */}

  onProgress(0.97, 'Finalizing…');
  const blob = new Blob(chunks, { type: mime });
  onProgress(1.0, 'Done');

  return {
    blob,
    mime,
    durationSec: totalDur,
    dimensions: { w, h },
  };
}

// ── Free music tracks (mirror VideoAuto's FREE_MUSIC for consistency) ─────────
// Curated for AutoReel vibes — cinematic / luxury / warm / upbeat
// Hosted on Pixabay CDN (commercial-use OK, no attribution required).
export const REEL_MUSIC = {
  cinematic: [
    { id:'cine-1', name:'Cinematic Inspiration',     url:'https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3' },
    { id:'cine-2', name:'Epic Cinematic',           url:'https://cdn.pixabay.com/audio/2022/03/15/audio_c8c8a73467.mp3' },
    { id:'cine-3', name:'Cinematic Documentary',    url:'https://cdn.pixabay.com/audio/2023/03/06/audio_ba8c8c1e57.mp3' },
  ],
  luxury: [
    { id:'lux-1',  name:'Luxury Lifestyle',         url:'https://cdn.pixabay.com/audio/2022/10/30/audio_4cc4d61c93.mp3' },
    { id:'lux-2',  name:'Smooth Jazz Lounge',       url:'https://cdn.pixabay.com/audio/2022/03/15/audio_a4823c69a3.mp3' },
  ],
  upbeat: [
    { id:'up-1',   name:'Upbeat Inspiring',         url:'https://cdn.pixabay.com/audio/2023/01/04/audio_92957c0ee5.mp3' },
    { id:'up-2',   name:'Happy Background',         url:'https://cdn.pixabay.com/audio/2022/05/27/audio_d3da77c4e3.mp3' },
  ],
  warm: [
    { id:'warm-1', name:'Inspiring Acoustic',       url:'https://cdn.pixabay.com/audio/2022/01/26/audio_1c3eb84a6b.mp3' },
    { id:'warm-2', name:'Acoustic Folk',            url:'https://cdn.pixabay.com/audio/2022/03/15/audio_8e2c2c2fb1.mp3' },
  ],
};

export function pickRandomTrack(vibeOrCategory) {
  const list = REEL_MUSIC[vibeOrCategory] || REEL_MUSIC.cinematic;
  return list[Math.floor(Math.random() * list.length)];
}
