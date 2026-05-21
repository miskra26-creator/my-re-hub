/**
 * aiReelOverlays — motion graphics that actually make AutoReel feel like
 * AutoReel.app and VideoTour.AI instead of a slideshow.
 *
 * What's in here (all canvas-drawn, no new deps):
 *   - Animated status badge ("JUST LISTED", "PRICE REDUCED", "OPEN HOUSE", etc.)
 *     bounces in over the first scene like a yard sign
 *   - Sequential stat-sticker reveal — $price, beds, baths, sqft each pops in
 *     one at a time with a 3D-feel drop shadow
 *   - Per-scene feature sticker — swings in from the side with an accent bar
 *   - Lower-third address bar — slides in mid-reel
 *   - Persistent corner brand watermark — small logo + agent name
 *   - 3D extruded text helper — layered offsets in accent color give text
 *     that "extruded" look without a real 3D engine
 *
 * Each drawer is a pure function: (ctx, w, h, t, params) → draws current frame.
 * Caller manages timing/visibility. All easing functions are inlined so this
 * module doesn't depend on cinematicRender.
 */

// ─── Easing ──────────────────────────────────────────────────────────────────
const easeOutCubic   = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic    = (t) => t * t * t;
const easeOutBack    = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const easeOutElastic = (t) => {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

// ─── Rounded rect path ───────────────────────────────────────────────────────
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

// ─── Status badge config ─────────────────────────────────────────────────────
// Maps listing.status (loose match) → badge style. The badge is the big
// "JUST LISTED" / etc. sticker that bounces in over the first scene.
const STATUS_BADGES = {
  'just-listed': { text: 'JUST LISTED', bg: '#dc2626', glow: '#fca5a5', accent: '#fde047' },
  'active':      { text: 'JUST LISTED', bg: '#dc2626', glow: '#fca5a5', accent: '#fde047' },
  'coming-soon': { text: 'COMING SOON', bg: '#0f172a', glow: '#b8864b', accent: '#fde047' },
  'price-reduced': { text: 'PRICE DROP', bg: '#dc2626', glow: '#fca5a5', accent: '#fde047' },
  'pending':     { text: 'PENDING',     bg: '#ca8a04', glow: '#fde047', accent: '#fff' },
  'sold':        { text: 'JUST SOLD',   bg: '#16a34a', glow: '#86efac', accent: '#fde047' },
  'open-house':  { text: 'OPEN HOUSE',  bg: '#0f172a', glow: '#b8864b', accent: '#fde047' },
};

export function getBadgeForStatus(rawStatus) {
  const s = (rawStatus || '').toLowerCase().trim();
  if (!s) return null;
  if (s.includes('coming'))  return STATUS_BADGES['coming-soon'];
  if (s.includes('reduc') || s.includes('drop')) return STATUS_BADGES['price-reduced'];
  if (s.includes('pending')) return STATUS_BADGES['pending'];
  if (s.includes('sold'))    return STATUS_BADGES['sold'];
  if (s.includes('open'))    return STATUS_BADGES['open-house'];
  if (s.includes('just listed')) return STATUS_BADGES['just-listed'];
  if (s.includes('active'))  return STATUS_BADGES['just-listed'];
  return null;
}

// ─── 3D extruded text ────────────────────────────────────────────────────────
// Simulates extruded letters by drawing multiple layered copies offset by
// 1px each in a depth direction. Outermost is darkest, innermost is bright.
//
// Use when you want the text to feel "punched out" / 3D — works great for
// hooks, status badges, big call-outs.
export function drawExtrudedText(ctx, text, x, y, opts = {}) {
  const {
    depth = 8,             // how many layered copies = depth illusion
    color = '#ffffff',     // top face color
    extrudeColor = '#000', // side/back color
    extrudeAngle = 45,     // degrees, 45 = down-right
    align = 'center',
    baseline = 'middle',
    font,                  // caller sets via ctx.font before, or pass here
  } = opts;
  if (font) ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;

  const rad = (extrudeAngle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  // Back-to-front layers — darker behind, brighter in front
  for (let i = depth; i >= 1; i--) {
    const shade = Math.max(0, 1 - i / depth);
    ctx.fillStyle = blendColor(extrudeColor, color, shade * 0.15);
    ctx.fillText(text, x + dx * i, y + dy * i);
  }
  // Top face
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function blendColor(a, b, t) {
  const pa = parseHex(a), pb = parseHex(b);
  if (!pa || !pb) return a;
  const mix = (ka, kb) => Math.round(ka + (kb - ka) * t);
  return '#' + [mix(pa[0], pb[0]), mix(pa[1], pb[1]), mix(pa[2], pb[2])]
    .map(v => v.toString(16).padStart(2, '0')).join('');
}
function parseHex(hex) {
  const m = (hex || '').replace('#', '');
  if (m.length !== 6) return null;
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

// ─── ANIMATED STATUS BADGE ───────────────────────────────────────────────────
// The "yard sign" — bounces in over the first scene, anchored to the lower-
// third of the frame. Hangs briefly with a slight sway, then exits.
//
// `t` is seconds since scene start.
// Visible window: t ∈ [0.2, 4.5]
//   - 0.2 → 0.9: bounce in (rotate + scale)
//   - 0.9 → 3.8: linger with subtle sway
//   - 3.8 → 4.5: fade + scale out
export function drawStatusBadge(ctx, w, h, t, { badge, sceneIdx = 0 }) {
  // Only on first scene
  if (sceneIdx !== 0 || !badge) return;
  const tIn  = 0.2, tHold = 0.9, tOut = 3.8, tDone = 4.5;
  if (t < tIn || t > tDone) return;

  let scale = 1, rot = 0, alpha = 1;
  if (t < tHold) {
    const p = (t - tIn) / (tHold - tIn);
    const eased = easeOutBack(p);
    scale = 0.3 + 0.7 * eased;
    rot = (1 - eased) * -0.25; // tilt in from the left
  } else if (t < tOut) {
    const p = (t - tHold) / (tOut - tHold);
    // Subtle sway like a hanging sign in a breeze
    rot = Math.sin(p * Math.PI * 2.5) * 0.012;
  } else {
    const p = (t - tOut) / (tDone - tOut);
    scale = 1 + 0.15 * p;
    alpha = 1 - p;
  }

  // Position: lower third of frame, biased right (where a lawn sign would be)
  const cx = w * 0.52;
  const cy = h * 0.72;

  // Padded badge dimensions
  const fontSize = Math.floor(w * 0.075);
  ctx.font = `900 ${fontSize}px "Helvetica Neue", Arial Black, system-ui, sans-serif`;
  const text = badge.text;
  const textW = ctx.measureText(text).width;
  const padX = fontSize * 0.7;
  const padY = fontSize * 0.45;
  const badgeW = textW + padX * 2;
  const badgeH = fontSize + padY * 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(scale, scale);

  // Drop-shadow (signposts cast big shadows)
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = badge.bg;
  roundedRect(ctx, -badgeW/2, -badgeH/2, badgeW, badgeH, 8);
  ctx.fill();
  ctx.restore();

  // Inner highlight (top edge — gives a 3D feel)
  ctx.save();
  const grad = ctx.createLinearGradient(0, -badgeH/2, 0, badgeH/2);
  grad.addColorStop(0,    'rgba(255,255,255,0.22)');
  grad.addColorStop(0.5,  'rgba(255,255,255,0.0)');
  grad.addColorStop(1,    'rgba(0,0,0,0.20)');
  ctx.fillStyle = grad;
  roundedRect(ctx, -badgeW/2, -badgeH/2, badgeW, badgeH, 8);
  ctx.fill();
  ctx.restore();

  // Accent border (thin line in accent color)
  ctx.strokeStyle = badge.accent;
  ctx.lineWidth = 2;
  roundedRect(ctx, -badgeW/2, -badgeH/2, badgeW, badgeH, 8);
  ctx.stroke();

  // 3D extruded text
  drawExtrudedText(ctx, text, 0, 0, {
    depth: 4,
    color: '#fff',
    extrudeColor: '#000',
    extrudeAngle: 90,
  });
  ctx.restore();
}

// ─── ANIMATED STAT STICKERS ──────────────────────────────────────────────────
// Sequential reveal of price / beds / baths / sqft, one per "tick", at the
// bottom-left of the first scene. Each pops in with a bounce.
//
// Visible window: t ∈ [1.4, 4.8] on the first scene
//   Sticker 0 (price)  in at 1.4, exits at end
//   Sticker 1 (beds)   in at 1.9
//   Sticker 2 (baths)  in at 2.4
//   Sticker 3 (sqft)   in at 2.9
export function drawStatStickers(ctx, w, h, t, { stats = [], sceneIdx = 0, accent = '#b8864b' }) {
  if (sceneIdx !== 0 || !stats.length) return;
  if (t < 1.4 || t > 4.8) return;

  const exitStart = 4.2, exitDone = 4.8;
  const fontSize = Math.floor(w * 0.034);
  ctx.font = `900 ${fontSize}px "Helvetica Neue", Arial Black, system-ui, sans-serif`;

  // Position: bottom-left stack
  let baseY = h * 0.88;
  const baseX = w * 0.05;
  const gap = fontSize * 0.55;

  // Reverse stack — stickers appear bottom-up like they're stacking
  const reversed = stats.slice().reverse();
  reversed.forEach((stat, i) => {
    const stickerStartT = 1.4 + i * 0.5;
    if (t < stickerStartT) return;
    const localT = t - stickerStartT;
    let scale = 1, alpha = 1;
    if (localT < 0.5) {
      const p = localT / 0.5;
      scale = easeOutBack(p);
      alpha = Math.min(1, p * 2);
    }
    if (t > exitStart) {
      const p = (t - exitStart) / (exitDone - exitStart);
      alpha *= 1 - p;
      scale *= 1 - p * 0.15;
    }
    if (alpha <= 0) return;

    const textW = ctx.measureText(stat).width;
    const padX = fontSize * 0.5;
    const padY = fontSize * 0.32;
    const sw = textW + padX * 2;
    const sh = fontSize + padY * 2;
    const sx = baseX;
    const sy = baseY - (sh + gap) * i - sh;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(sx + sw/2, sy + sh/2);
    ctx.scale(scale, scale);

    // Drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#fff';
    roundedRect(ctx, -sw/2, -sh/2, sw, sh, 6);
    ctx.fill();
    ctx.restore();

    // Accent left bar
    ctx.fillStyle = accent;
    ctx.fillRect(-sw/2, -sh/2, 4, sh);

    // Text
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${fontSize}px "Helvetica Neue", Arial Black, system-ui, sans-serif`;
    ctx.fillText(stat, 2, 0);

    ctx.restore();
  });
}

// ─── FEATURE STICKER (per scene, swings in from the side) ────────────────────
// Replaces the current top kinetic label with a more dynamic "swing in from
// off-screen" sticker positioned on the lower third.
//
// `sceneT` is 0..1 progress through the scene.
export function drawFeatureSticker(ctx, w, h, sceneT, { label, sceneIdx = 0, accent = '#b8864b' }) {
  if (!label || sceneIdx === 0) return; // first scene already has the status badge
  // Show from 15% to 80% of scene
  if (sceneT < 0.15 || sceneT > 0.80) return;

  const inT = 0.15, holdStart = 0.30, holdEnd = 0.65, outT = 0.80;
  let translateX = 0, rotate = 0, alpha = 1;

  if (sceneT < holdStart) {
    const p = (sceneT - inT) / (holdStart - inT);
    const eased = easeOutBack(p);
    translateX = (1 - eased) * -w * 0.6;
    rotate = (1 - eased) * -0.18;
    alpha = Math.min(1, p * 2);
  } else if (sceneT < holdEnd) {
    // Subtle sway during hold
    const p = (sceneT - holdStart) / (holdEnd - holdStart);
    rotate = Math.sin(p * Math.PI * 2) * 0.008;
  } else {
    const p = (sceneT - holdEnd) / (outT - holdEnd);
    translateX = p * w * 0.6;
    alpha = 1 - p;
  }

  const fontSize = Math.floor(w * 0.044);
  ctx.font = `900 ${fontSize}px "Helvetica Neue", Arial Black, system-ui, sans-serif`;
  const textW = ctx.measureText(label).width;
  const padX = fontSize * 0.7;
  const padY = fontSize * 0.38;
  const sw = textW + padX * 2;
  const sh = fontSize + padY * 2;
  // Position: lower-center, slightly right
  const cx = w * 0.5 + translateX;
  const cy = h * 0.78;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rotate);

  // Shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  // Sticker background: dark with accent border (looks like a sign)
  ctx.fillStyle = '#0f172a';
  roundedRect(ctx, -sw/2, -sh/2, sw, sh, 6);
  ctx.fill();
  ctx.restore();

  // Accent top bar (gives it that "sticker" feel — colored top edge)
  ctx.fillStyle = accent;
  ctx.fillRect(-sw/2, -sh/2, sw, 4);

  // Text
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${fontSize}px "Helvetica Neue", Arial Black, system-ui, sans-serif`;
  ctx.fillText(label, 0, 2);
  ctx.restore();
}

// ─── LOWER-THIRD ADDRESS BAR ─────────────────────────────────────────────────
// Slides in from the right at the bottom, mid-reel. Persistent for ~2 sec.
// Use case: lets viewers see exactly which address the reel is touring.
//
// Visible window: t ∈ [windowStartSec, windowStartSec + 3.5]
export function drawAddressBar(ctx, w, h, t, { address, city, windowStartSec = 6, accent = '#b8864b' }) {
  if (!address) return;
  const startT = windowStartSec, holdStart = startT + 0.6;
  const holdEnd = startT + 3.0, outT = startT + 3.5;
  if (t < startT || t > outT) return;

  let translateX = 0, alpha = 1;
  if (t < holdStart) {
    const p = (t - startT) / (holdStart - startT);
    translateX = (1 - easeOutCubic(p)) * w * 0.6;
    alpha = Math.min(1, p * 2);
  } else if (t < holdEnd) {
    translateX = 0;
  } else {
    const p = (t - holdEnd) / (outT - holdEnd);
    translateX = easeInCubic(p) * w * 0.6;
    alpha = 1 - p;
  }

  const fontSize = Math.floor(w * 0.034);
  const subSize = Math.floor(w * 0.024);
  ctx.font = `800 ${fontSize}px "Helvetica Neue", system-ui, sans-serif`;
  const textW = ctx.measureText(address).width;
  const subTextW = city ? ctx.measureText(city).width : 0;
  const maxW = Math.max(textW, subTextW);
  const padX = fontSize * 0.8;
  const padY = fontSize * 0.45;
  const barW = maxW + padX * 2;
  const barH = (city ? fontSize + subSize + fontSize * 0.25 : fontSize) + padY * 2;
  // Bottom-right, padded from edges
  const barX = w - barW - w * 0.04 + translateX;
  const barY = h * 0.88 - barH;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Accent vertical bar
  ctx.fillStyle = accent;
  ctx.fillRect(barX - 4, barY, 4, barH);

  // Background panel
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = 'rgba(15,20,38,0.92)';
  roundedRect(ctx, barX, barY, barW, barH, 4);
  ctx.fill();
  ctx.restore();

  // Address
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `800 ${fontSize}px "Helvetica Neue", system-ui, sans-serif`;
  ctx.fillText(address, barX + padX, barY + padY);
  if (city) {
    ctx.fillStyle = `${accent}cc`;
    ctx.font = `600 ${subSize}px "Helvetica Neue", system-ui, sans-serif`;
    ctx.fillText(city, barX + padX, barY + padY + fontSize + fontSize * 0.2);
  }

  ctx.restore();
}

// ─── BRAND WATERMARK (persistent, all scenes) ────────────────────────────────
// Small logo + agent name in the bottom-right corner. Fades to ~80% opacity
// so it doesn't compete with the main content.
export function drawBrandWatermark(ctx, w, h, t, { logoEl, agentName, accent = '#b8864b' }) {
  if (!logoEl && !agentName) return;
  // Fade in over the first 0.4 sec
  const alpha = Math.min(0.85, t * 2);
  ctx.save();
  ctx.globalAlpha = alpha;

  const padding = w * 0.03;
  let cursorX = w - padding;
  const cy = padding + w * 0.025;

  if (agentName) {
    const fontSize = Math.floor(w * 0.022);
    ctx.font = `800 ${fontSize}px "Helvetica Neue", system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#fff';
    ctx.fillText(agentName.toUpperCase(), cursorX, cy);
    cursorX -= ctx.measureText(agentName.toUpperCase()).width + padding * 0.5;
    ctx.shadowBlur = 0;
  }

  if (logoEl) {
    const logoH = w * 0.06;
    const logoW = logoH * (logoEl.naturalWidth / Math.max(1, logoEl.naturalHeight));
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.drawImage(logoEl, cursorX - logoW, cy - logoH/2, logoW, logoH);
    ctx.restore();
  }

  ctx.restore();
}

// ─── HELPER: build the stat strings array from listing data ──────────────────
export function buildStatStickers(listing) {
  if (!listing) return [];
  const out = [];
  const price = listing.list_price || listing.sale_price;
  if (price) out.push(`$${Number(price).toLocaleString()}`);
  if (listing.beds)  out.push(`${listing.beds} BD`);
  if (listing.baths) out.push(`${listing.baths} BA`);
  if (listing.sqft)  out.push(`${Number(listing.sqft).toLocaleString()} SQFT`);
  return out;
}

// ─── HELPER: light leak/flash transition between scenes ──────────────────────
// Brief white→gold flash that simulates a film "light leak" between scenes.
// Use at scene transitions for the "cinematic snap" feel.
export function drawLightLeak(ctx, w, h, sceneT, { duration = 0.25, accent = '#b8864b' }) {
  if (sceneT > duration) return;
  const p = sceneT / duration;
  const alpha = (1 - p) * 0.6;
  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  // Radial flash from top-right corner
  const grad = ctx.createRadialGradient(w * 0.85, h * 0.15, 0, w * 0.85, h * 0.15, Math.max(w, h));
  grad.addColorStop(0,    '#ffffff');
  grad.addColorStop(0.15, accent);
  grad.addColorStop(0.5,  `${accent}00`);
  grad.addColorStop(1,    'transparent');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
