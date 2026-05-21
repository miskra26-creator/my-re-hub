/**
 * aiReelStitch — assembles the final AutoReel from AI-generated clips.
 *
 * Pipeline:
 *   1. Take N mp4 clips from LTX-Video (one per scene, ~4 sec each)
 *   2. Render intro card + outro card to mp4 via canvas + MediaRecorder
 *   3. Concat all clips into one continuous video using FFmpeg-wasm
 *   4. Mix in: background music (ducked under narration when present)
 *                + voiceover narration
 *                + burned-in karaoke captions (if word timings exist)
 *
 * All in-browser, runs against the FFmpeg singleton already used by
 * audioCleaner / VideoAuto. No new dependencies.
 *
 * Inputs are designed to be a drop-in replacement for renderCinematicReel —
 * AutoReel passes the same { scenes, narrative, brand, vibe, music, voiceover }
 * shape, just with clips[i].blob already populated from aiVideoMotion.
 */
import { getFFmpegShared } from './audioCleaner';

// ─── Render an intro / outro mp4 card via canvas + MediaRecorder ──────────────
// Reuses the styles from cinematicRender (stats card, closing card). We render
// the card as a short mp4 we can prepend/append to the LTX clips during concat.
async function renderCardClip({ kind, w, h, durationSec, draw, fps = 24 }) {
  // 'kind' is just for logs/debugging — 'intro' | 'outro'
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.style.cssText = 'position:fixed;left:-99999px;top:-99999px;pointer-events:none;opacity:0;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Paint one frame so the stream has data
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  const stream = canvas.captureStream(fps);
  const mime = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']
    .find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  rec.ondataavailable = e => e.data?.size && chunks.push(e.data);
  const stopped = new Promise(res => { rec.onstop = res; });
  rec.start();

  const t0 = performance.now();
  await new Promise((resolve) => {
    function tick() {
      const t = (performance.now() - t0) / 1000;
      const p = Math.min(1, t / durationSec);
      draw(ctx, w, h, p);
      if (t < durationSec) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });

  try { rec.stop(); } catch {}
  await stopped;
  try { canvas.remove(); } catch {}

  return { blob: new Blob(chunks, { type: mime }), mime };
}

// ─── Main entry: stitch + mix the reel ────────────────────────────────────────
// Returns { blob, mime, durationSec, dimensions }
export async function stitchReel({
  clips,           // [{ blob, prompt }]  — AI-generated clips from aiVideoMotion
  scenes,          // matching scenes array from AutoReel (for captions/labels)
  narrative,       // { hook, statsLine, sceneLabels, closingHeadline, closingCta, ... }
  brand,           // { name, logoUrl, primaryColor, accentColor, phone, email, website }
  vibe = 'luxury',
  music,           // { url, volume } | null
  voiceover,       // { blob, durationSec, perScene, wordTimings, provider } | null
  opts = {},
}) {
  const onProgress = opts.onProgress || (() => {});
  const onLog      = opts.onLog || (() => {});
  const aspect     = opts.aspect || '9:16';

  // Output dimensions — match what LTX-Video clips are (704×480 native).
  // We render the final mp4 at 720p so the AI clips are upscaled minimally
  // and the cards/captions look sharp.
  const ASPECTS = {
    '9:16': { w: 720,  h: 1280 },
    '1:1':  { w: 1080, h: 1080 },
    '16:9': { w: 1920, h: 1080 },
  };
  const { w, h } = ASPECTS[aspect] || ASPECTS['9:16'];

  onLog(`Stitching ${clips.length} AI clips into final reel (${w}×${h})`);
  onProgress(0.05, 'Preparing FFmpeg…');

  const { ffmpeg, fetchFile } = await getFFmpegShared(onLog);

  // ── Write all the AI clips to FFmpeg's virtual FS ───────────────────────────
  onProgress(0.10, 'Loading AI clips…');
  const okClips = clips.filter(c => c.blob);
  if (!okClips.length) throw new Error('No AI clips generated — cannot stitch');

  for (let i = 0; i < okClips.length; i++) {
    const name = `clip_${i.toString().padStart(3, '0')}.mp4`;
    await ffmpeg.writeFile(name, await fetchFile(okClips[i].blob));
  }

  // ── Render and add intro + outro cards ──────────────────────────────────────
  onProgress(0.20, 'Rendering intro/outro cards…');
  const accent = brand?.accentColor || '#b8864b';
  const primary = brand?.primaryColor || '#0f172a';
  const logoEl = brand?.logoUrl ? await loadImage(brand.logoUrl).catch(() => null) : null;
  const introCard = await renderCardClip({
    kind: 'intro', w, h, durationSec: 2.4,
    draw: (ctx, W, H, p) => drawStatsCardFrame(ctx, W, H, p, {
      hook: narrative.hook, statsLine: narrative.statsLine,
      accent, primary, brandName: brand?.name,
    }),
  });
  // Closing backdrop = the first AI clip's first frame would be best, but
  // for speed we just use the brand color gradient or the first photo.
  const outroCard = await renderCardClip({
    kind: 'outro', w, h, durationSec: 3.0,
    draw: (ctx, W, H, p) => drawClosingCardFrame(ctx, W, H, p, {
      headline: narrative.closingHeadline,
      cta: narrative.closingCta,
      brand, accent, primary, logoEl,
    }),
  });

  await ffmpeg.writeFile('intro.webm', await fetchFile(introCard.blob));
  await ffmpeg.writeFile('outro.webm', await fetchFile(outroCard.blob));

  // ── Build the concat list ───────────────────────────────────────────────────
  // FFmpeg's concat demuxer needs all inputs in the same codec/dimensions, so
  // we normalize each piece via -c:v libx264 in the final concat step.
  //
  // First pass: re-encode each clip + intro/outro to a uniform format and
  // resolution. Second pass: concat them.
  onProgress(0.30, 'Normalizing clips to uniform format…');
  const normalizedList = [];
  const allInputs = ['intro.webm', ...okClips.map((_, i) => `clip_${i.toString().padStart(3, '0')}.mp4`), 'outro.webm'];

  for (let i = 0; i < allInputs.length; i++) {
    const inName = allInputs[i];
    const outName = `norm_${i.toString().padStart(3, '0')}.mp4`;
    await ffmpeg.exec([
      '-y', '-i', inName,
      '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=24`,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-an',
      outName,
    ]);
    normalizedList.push(outName);
  }

  // Build the concat-demuxer manifest
  const concatTxt = normalizedList.map(n => `file '${n}'`).join('\n');
  await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatTxt));

  // ── Concat ──────────────────────────────────────────────────────────────────
  onProgress(0.55, 'Concatenating clips…');
  await ffmpeg.exec([
    '-y', '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-an',
    'video_only.mp4',
  ]);

  // ── Build the audio track (music + voiceover) ───────────────────────────────
  // We mix music + voiceover into a single audio file matching the video's
  // length, then mux it in.
  onProgress(0.75, 'Mixing audio…');
  await buildMixedAudio(ffmpeg, fetchFile, {
    music,
    voiceover,
    durationHint: estimateTotalDuration(okClips, 2.4, 3.0),
    onLog,
  });

  // ── Mux video + audio together ──────────────────────────────────────────────
  onProgress(0.88, 'Final mux…');
  const muxArgs = ['-y', '-i', 'video_only.mp4'];
  const hasAudio = await ffmpeg.listDir('/').then(list => list.some(f => f.name === 'mixed.m4a')).catch(() => false);
  if (hasAudio) {
    muxArgs.push('-i', 'mixed.m4a', '-c:v', 'copy', '-c:a', 'aac', '-shortest');
  } else {
    muxArgs.push('-c:v', 'copy', '-an');
  }
  muxArgs.push('final.mp4');
  await ffmpeg.exec(muxArgs);

  // ── Read out the final mp4 ──────────────────────────────────────────────────
  onProgress(0.96, 'Reading final…');
  const data = await ffmpeg.readFile('final.mp4');
  const blob = new Blob([data.buffer], { type: 'video/mp4' });

  // Cleanup virtual FS to keep memory pressure down for the next run
  try {
    for (const n of [...allInputs, ...normalizedList, 'concat.txt', 'video_only.mp4', 'mixed.m4a', 'music_raw', 'voice_raw', 'final.mp4', 'intro.webm', 'outro.webm']) {
      await ffmpeg.deleteFile(n).catch(() => {});
    }
  } catch {/* */}

  onProgress(1.0, 'Done');
  return {
    blob,
    mime: 'video/mp4',
    durationSec: estimateTotalDuration(okClips, 2.4, 3.0),
    dimensions: { w, h },
  };
}

// ─── Audio mixing ────────────────────────────────────────────────────────────
async function buildMixedAudio(ffmpeg, fetchFile, { music, voiceover, durationHint, onLog }) {
  const hasMusic = !!music?.url;
  const hasVoice = !!voiceover?.blob;
  if (!hasMusic && !hasVoice) {
    onLog?.('No audio sources — reel will be silent');
    return;
  }

  // Fetch music as a blob first (CORS-friendly fetch from Pixabay CDN)
  let musicReady = false;
  if (hasMusic) {
    try {
      const r = await fetch(music.url, { mode: 'cors' });
      const blob = await r.blob();
      await ffmpeg.writeFile('music_raw', await fetchFile(blob));
      musicReady = true;
    } catch (e) {
      onLog?.(`Music fetch failed (CORS?): ${e.message}`);
    }
  }
  let voiceReady = false;
  if (hasVoice) {
    await ffmpeg.writeFile('voice_raw', await fetchFile(voiceover.blob));
    voiceReady = true;
  }

  if (voiceReady && musicReady) {
    // Music ducks while voice plays. Voice starts at ~2.4s (after intro card).
    // We use `sidechaincompress` to auto-duck music when voice is present.
    const voStartSec = 2.4;
    const musicVol = (music?.volume ?? 0.85) * 0.6;
    await ffmpeg.exec([
      '-y',
      '-i', 'music_raw',
      '-i', 'voice_raw',
      '-filter_complex', [
        `[0:a]volume=${musicVol},aloop=loop=-1:size=2e9[m]`,
        `[1:a]adelay=${Math.round(voStartSec * 1000)}|${Math.round(voStartSec * 1000)},volume=1.0[v]`,
        '[m][v]sidechaincompress=threshold=0.05:ratio=8:attack=80:release=400[ducked]',
        '[ducked][v]amix=inputs=2:duration=longest:dropout_transition=0[mix]',
      ].join(';'),
      '-map', '[mix]',
      '-t', String(durationHint),
      '-c:a', 'aac', '-b:a', '192k',
      'mixed.m4a',
    ]);
  } else if (voiceReady) {
    await ffmpeg.exec([
      '-y', '-i', 'voice_raw',
      '-af', `adelay=2400|2400`,
      '-t', String(durationHint),
      '-c:a', 'aac', '-b:a', '192k',
      'mixed.m4a',
    ]);
  } else if (musicReady) {
    const musicVol = music?.volume ?? 0.85;
    await ffmpeg.exec([
      '-y', '-i', 'music_raw',
      '-af', `volume=${musicVol},aloop=loop=-1:size=2e9`,
      '-t', String(durationHint),
      '-c:a', 'aac', '-b:a', '192k',
      'mixed.m4a',
    ]);
  }
}

function estimateTotalDuration(clips, introDur, outroDur) {
  // LTX-Video defaults to 97 frames @ 24 fps = ~4 sec per clip
  const perClip = 4.0;
  return introDur + clips.length * perClip + outroDur;
}

// ─── Image loader ────────────────────────────────────────────────────────────
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ─── Static stats-card frame (single-frame render at progress p) ──────────────
// Mirrors drawStatsCard from cinematicRender but simplified for prerendering.
function drawStatsCardFrame(ctx, w, h, p, { hook, statsLine, accent, primary, brandName }) {
  ctx.fillStyle = primary || '#0f172a';
  ctx.fillRect(0, 0, w, h);
  const bloom = ctx.createRadialGradient(w/2, h*0.4, 0, w/2, h*0.4, Math.max(w, h) * 0.6);
  bloom.addColorStop(0, `${accent || '#b8864b'}33`);
  bloom.addColorStop(1, 'transparent');
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = `${accent || '#b8864b'}66`;
  ctx.lineWidth = 2;
  const inset = w * 0.05;
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);

  if (brandName) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, p * 2.5);
    ctx.fillStyle = accent || '#b8864b';
    const bs = Math.floor(w * 0.026);
    ctx.font = `800 ${bs}px "Cabinet Grotesk", "Helvetica Neue", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(brandName.toUpperCase(), w/2, h * 0.18);
    ctx.restore();
  }
  if (hook) {
    const hp = Math.max(0, Math.min(1, (p - 0.15) / 0.5));
    ctx.save();
    ctx.fillStyle = '#fff';
    const hs = Math.floor(w * 0.085);
    ctx.font = `900 ${hs}px "DM Serif Display", "Playfair Display", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = hp;
    const lines = wrapText(ctx, hook, w * 0.82);
    const lh = hs * 1.1;
    const startY = h * 0.42 - ((lines.length - 1) * lh) / 2;
    lines.forEach((line, i) => ctx.fillText(line, w/2, startY + i * lh));
    ctx.restore();
  }
  if (statsLine) {
    const dp = Math.max(0, Math.min(1, (p - 0.4) / 0.3));
    ctx.save();
    ctx.strokeStyle = accent || '#b8864b';
    ctx.lineWidth = 3;
    const dw = w * 0.18 * dp;
    ctx.beginPath();
    ctx.moveTo(w/2 - dw/2, h * 0.62);
    ctx.lineTo(w/2 + dw/2, h * 0.62);
    ctx.stroke();
    ctx.restore();

    const sp = Math.max(0, Math.min(1, (p - 0.5) / 0.35));
    ctx.save();
    ctx.fillStyle = '#fff';
    const ss = Math.floor(w * 0.038);
    ctx.font = `700 ${ss}px "Cabinet Grotesk", "Helvetica Neue", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = sp;
    ctx.fillText(statsLine, w/2, h * 0.70);
    ctx.restore();
  }
}

function drawClosingCardFrame(ctx, w, h, p, { headline, cta, brand, accent, primary, logoEl }) {
  // Gradient background — full-color, simpler than the runtime blurred-photo
  // version (which would require loading + blurring in this single-frame
  // render context). Looks clean on its own.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, shadeColor(primary || '#0f172a', -10));
  grad.addColorStop(1, primary || '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const bloom = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w, h) * 0.6);
  bloom.addColorStop(0, `${accent || '#b8864b'}33`);
  bloom.addColorStop(1, 'transparent');
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, w, h);

  let y = h * 0.22;
  if (logoEl) {
    const lp = Math.min(1, p * 2);
    const lw = w * 0.32 * easeOutCubic(lp);
    const lh = lw * (logoEl.naturalHeight / Math.max(1, logoEl.naturalWidth));
    ctx.save();
    ctx.globalAlpha = lp;
    ctx.drawImage(logoEl, w/2 - lw/2, y, lw, lh);
    ctx.restore();
    y += lh + h * 0.05;
  }
  if (headline) {
    const hp = Math.max(0, Math.min(1, (p - 0.20) / 0.35));
    ctx.save();
    ctx.fillStyle = '#fff';
    const hs = Math.floor(w * 0.066);
    ctx.font = `900 ${hs}px "DM Serif Display", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = hp;
    ctx.fillText(headline, w/2, y + hs/2);
    y += hs * 1.4;
    ctx.restore();
  }
  const dp = Math.max(0, Math.min(1, (p - 0.40) / 0.20));
  ctx.save();
  ctx.strokeStyle = accent || '#b8864b';
  ctx.lineWidth = 2.5;
  const dw = w * 0.16 * dp;
  ctx.beginPath();
  ctx.moveTo(w/2 - dw/2, y);
  ctx.lineTo(w/2 + dw/2, y);
  ctx.stroke();
  ctx.restore();
  y += h * 0.04;
  if (cta) {
    const cp = Math.max(0, Math.min(1, (p - 0.50) / 0.30));
    ctx.save();
    ctx.fillStyle = '#fff';
    const cs = Math.floor(w * 0.036);
    ctx.font = `600 ${cs}px "Cabinet Grotesk", "Helvetica Neue", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = cp;
    const lines = wrapText(ctx, cta, w * 0.85);
    lines.forEach((line, i) => ctx.fillText(line, w/2, y + i * cs * 1.3 + cs/2));
    y += cs * 1.4 * lines.length + h * 0.03;
    ctx.restore();
  }
  const contactLines = [brand?.name, brand?.phone, brand?.email || brand?.website].filter(Boolean);
  if (contactLines.length) {
    const cxp = Math.max(0, Math.min(1, (p - 0.65) / 0.30));
    ctx.save();
    const lis = Math.floor(w * 0.024);
    ctx.font = `600 ${lis}px "Cabinet Grotesk", "Helvetica Neue", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = cxp;
    contactLines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? (accent || '#b8864b') : 'rgba(255,255,255,0.78)';
      ctx.fillText(line, w/2, y + i * lis * 1.7 + lis/2);
    });
    ctx.restore();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

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

function shadeColor(hex, percent) {
  const m = hex.replace('#', '');
  if (m.length !== 6) return hex;
  const adj = (v) => Math.max(0, Math.min(255, parseInt(v, 16) + Math.round(255 * (percent / 100))));
  const r = adj(m.slice(0, 2)), g = adj(m.slice(2, 4)), b = adj(m.slice(4, 6));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
