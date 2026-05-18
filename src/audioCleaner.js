// audioCleaner.js — free, in-browser filler-word removal.
// Pipeline:
//   1. Extract audio from video file (FFmpeg.wasm → WAV)
//   2. Transcribe with Whisper-base (Transformers.js) → word-level timestamps
//   3. Detect filler words by text match against FILLERS
//   4. Compute keep-segments (everything BUT fillers, with small padding)
//   5. Re-mux video using FFmpeg's select filter → cleaned MP4
//
// Total cost: 0. First run downloads ~75 MB model from HF CDN, then cached forever.

const FILLERS = new Set([
  'um', 'umm', 'uh', 'uhh', 'er', 'erm',
  'like',        // careful — only filler when standalone/sentence-medial; we'll be conservative
  'so',          // same
  'mhm', 'hmm',
]);

// Phrase fillers (matched on consecutive words, case-insensitive)
const FILLER_PHRASES = [
  ['you', 'know'],
  ['i',   'mean'],
  ['kind','of'],
  ['sort','of'],
];

const PAD_BEFORE = 0.03; // 30 ms before filler
const PAD_AFTER  = 0.05; // 50 ms after filler

// ─── PIPELINE ENTRY ───────────────────────────────────────────────────────────

let _whisperPromise = null;
async function getWhisper(onLog) {
  if (_whisperPromise) return _whisperPromise;
  _whisperPromise = (async () => {
    onLog?.('Loading Whisper-base model (~75 MB, one-time)…');
    const { pipeline, env } = await import('@xenova/transformers');
    // Force WASM, cache models in IndexedDB
    env.allowLocalModels = false;
    env.useBrowserCache  = true;
    const transcriber = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-base.en',
      { quantized: true }
    );
    onLog?.('Whisper loaded.');
    return transcriber;
  })();
  return _whisperPromise;
}

// FFmpeg singleton — shared by audioCleaner + VideoAuto's WebM→MP4 transcoder
let _ffmpegPromise = null;
export async function getFFmpegShared(onLog) { return getFFmpeg(onLog); }
async function getFFmpeg(onLog) {
  if (_ffmpegPromise) return _ffmpegPromise;
  _ffmpegPromise = (async () => {
    onLog?.('Loading FFmpeg…');
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
    const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`,   'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    return { ffmpeg, fetchFile };
  })();
  return _ffmpegPromise;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
// Returns: { cleanedFile: File, removed: number, words: array, fillerSegments: array }
// opts: { onLog, onProgress, denoise: boolean, removeFillers: boolean }
export async function cleanAudio(videoFile, opts = {}) {
  const { onLog, onProgress, denoise = false, removeFillers = true } = opts;
  onProgress?.(0);

  // 1. Extract audio as 16kHz mono WAV (Whisper's preferred input)
  onLog?.('Extracting audio…');
  const { ffmpeg, fetchFile } = await getFFmpeg(onLog);
  const inName  = 'in.mp4';
  const wavName = 'in.wav';
  await ffmpeg.writeFile(inName, await fetchFile(videoFile));
  await ffmpeg.exec(['-i', inName, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavName]);
  const wavData = await ffmpeg.readFile(wavName);
  onProgress?.(0.15);

  // 2. Transcribe with Whisper
  onLog?.('Transcribing speech…');
  const transcriber = await getWhisper(onLog);
  // Convert WAV → Float32Array (skip WAV header)
  const float32 = wavToFloat32(wavData.buffer);
  const result = await transcriber(float32, {
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  onProgress?.(0.55);

  // 3. Parse word-level chunks
  const chunks = result.chunks || [];
  const words = chunks.map(c => ({
    text: (c.text || '').trim().toLowerCase().replace(/[^a-z']/g, ''),
    start: c.timestamp?.[0] ?? 0,
    end:   c.timestamp?.[1] ?? 0,
  })).filter(w => w.text && w.end > w.start);

  onLog?.(`Transcribed ${words.length} words.`);

  // 4. Detect fillers
  const fillerSegments = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];

    // Phrase match (try each phrase)
    let phraseMatched = false;
    for (const phrase of FILLER_PHRASES) {
      if (i + phrase.length <= words.length) {
        const slice = words.slice(i, i + phrase.length).map(x => x.text);
        if (slice.every((t, j) => t === phrase[j])) {
          fillerSegments.push({
            start: Math.max(0, words[i].start - PAD_BEFORE),
            end:   words[i + phrase.length - 1].end + PAD_AFTER,
            word:  phrase.join(' '),
          });
          i += phrase.length - 1;
          phraseMatched = true;
          break;
        }
      }
    }
    if (phraseMatched) continue;

    // Single-word filler
    if (FILLERS.has(w.text)) {
      // Be more conservative with 'like' and 'so' — only flag when sandwiched between speech
      if ((w.text === 'like' || w.text === 'so')) {
        const prev = words[i-1], next = words[i+1];
        // require at least one neighboring word AND short duration (fillers are quick)
        if (!prev || !next || (w.end - w.start) > 0.35) continue;
      }
      fillerSegments.push({
        start: Math.max(0, w.start - PAD_BEFORE),
        end:   w.end + PAD_AFTER,
        word:  w.text,
      });
    }
  }

  onLog?.(`Detected ${fillerSegments.length} filler${fillerSegments.length === 1 ? '' : 's'}.`);
  onProgress?.(0.65);

  // 5a. If no fillers AND no denoise requested → return original (captions = raw words)
  if (fillerSegments.length === 0 && !denoise) {
    try { await ffmpeg.deleteFile(inName); } catch {}
    try { await ffmpeg.deleteFile(wavName); } catch {}
    return {
      cleanedFile: videoFile, removed: 0, words, fillerSegments: [],
      captions: words.map(w => ({ text: w.text, start: w.start, end: w.end })),
    };
  }

  // 5b. If no fillers BUT denoise requested → single-pass denoise
  if (fillerSegments.length === 0 && denoise) {
    onLog?.('Reducing background noise…');
    const outName = 'out.mp4';
    await ffmpeg.exec([
      '-i', inName,
      '-af', 'afftdn=nf=-25:nt=w',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      outName,
    ]);
    const outData = await ffmpeg.readFile(outName);
    try { await ffmpeg.deleteFile(inName); } catch {}
    try { await ffmpeg.deleteFile(wavName); } catch {}
    try { await ffmpeg.deleteFile(outName); } catch {}
    onProgress?.(1);
    return {
      cleanedFile: new File([outData], videoFile.name.replace(/\.\w+$/, '_denoised.mp4'), { type:'video/mp4' }),
      removed: 0, words, fillerSegments: [], denoised: true,
      captions: words.map(w => ({ text: w.text, start: w.start, end: w.end })),
    };
  }

  // 5c. If removeFillers is false, skip cutting (just denoise if requested above)
  if (!removeFillers) {
    fillerSegments.length = 0;
  }

  // 6. Build keep-segments (gaps between fillers)
  const keepSegments = [];
  let cursor = 0;
  const sortedFillers = [...fillerSegments].sort((a, b) => a.start - b.start);
  // merge overlapping fillers
  const merged = [];
  for (const f of sortedFillers) {
    const last = merged[merged.length - 1];
    if (last && f.start <= last.end + 0.02) last.end = Math.max(last.end, f.end);
    else merged.push({ ...f });
  }
  for (const f of merged) {
    if (f.start > cursor) keepSegments.push({ start: cursor, end: f.start });
    cursor = f.end;
  }
  // tail — we'll just trust ffmpeg to end at video end
  keepSegments.push({ start: cursor, end: 999999 });

  // 7. FFmpeg filter: select + atrim+concat keeps
  onLog?.(`Cutting ${merged.length} segment${merged.length === 1 ? '' : 's'}…`);
  const outName = 'out.mp4';
  const filterParts = [];
  keepSegments.forEach((seg, i) => {
    const safeEnd = seg.end > 999998 ? '' : `:end=${seg.end.toFixed(3)}`;
    filterParts.push(`[0:v]trim=start=${seg.start.toFixed(3)}${safeEnd},setpts=PTS-STARTPTS[v${i}];`);
    filterParts.push(`[0:a]atrim=start=${seg.start.toFixed(3)}${safeEnd},asetpts=PTS-STARTPTS[a${i}];`);
  });
  const concatInputs = keepSegments.map((_, i) => `[v${i}][a${i}]`).join('');
  // Apply denoise to the concatenated audio if requested
  if (denoise) {
    filterParts.push(`${concatInputs}concat=n=${keepSegments.length}:v=1:a=1[outv][concatA];`);
    filterParts.push(`[concatA]afftdn=nf=-25:nt=w[outa]`);
  } else {
    filterParts.push(`${concatInputs}concat=n=${keepSegments.length}:v=1:a=1[outv][outa]`);
  }
  const filterComplex = filterParts.join('');

  await ffmpeg.exec([
    '-i', inName,
    '-filter_complex', filterComplex,
    '-map', '[outv]',
    '-map', '[outa]',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '22',
    '-c:a', 'aac',
    '-b:a', '128k',
    outName,
  ]);

  const outData = await ffmpeg.readFile(outName);
  try { await ffmpeg.deleteFile(inName); } catch {}
  try { await ffmpeg.deleteFile(wavName); } catch {}
  try { await ffmpeg.deleteFile(outName); } catch {}

  onProgress?.(1);
  const cleanedFile = new File(
    [outData],
    videoFile.name.replace(/\.\w+$/, '_cleaned.mp4'),
    { type: 'video/mp4' }
  );

  // Build remapped captions for the CLEANED timeline.
  // For each non-filler word, subtract the cumulative filler-duration BEFORE it.
  const captions = [];
  for (const word of words) {
    const inFiller = merged.some(f => word.start >= f.start && word.start < f.end);
    if (inFiller) continue;
    let cut = 0;
    for (const f of merged) {
      if (f.end <= word.start) cut += (f.end - f.start);
    }
    captions.push({
      text: word.text,
      start: Math.max(0, word.start - cut),
      end:   Math.max(0, word.end   - cut),
    });
  }

  return { cleanedFile, removed: merged.length, words, fillerSegments: merged, captions };
}

// ─── TRIM ─────────────────────────────────────────────────────────────────────
// Cut a video to [start, end] using FFmpeg's stream copy when possible.
// Falls back to re-encode if keyframes don't line up cleanly.
export async function trimVideo(videoFile, startSec, endSec, opts = {}) {
  const { onLog, onProgress } = opts;
  const { ffmpeg, fetchFile } = await getFFmpeg(onLog);
  if (onProgress) ffmpeg.on('progress', ({ progress }) => onProgress(progress));
  onLog?.(`Trimming to ${startSec.toFixed(1)}s → ${endSec.toFixed(1)}s…`);
  const inExt = (videoFile.name.match(/\.\w+$/)?.[0] || '.mp4').toLowerCase();
  const inName  = `tin${inExt}`;
  const outName = 'tout.mp4';
  await ffmpeg.writeFile(inName, await fetchFile(videoFile));
  await ffmpeg.exec([
    '-i', inName,
    '-ss', startSec.toFixed(3),
    '-to', endSec.toFixed(3),
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '22',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outName,
  ]);
  const data = await ffmpeg.readFile(outName);
  try { await ffmpeg.deleteFile(inName); } catch {}
  try { await ffmpeg.deleteFile(outName); } catch {}
  return new File([data], videoFile.name.replace(/\.\w+$/, '_trimmed.mp4'), { type:'video/mp4' });
}

// ─── WebM → MP4 TRANSCODE ─────────────────────────────────────────────────────
// Re-encodes a recorded WebM blob into a faststart-ready H.264 MP4 for max
// social-platform compatibility (Instagram, TikTok, Facebook, YouTube).
export async function transcodeWebMtoMP4(webmBlob, opts = {}) {
  const { onLog, onProgress } = opts;
  const { ffmpeg, fetchFile } = await getFFmpeg(onLog);
  if (onProgress) ffmpeg.on('progress', ({ progress }) => onProgress(progress));
  onLog?.('Transcoding to MP4…');
  await ffmpeg.writeFile('in.webm', await fetchFile(webmBlob));
  await ffmpeg.exec([
    '-i', 'in.webm',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    'out.mp4',
  ]);
  const data = await ffmpeg.readFile('out.mp4');
  try { await ffmpeg.deleteFile('in.webm'); } catch {}
  try { await ffmpeg.deleteFile('out.mp4'); } catch {}
  return new Blob([data], { type: 'video/mp4' });
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
// Convert PCM-16 WAV buffer → Float32Array (-1..1), skipping the 44-byte header.
function wavToFloat32(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  // Find data chunk
  let offset = 12;
  while (offset < view.byteLength - 8) {
    const id = String.fromCharCode(
      view.getUint8(offset), view.getUint8(offset+1),
      view.getUint8(offset+2), view.getUint8(offset+3)
    );
    const size = view.getUint32(offset + 4, true);
    if (id === 'data') { offset += 8; break; }
    offset += 8 + size;
  }
  const pcmBytes = view.byteLength - offset;
  const sampleCount = pcmBytes / 2;
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const s = view.getInt16(offset + i*2, true);
    out[i] = s / 32768;
  }
  return out;
}
