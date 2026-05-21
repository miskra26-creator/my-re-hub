// AIStudio.jsx — AI-powered media tools that don't fit cleanly into the
// existing Auto Video Maker. Designed to grow as we add capabilities.
//
// Current tools:
//   1. Smart Clips — Whisper + Claude picks the best 30-sec hooks from a long video
//   2. AI Background Remover (still images) — @imgly/background-removal, MIT, in-browser
//   3. AI Background Replace (still images) — same model + canvas composite
//
// Coming next (placeholders shown in UI so you know what's planned):
//   - Video background replace (MediaPipe Selfie Segmentation, installed)
//   - Voice cloning (ElevenLabs $5/mo when she's ready)
//   - Face smoothing (Facetune-style, MediaPipe FaceMesh)
//   - Multi-format export (one source → 9:16 + 1:1 + 16:9)
//   - B-roll generator (Pexels free API)
//   - AI thumbnail picker (Claude vision picks best frame)

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Sparkles, Image as ImageIcon, Download, Upload, Wand2,
  Scissors, Layers, Lightbulb, RefreshCw, X, Film, Play, Pause, Clock, Target,
  Mic, Volume2,
} from 'lucide-react';
import { cleanAudio, trimVideo } from './audioCleaner';

// ─── BACKGROUND REMOVER ──────────────────────────────────────────────────────
// Loads the imgly model lazily on first use. Subsequent calls reuse the cached
// session, so only the first remove is slow.
let _bgPipelinePromise = null;
async function removeBg(blob, onProgress) {
  if (!_bgPipelinePromise) {
    _bgPipelinePromise = import('@imgly/background-removal');
  }
  const mod = await _bgPipelinePromise;
  const removeBackground = mod.default || mod.removeBackground || mod;
  return removeBackground(blob, {
    progress: (key, current, total) => {
      if (onProgress && total) onProgress(current / total);
    },
    output: { format: 'image/png', quality: 0.92 },
  });
}

// Composite a subject (PNG with alpha) onto a background image (any format).
// Returns a PNG Blob sized to the BACKGROUND's dimensions; the subject is
// scaled to fill the canvas while preserving its aspect ratio.
async function compositeOnBackground(subjectBlob, backgroundBlob) {
  const [subject, background] = await Promise.all([
    blobToImage(subjectBlob),
    blobToImage(backgroundBlob),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = background.naturalWidth;
  canvas.height = background.naturalHeight;
  const ctx = canvas.getContext('2d');
  // Draw bg covering the whole canvas
  ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
  // Scale subject to roughly fit, centered
  const targetH = canvas.height * 0.95;
  const scale = targetH / subject.naturalHeight;
  const sw = subject.naturalWidth * scale;
  const sh = subject.naturalHeight * scale;
  const sx = (canvas.width - sw) / 2;
  const sy = canvas.height - sh; // anchor bottom
  ctx.drawImage(subject, sx, sy, sw, sh);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.92));
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

// ─── SMART CLIPS ─────────────────────────────────────────────────────────────
// Opus Clip equivalent: transcribe a long video with Whisper, then ask Claude
// to pick the best 3-5 hookable short clips for vertical social.

// Reuse audioCleaner's transcription pipeline without doing any cutting.
async function transcribeVideoForClips(file, onLog, onProgress) {
  const result = await cleanAudio(file, {
    onLog, onProgress,
    removeFillers: false,
    denoise: false,
  });
  return result.words || []; // [{text, start, end}]
}

// Ask Claude to identify the best clips from a transcript.
async function askClaudeForClips(words, sourceDurationSec) {
  if (!words.length) throw new Error('No speech detected in this video — pick a clip with someone talking');
  // Compact transcript: timestamps every ~5 words to keep tokens reasonable.
  const lines = [];
  for (let i = 0; i < words.length; i += 5) {
    const slice = words.slice(i, i + 5);
    const text = slice.map(w => w.text).join(' ');
    lines.push(`[${slice[0].start.toFixed(1)}s] ${text}`);
  }
  const transcript = lines.join('\n');

  const prompt = `You are picking the BEST short clips from a longer video transcript for vertical social media (Instagram Reels, TikTok, YouTube Shorts). The speaker is Monica Iskra, a real estate agent.

Source duration: ${sourceDurationSec.toFixed(1)}s
Transcript (timestamps in seconds at the start of every 5 words):
${transcript}

Pick 3-5 clips, each 15-60 seconds long. Each MUST:
- Start with a strong HOOK (a question, a number, a counterintuitive claim, a curiosity gap, a bold opinion)
- Be self-contained (makes sense without prior context)
- End at a natural sentence boundary, NEVER mid-thought
- Have a clear takeaway, lesson, or emotional moment
- Avoid filler-heavy stretches

Return STRICT JSON only — no markdown fences, no commentary, no explanation outside the JSON:
{
  "clips": [
    {
      "rank": 1,
      "start": 12.3,
      "end": 47.8,
      "hook": "the opening line/sentence that grabs attention",
      "platform_fit": "reel",
      "why": "one short sentence on why this hooks",
      "suggested_caption": "a 1-line social caption to post with this clip"
    }
  ]
}

Rank 1 = strongest hook. Order from best to worst.`;

  const r = await fetch('/api/claude/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  const text = (d.content?.[0]?.text || '').trim();
  // Strip any accidental markdown fence
  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(jsonText); }
  catch { throw new Error('AI returned malformed JSON — try again'); }
  return parsed.clips || [];
}

const fmtTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

// ─── UI ──────────────────────────────────────────────────────────────────────
const AIStudio = ({ setPage, toast }) => {
  const [tool, setTool] = useState('smart-clips'); // active tool tab

  return (
    <div className="page-content">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Sparkles size={22} color="#a78bfa" />
          <h1 style={{ margin: 0, fontFamily: "'DM Serif Display',serif", fontSize: 28, fontWeight: 900, color: '#fff' }}>
            AI Studio
          </h1>
          <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 8, background: 'rgba(167,139,250,.15)', color: '#a78bfa' }}>
            FREE · IN-BROWSER
          </span>
        </div>
        <div style={{ fontSize: 14, color: '#94a3b8' }}>
          Open-source AI tools running entirely in your browser. Zero per-use cost. No external API.
        </div>
      </div>

      {/* Tool tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 22, flexWrap: 'wrap' }}>
        {[
          { id: 'smart-clips', label: 'Smart Clips', icon: Target, ready: true },
          { id: 'voice-clone', label: 'Voice Clone (FREE)', icon: Mic, ready: true },
          { id: 'video-bg-replace', label: 'Video BG Replace', icon: Film, ready: true },
          { id: 'pexels-broll', label: 'B-Roll Library', icon: Layers, ready: true },
          { id: 'ai-voice', label: 'AI Voice (Presets)', icon: Volume2, ready: true },
          { id: 'bg-remove', label: 'Background Remover', icon: Scissors, ready: true },
          { id: 'bg-replace', label: 'Background Replace', icon: Layers, ready: true },
          { id: 'roadmap', label: 'What\'s Coming', icon: Lightbulb, ready: true },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            style={{
              padding: '10px 16px', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              border: `1px solid ${tool === t.id ? '#a78bfa' : 'rgba(255,255,255,.1)'}`,
              background: tool === t.id ? 'rgba(167,139,250,.12)' : 'rgba(255,255,255,.02)',
              color: tool === t.id ? '#a78bfa' : '#94a3b8',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {tool === 'smart-clips' && <SmartClipsTool toast={toast} />}
      {tool === 'voice-clone' && <VoiceCloneTool toast={toast} />}
      {tool === 'video-bg-replace' && <VideoBgReplaceTool toast={toast} />}
      {tool === 'pexels-broll' && <PexelsBrollTool toast={toast} />}
      {tool === 'ai-voice' && <AIVoiceTool toast={toast} />}
      {tool === 'bg-remove' && <BackgroundRemoverTool toast={toast} />}
      {tool === 'bg-replace' && <BackgroundReplaceTool toast={toast} />}
      {tool === 'roadmap' && <RoadmapTool setPage={setPage} />}
    </div>
  );
};

// ─── TOOL: PEXELS B-ROLL GENERATOR ───────────────────────────────────────────
// Free stock video search via Pexels API. Pexels allows direct browser calls
// (proper CORS), no proxy needed. User pastes their free API key once.
const PEXELS_KEY_LS = 'pexels_api_key';

const PexelsBrollTool = ({ toast }) => {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(PEXELS_KEY_LS) || '');
  const [keyInput, setKeyInput] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [orientation, setOrientation] = useState('all'); // all, portrait, landscape, square

  const saveKey = () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return toast.error('Paste your Pexels API key first');
    localStorage.setItem(PEXELS_KEY_LS, trimmed);
    setApiKey(trimmed);
    setKeyInput('');
    toast.success('Pexels key saved — start searching');
  };

  const clearKey = () => {
    localStorage.removeItem(PEXELS_KEY_LS);
    setApiKey('');
    setResults([]);
  };

  const search = async () => {
    if (!query.trim()) return toast.error('Type a search query');
    setBusy(true); setResults([]);
    try {
      const params = new URLSearchParams({
        query: query.trim(),
        per_page: '15',
        size: 'medium',
      });
      if (orientation !== 'all') params.set('orientation', orientation);
      const r = await fetch(`https://api.pexels.com/videos/search?${params}`, {
        headers: { Authorization: apiKey },
      });
      if (!r.ok) {
        if (r.status === 401) { clearKey(); throw new Error('Invalid Pexels API key — re-enter it'); }
        throw new Error(`Pexels returned ${r.status}`);
      }
      const data = await r.json();
      setResults(data.videos || []);
      if (!data.videos?.length) toast.info('No results — try a different query');
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };

  const downloadVideo = async (video, file) => {
    try {
      toast.info(`Downloading ${file.width}×${file.height}…`);
      const r = await fetch(file.link);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pexels-${video.id}-${file.width}x${file.height}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      toast.error(`Download failed: ${e.message}`);
    }
  };

  // Show setup card if no key configured
  if (!apiKey) {
    return (
      <div className="glass-card">
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <Film size={28} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 8 }}>B-Roll generator needs a free Pexels API key</div>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 14 }}>
              Pexels gives you <strong style={{ color: '#10b981' }}>free, royalty-free, commercial-use stock video</strong> for life. No card, no monthly fee. You get 200 requests/hour which is way more than you'll use.
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Setup (~2 min):</div>
            <ol style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.8, paddingLeft: 22, marginBottom: 14 }}>
              <li>Go to <a href="https://www.pexels.com/api/" target="_blank" rel="noreferrer" style={{ color: '#7eb8f7' }}>pexels.com/api</a> → click <strong>"Get Started"</strong> → sign up (Google or email)</li>
              <li>Once logged in, click "Your API Key" — a long string starting with letters/numbers</li>
              <li>Paste it below + hit Save</li>
            </ol>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                placeholder="563492ad6f917000010000017a8e7d..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
              />
              <button className="btn btn-blue btn-sm" onClick={saveKey}>Save</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Free B-Roll Video Library</div>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: 'rgba(16,185,129,.15)', color: '#10b981' }}>$0 · Pexels</span>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Royalty-free, commercial-use stock video. Drop into Auto Video Maker as scene clips.</div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={clearKey}>Reset key</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder='Try "luxury home interior", "Livonia Michigan", "modern kitchen", "happy family"…'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
          <select className="select" style={{ width: 140 }} value={orientation} onChange={(e) => setOrientation(e.target.value)}>
            <option value="all">Any aspect</option>
            <option value="portrait">9:16 (Reel/TikTok)</option>
            <option value="landscape">16:9 (YouTube)</option>
            <option value="square">1:1 (IG Post)</option>
          </select>
          <button className="btn btn-blue" onClick={search} disabled={busy}>
            {busy ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Searching…</> : <>Search</>}
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {results.map((v) => {
            const preview = v.video_pictures?.[0]?.picture;
            const sdFile = v.video_files?.find((f) => f.quality === 'sd') || v.video_files?.[0];
            const hdFile = v.video_files?.find((f) => f.quality === 'hd');
            return (
              <div key={v.id} className="glass-card" style={{ padding: 10 }}>
                <div style={{ position: 'relative', aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden', background: '#000', marginBottom: 8 }}>
                  {preview && <img src={preview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  <video
                    src={sdFile?.link}
                    muted
                    loop
                    playsInline
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0, transition: 'opacity .2s' }}
                    onMouseEnter={(e) => { e.target.play().catch(() => {}); e.target.style.opacity = 1; }}
                    onMouseLeave={(e) => { e.target.pause(); e.target.style.opacity = 0; e.target.currentTime = 0; }}
                  />
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  by {v.user?.name || 'Pexels contributor'} · {v.duration}s · {v.width}×{v.height}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {sdFile && <button className="btn btn-ghost btn-xs" style={{ flex: 1 }} onClick={() => downloadVideo(v, sdFile)}><Download size={11} /> SD</button>}
                  {hdFile && <button className="btn btn-blue btn-xs" style={{ flex: 1 }} onClick={() => downloadVideo(v, hdFile)}><Download size={11} /> HD</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!busy && results.length === 0 && query && (
        <div className="glass-card" style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
          No results yet — hit Search above
        </div>
      )}
    </div>
  );
};

// ─── TOOL: VIDEO BACKGROUND REPLACE ──────────────────────────────────────────
// Real-time selfie segmentation via MediaPipe (Google, free, in-browser).
// Pipeline:
//   1. Load source video + backdrop image
//   2. For each frame: segment person from background using selfie_segmenter.tflite
//   3. Composite: draw backdrop, then draw person-only video on top
//   4. Capture canvas stream + source audio → MediaRecorder → WebM
//   5. Download the result
let _segmenterPromise = null;
async function getSegmenter() {
  if (_segmenterPromise) return _segmenterPromise;
  _segmenterPromise = (async () => {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
    );
    const segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
      },
      runningMode: 'VIDEO',
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });
    return segmenter;
  })();
  return _segmenterPromise;
}

// Draw `bgImg` filling the canvas (cover-fit, centered)
function drawCover(ctx, img, w, h) {
  const ia = img.naturalWidth / img.naturalHeight;
  const ca = w / h;
  let dw, dh, dx, dy;
  if (ia > ca) {
    dh = h; dw = h * ia; dx = (w - dw) / 2; dy = 0;
  } else {
    dw = w; dh = w / ia; dx = 0; dy = (h - dh) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}

const VideoBgReplaceTool = ({ toast }) => {
  const [sourceVideo, setSourceVideo] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [backdrop, setBackdrop] = useState(null);
  const [backdropUrl, setBackdropUrl] = useState('');
  const [outputUrl, setOutputUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('idle'); // idle | loading | processing | done
  const [logLines, setLogLines] = useState([]);
  const videoRef = useRef();
  const canvasRef = useRef();
  const sourceInputRef = useRef();
  const bgInputRef = useRef();

  const log = (m) => setLogLines((p) => [...p.slice(-4), m]);

  const pickSource = (file) => {
    if (!file) return;
    if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
      return toast.error('Pick a video file (MP4, MOV, WebM)');
    }
    setSourceVideo(file);
    setSourceUrl(URL.createObjectURL(file));
    setOutputUrl('');
    setStage('idle');
  };

  const pickBg = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Pick an image (JPG, PNG)');
    setBackdrop(file);
    setBackdropUrl(URL.createObjectURL(file));
    setOutputUrl('');
    setStage('idle');
  };

  const run = async () => {
    if (!sourceVideo) return toast.error('Pick a video first');
    if (!backdrop) return toast.error('Pick a backdrop image');
    setStage('loading');
    setOutputUrl('');
    setLogLines([]);
    setProgress(0);
    try {
      log('Loading MediaPipe selfie segmenter (first run downloads ~5 MB model)…');
      const segmenter = await getSegmenter();

      log('Loading backdrop image…');
      const bgImg = await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error('Could not decode backdrop image'));
        img.src = backdropUrl;
      });

      log('Preparing video…');
      const video = videoRef.current;
      video.muted = true; // we'll mute playback but capture audio track separately
      await new Promise((res, rej) => {
        const onMeta = () => { video.removeEventListener('error', onErr); res(); };
        const onErr = () => { video.removeEventListener('loadedmetadata', onMeta); rej(new Error('Could not decode source video')); };
        video.addEventListener('loadedmetadata', onMeta, { once: true });
        video.addEventListener('error', onErr, { once: true });
      });

      const w = video.videoWidth;
      const h = video.videoHeight;
      const canvas = canvasRef.current;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      // Off-screen canvas to hold the masked person frame
      const personCanvas = document.createElement('canvas');
      personCanvas.width = w; personCanvas.height = h;
      const personCtx = personCanvas.getContext('2d', { willReadFrequently: true });

      // ── Set up recording ──
      const canvasStream = canvas.captureStream(30);
      let videoAudioStream = null;
      try {
        if (video.captureStream) videoAudioStream = video.captureStream();
        else if (video.mozCaptureStream) videoAudioStream = video.mozCaptureStream();
      } catch (e) {
        log('(no audio capture available — output will be silent)');
      }
      if (videoAudioStream) {
        videoAudioStream.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
      }
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';
      const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 5_000_000 });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      const recordingDone = new Promise((res) => { recorder.onstop = () => res(); });

      // ── Per-frame loop ──
      setStage('processing');
      log(`Processing ${video.duration.toFixed(1)}s of video at ${w}×${h}…`);
      video.currentTime = 0;

      // Determine which mask value = background. Selfie segmenter typically:
      //   0 = background, 255 = person — but with outputCategoryMask we get
      //   class indices (0 or 1). Detect at first frame.
      let bgValue = 0;

      const processFrame = () => {
        // Stop condition
        if (video.paused || video.ended) return;

        // Run segmenter on current frame
        const t = performance.now();
        const result = segmenter.segmentForVideo(video, t);
        const mask = result.categoryMask;
        const maskData = mask.getAsUint8Array ? mask.getAsUint8Array() : mask.data || new Uint8Array(0);

        // 1. Draw backdrop covering canvas
        drawCover(ctx, bgImg, w, h);

        // 2. Draw video frame to person canvas + apply mask alpha
        personCtx.drawImage(video, 0, 0, w, h);
        if (maskData.length > 0) {
          const imageData = personCtx.getImageData(0, 0, w, h);
          const d = imageData.data;
          // First frame: detect which value is background (whichever covers >50% of pixels)
          if (video.currentTime < 0.1) {
            let countZero = 0;
            for (let i = 0; i < maskData.length; i++) if (maskData[i] === 0) countZero++;
            bgValue = countZero > maskData.length / 2 ? 0 : 255;
          }
          for (let i = 0; i < maskData.length; i++) {
            if (maskData[i] === bgValue) d[i * 4 + 3] = 0; // transparent → backdrop shows through
          }
          personCtx.putImageData(imageData, 0, 0);
        }
        // 3. Composite person over backdrop
        ctx.drawImage(personCanvas, 0, 0);

        try { mask.close(); } catch {}

        if (video.duration) setProgress(Math.min(1, video.currentTime / video.duration));

        requestAnimationFrame(processFrame);
      };

      // Start everything
      recorder.start(100); // ms timeslice — keeps chunks coming
      await video.play();
      requestAnimationFrame(processFrame);

      // Wait for video to finish
      await new Promise((res) => {
        const onEnd = () => { video.removeEventListener('ended', onEnd); res(); };
        video.addEventListener('ended', onEnd);
      });

      // Stop recording
      recorder.stop();
      await recordingDone;

      const blob = new Blob(chunks, { type: 'video/webm' });
      setOutputUrl(URL.createObjectURL(blob));
      setStage('done');
      setProgress(1);
      log('Done — output ready below.');
      toast.success('Background replaced — preview + download below');
    } catch (e) {
      console.error('[VideoBgReplace]', e);
      toast.error(`Failed: ${e.message}`);
      setStage('idle');
    }
  };

  const download = () => {
    if (!outputUrl) return;
    const a = document.createElement('a');
    a.href = outputUrl;
    const base = (sourceVideo?.name || 'video').replace(/\.\w+$/, '');
    a.download = `${base}-bgreplace-${Date.now()}.webm`;
    a.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="glass-card">
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Replace the background of your video</div>
            <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: 'rgba(16,185,129,.15)', color: '#10b981' }}>$0 · MediaPipe</span>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Film yourself talking, then drop in any property photo as the backdrop. Runs locally in your browser — no upload, no third-party server, no cost.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          {/* Source video picker */}
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Step 1 — Selfie video (you talking)</div>
            <input ref={sourceInputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => pickSource(e.target.files?.[0])} />
            {sourceUrl ? (
              <div style={{ padding: 8, borderRadius: 10, background: 'rgba(167,139,250,.06)', border: '1px solid rgba(167,139,250,.2)' }}>
                <video ref={videoRef} src={sourceUrl} controls muted style={{ width: '100%', borderRadius: 6, background: '#000' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{sourceVideo?.name}</span>
                  <button className="btn btn-ghost btn-xs" onClick={() => { setSourceVideo(null); setSourceUrl(''); setOutputUrl(''); }}><X size={11} /> Remove</button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => sourceInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); pickSource(e.dataTransfer.files?.[0]); }}
                style={{ padding: 28, border: '2px dashed rgba(167,139,250,.3)', borderRadius: 10, background: 'rgba(167,139,250,.04)', textAlign: 'center', cursor: 'pointer' }}
              >
                <Film size={26} color="#a78bfa" style={{ marginBottom: 6 }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Drop or click to pick a video</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>MP4, MOV, WebM — keep it short for first try (5-15 sec)</div>
              </div>
            )}
          </div>

          {/* Backdrop image picker */}
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Step 2 — Backdrop (property photo, etc.)</div>
            <input ref={bgInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => pickBg(e.target.files?.[0])} />
            {backdropUrl ? (
              <div style={{ padding: 8, borderRadius: 10, background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.2)' }}>
                <img src={backdropUrl} alt="backdrop" style={{ width: '100%', borderRadius: 6, aspectRatio: '16/9', objectFit: 'cover' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{backdrop?.name}</span>
                  <button className="btn btn-ghost btn-xs" onClick={() => { setBackdrop(null); setBackdropUrl(''); setOutputUrl(''); }}><X size={11} /> Remove</button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => bgInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); pickBg(e.dataTransfer.files?.[0]); }}
                style={{ padding: 28, border: '2px dashed rgba(16,185,129,.3)', borderRadius: 10, background: 'rgba(16,185,129,.04)', textAlign: 'center', cursor: 'pointer' }}
              >
                <ImageIcon size={26} color="#10b981" style={{ marginBottom: 6 }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Drop or click to pick a backdrop</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>JPG, PNG, WebP — listing photo, room shot, anything</div>
              </div>
            )}
          </div>
        </div>

        {/* Hidden canvas where the composite is rendered */}
        <canvas ref={canvasRef} style={{ display: stage === 'processing' || stage === 'done' ? 'block' : 'none', width: '100%', maxHeight: 360, borderRadius: 10, background: '#000', marginBottom: 12 }} />

        <button className="btn btn-blue" onClick={run} disabled={!sourceVideo || !backdrop || stage === 'loading' || stage === 'processing'} style={{ padding: '12px 16px', fontSize: 14 }}>
          {stage === 'loading' && <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Loading…</>}
          {stage === 'processing' && <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Processing {Math.round(progress * 100)}%</>}
          {(stage === 'idle' || stage === 'done') && <><Wand2 size={13} /> {stage === 'done' ? 'Run Again' : 'Replace Background'}</>}
        </button>

        {(stage === 'processing' || stage === 'loading') && (
          <div style={{ marginTop: 10 }}>
            <div style={{ height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ height: '100%', width: `${Math.round(progress * 100)}%`, background: '#a78bfa', transition: 'width .2s' }} />
            </div>
            {logLines.map((l, i) => (
              <div key={i} style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>· {l}</div>
            ))}
          </div>
        )}

        {outputUrl && (
          <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', marginBottom: 8 }}>✓ Output ready</div>
            <video src={outputUrl} controls style={{ width: '100%', borderRadius: 6, background: '#000', marginBottom: 8 }} />
            <button className="btn btn-blue btn-sm" onClick={download}><Download size={12} /> Download WebM</button>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
              Output is WebM (smaller, plays on all browsers). For Instagram/TikTok, convert to MP4 first — or paste this into the Auto Video Maker which renders to MP4.
            </div>
          </div>
        )}
      </div>

      <div className="glass-card" style={{ background: 'rgba(245,158,11,.04)', borderColor: 'rgba(245,158,11,.2)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ fontSize: 20 }}>💡</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Tips for the best result</div>
            <ul style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
              <li>Film with your face well-lit — segmentation is most accurate when there's contrast between you and your real background</li>
              <li>Avoid wearing colors that match your real background (e.g., dark shirt against dark wall) — the AI may confuse you with the wall</li>
              <li>Keep the video short (5-30 sec) for first try — processing runs at real-time speed, so a 30-sec clip takes ~30 sec</li>
              <li>Backdrop image works best at 16:9 or matching your video's aspect ratio; the AI auto-crops to fit</li>
              <li>Output is WebM — to post to Instagram/TikTok, transcode to MP4 first (Auto Video Maker can do this)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── TOOL: SMART CLIPS ───────────────────────────────────────────────────────
// Upload a long video → Whisper transcribes → Claude picks the best 3-5
// hookable short clips → trimVideo cuts each to its own MP4 on demand.
const SmartClipsTool = ({ toast }) => {
  const [source, setSource] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [clips, setClips] = useState([]);
  const [stage, setStage] = useState('idle'); // idle | transcribing | thinking | done
  const [progress, setProgress] = useState(0);
  const [logLines, setLogLines] = useState([]);
  const [downloadingIdx, setDownloadingIdx] = useState(null);
  const [previewingIdx, setPreviewingIdx] = useState(null);
  const videoRef = useRef();
  const inputRef = useRef();
  const previewEndRef = useRef(0);

  const log = (m) => setLogLines(prev => [...prev.slice(-3), m]);

  const pick = (file) => {
    if (!file) return;
    if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
      toast.error('Pick a video file (MP4 / MOV / WebM)');
      return;
    }
    setSource(file);
    setSourceUrl(URL.createObjectURL(file));
    setClips([]); setStage('idle'); setProgress(0); setLogLines([]);
  };

  // When video metadata loads, capture duration so Claude can reason about positions.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => setDuration(v.duration || 0);
    v.addEventListener('loadedmetadata', onMeta);
    return () => v.removeEventListener('loadedmetadata', onMeta);
  }, [sourceUrl]);

  // While previewing a clip, pause when we hit the clip's end timestamp.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (previewingIdx !== null && previewEndRef.current && v.currentTime >= previewEndRef.current) {
        v.pause();
        setPreviewingIdx(null);
      }
    };
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [previewingIdx]);

  const run = async () => {
    if (!source) return toast.error('Pick a video first');
    setStage('transcribing');
    setProgress(0); setLogLines([]); setClips([]);
    try {
      log('Loading Whisper model (first run downloads ~75 MB)…');
      const words = await transcribeVideoForClips(source, log, (p) => setProgress(p * 0.7));
      if (!words.length) throw new Error('No speech detected — pick a clip with someone talking');
      log(`Transcribed ${words.length} words.`);
      setStage('thinking');
      log('AI is picking the best hookable moments…');
      const dur = duration || words[words.length - 1].end + 1;
      const picked = await askClaudeForClips(words, dur);
      setProgress(1);
      if (!picked.length) throw new Error('AI couldn\'t find a strong hook — try a longer clip or different content');
      setClips(picked);
      setStage('done');
      log(`Found ${picked.length} candidate clips.`);
      toast.success(`Found ${picked.length} hookable clips`);
    } catch (e) {
      console.error(e);
      toast.error(e.message);
      setStage('idle');
    }
  };

  const preview = (clip, idx) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = clip.start;
    previewEndRef.current = clip.end;
    setPreviewingIdx(idx);
    v.play();
  };

  const stopPreview = () => {
    const v = videoRef.current;
    if (v) v.pause();
    setPreviewingIdx(null);
  };

  const download = async (clip, idx) => {
    if (!source) return;
    setDownloadingIdx(idx);
    try {
      const file = await trimVideo(source, clip.start, clip.end, {
        onLog: (m) => log(m),
      });
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clip${clip.rank}-${Math.round(clip.start)}-${Math.round(clip.end)}s.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success(`Clip ${clip.rank} downloaded`);
    } catch (e) {
      toast.error(`Trim failed: ${e.message}`);
    }
    setDownloadingIdx(null);
  };

  const copyCaption = (clip) => {
    if (!clip.suggested_caption) return;
    navigator.clipboard.writeText(clip.suggested_caption);
    toast.success('Caption copied');
  };

  const reset = () => {
    setSource(null); setSourceUrl(''); setClips([]);
    setStage('idle'); setProgress(0); setLogLines([]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="glass-card">
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
            Drop in a long video — get the 3-5 best hookable clips for social
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Filmed a 5-min walkthrough? A 10-min open-house tour? Record once, Whisper transcribes the speech, Claude picks the moments most likely to stop the scroll, and each gets trimmed into its own MP4 ready to post.
          </div>
        </div>

        <input ref={inputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={e => pick(e.target.files?.[0])} />

        {!source && (
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
            style={{
              padding: 40, border: '2px dashed rgba(167,139,250,.3)', borderRadius: 14,
              background: 'rgba(167,139,250,.04)', textAlign: 'center', cursor: 'pointer',
            }}
          >
            <Film size={32} color="#a78bfa" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              Drop a video here, or click to pick one
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>MP4 · MOV · WebM — runs locally, video never leaves your browser</div>
          </div>
        )}

        {source && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
            <div>
              <video
                ref={videoRef}
                src={sourceUrl}
                controls
                style={{ width: '100%', borderRadius: 12, background: '#000', maxHeight: 320 }}
              />
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                {source.name} · {duration ? fmtTime(duration) : '…'} · {(source.size / 1024 / 1024).toFixed(1)} MB
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {stage === 'idle' && (
                <>
                  <button className="btn btn-blue" onClick={run} style={{ fontSize: 14, padding: '12px 16px' }}>
                    <Wand2 size={14} /> Find Best Clips
                  </button>
                  <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
                    First-run cost: ~75 MB Whisper model download. After that it's ~10-30 sec per minute of video.
                  </div>
                </>
              )}
              {(stage === 'transcribing' || stage === 'thinking') && (
                <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(167,139,250,.06)', border: '1px solid rgba(167,139,250,.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <RefreshCw size={14} color="#a78bfa" style={{ animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                      {stage === 'transcribing' ? 'Transcribing speech…' : 'AI picking best moments…'}
                    </span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', width: `${Math.round(progress * 100)}%`, background: '#a78bfa', transition: 'width .3s' }} />
                  </div>
                  {logLines.map((l, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginTop: 2 }}>· {l}</div>
                  ))}
                </div>
              )}
              {stage === 'done' && (
                <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#10b981' }}>✓ {clips.length} clips ready below</div>
                  <button className="btn btn-ghost btn-xs" style={{ marginTop: 8 }} onClick={reset}>
                    <X size={11} /> Start over with a new video
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {clips.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {clips.map((c, idx) => {
            const isPreviewing = previewingIdx === idx;
            const isDownloading = downloadingIdx === idx;
            return (
              <div
                key={idx}
                className="glass-card"
                style={{ padding: 16, borderLeft: `3px solid ${c.rank === 1 ? '#10b981' : c.rank === 2 ? '#7eb8f7' : '#a78bfa'}` }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 8, background: c.rank === 1 ? 'rgba(16,185,129,.15)' : 'rgba(167,139,250,.15)', color: c.rank === 1 ? '#10b981' : '#a78bfa' }}>
                        #{c.rank} {c.rank === 1 ? '· BEST' : ''}
                      </span>
                      <span style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} /> {fmtTime(c.start)} → {fmtTime(c.end)} ({(c.end - c.start).toFixed(1)}s)
                      </span>
                      {c.platform_fit && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,.05)', color: '#64748b', textTransform: 'uppercase' }}>{c.platform_fit}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6, lineHeight: 1.4 }}>
                      "{c.hook}"
                    </div>
                    {c.why && <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginBottom: 6 }}>Why it hooks: {c.why}</div>}
                    {c.suggested_caption && (
                      <div style={{ fontSize: 12, color: '#cbd5e1', padding: '8px 10px', background: 'rgba(255,255,255,.03)', borderRadius: 8, marginTop: 6, position: 'relative' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>Suggested caption</div>
                        {c.suggested_caption}
                        <button className="btn btn-ghost btn-xs" style={{ position: 'absolute', top: 6, right: 6 }} onClick={() => copyCaption(c)}>Copy</button>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    {!isPreviewing ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => preview(c, idx)}>
                        <Play size={12} /> Preview
                      </button>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={stopPreview}>
                        <Pause size={12} /> Stop
                      </button>
                    )}
                    <button className="btn btn-blue btn-sm" disabled={isDownloading} onClick={() => download(c, idx)}>
                      {isDownloading ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Trimming…</> : <><Download size={12} /> Download MP4</>}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── TOOL: VOICE CLONE (free, F5-TTS — local PC preferred, HF Space fallback) ─
// Apache-2.0 licensed model. Two backends:
//   1. LOCAL — your own Python server at localhost:7860 (tools/voice-clone-server)
//              100% reliable, offline, no third party. RECOMMENDED.
//   2. HF SPACE — fallback if the local server isn't running. Free but flaky.
const HF_SPACE_F5 = 'mrfakename/E2-F5-TTS'; // unused (HF Space fallback removed) — kept for old cloneVoice fn
const LOCAL_VOICE_URL = 'http://localhost:7860';
const REMOTE_VOICE_LS_KEY = 'voice_clone_remote_url'; // localStorage key for remote URL

// Monica's deployed Modal endpoint (single FastAPI app at /health and /clone).
// First page load auto-saves it as her remote URL so she doesn't paste anything.
const DEFAULT_REMOTE_URL = 'https://miskra26--api.modal.run';

// Migration: if she has the OLD Modal URL (separate --clone.modal.run from
// the first deploy) saved from before, replace it with the new --api.modal.run.
(function autoSaveDefaultRemoteUrl() {
  try {
    if (typeof window === 'undefined') return;
    const existing = localStorage.getItem(REMOTE_VOICE_LS_KEY) || '';
    if (!existing || existing.includes('--clone.modal.run') || existing.includes('--health.modal.run')) {
      localStorage.setItem(REMOTE_VOICE_LS_KEY, DEFAULT_REMOTE_URL);
    }
  } catch {}
})();

// Probe a voice-server URL. Returns {ok, device, model_loaded, url} or null.
// Both local Flask server and the new Modal FastAPI app expose /health.
async function probeVoiceServer(url) {
  if (!url) return null;
  try {
    const base = url.replace(/\/+$/, '');
    const r = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data?.ok ? { ...data, url: base } : null;
  } catch {
    return null;
  }
}

// Convert browser-recorded WebM/opus to WAV so the local F5-TTS server can
// read it (soundfile doesn't handle WebM). Uses the FFmpeg already loaded by
// the audio cleaner module — no extra download.
async function webmToWav(file) {
  if (!file.type.includes('webm') && !/\.(webm|opus)$/i.test(file.name)) return file;
  const { getFFmpegShared } = await import('./audioCleaner');
  const { ffmpeg, fetchFile } = await getFFmpegShared();
  const inName = `vref_${Date.now()}.webm`;
  const outName = `vref_${Date.now()}.wav`;
  await ffmpeg.writeFile(inName, await fetchFile(file));
  await ffmpeg.exec(['-i', inName, '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', outName]);
  const data = await ffmpeg.readFile(outName);
  try { await ffmpeg.deleteFile(inName); } catch {}
  try { await ffmpeg.deleteFile(outName); } catch {}
  return new File([data], 'ref.wav', { type: 'audio/wav' });
}

// Talk to a F5-TTS server. Both local Flask and Modal FastAPI accept
// multipart form data at /clone, so one code path.
async function cloneVoiceLocal({ refAudio, refText, genText, onLog, serverUrl }) {
  const url = (serverUrl || LOCAL_VOICE_URL).replace(/\/+$/, '');
  onLog?.('Converting reference audio to WAV…');
  const wavRef = await webmToWav(refAudio);
  onLog?.(`Sending to F5-TTS server (${url})…`);

  const fd = new FormData();
  fd.append('ref_audio', wavRef);
  fd.append('ref_text', refText || '');
  fd.append('gen_text', genText);
  const r = await fetch(`${url}/clone`, { method: 'POST', body: fd });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || err.detail || `Voice server returned ${r.status}`);
  }
  return await r.blob();
}

let _gradioClient = null;
async function getGradioClient() {
  if (_gradioClient) return _gradioClient;
  const mod = await import('@gradio/client');
  _gradioClient = mod;
  return mod;
}

async function cloneVoice({ refAudio, refText, genText, onLog }) {
  onLog?.('Loading gradio client…');
  let mod;
  try {
    mod = await getGradioClient();
  } catch (e) {
    console.error('[cloneVoice] gradio import failed', e);
    throw new Error(`Couldn't load gradio client: ${e.message}`);
  }
  // @gradio/client has shipped both `Client` (v1+) and `client` (v0) over its
  // life. Whichever one exists, find it.
  const Client = mod?.Client || mod?.default?.Client || mod?.client || mod?.default;
  if (!Client || typeof Client.connect !== 'function') {
    console.error('[cloneVoice] unexpected gradio shape', mod);
    throw new Error('Gradio client library is in an unexpected shape — try refreshing the page, or `npm install @gradio/client` again');
  }

  onLog?.('Connecting to free voice clone server…');
  let app;
  try {
    app = await Client.connect(HF_SPACE_F5);
  } catch (e) {
    console.error('[cloneVoice] connect failed', e);
    throw new Error(`Couldn't reach the free voice server (${e.message || e}). HF Spaces can sleep when idle — try again in 30 sec, or check status.huggingface.co.`);
  }

  onLog?.('Cloning voice…');

  // Try multiple endpoint+arg shapes — the F5-TTS Space has shipped under
  // different api_names over time (/basic_tts, /infer, /predict, fn_index 0).
  const argShapes = [
    {
      ref_audio_input: refAudio,
      ref_text_input: refText || '',
      gen_text_input: genText,
      remove_silence: true,
      cross_fade_duration_slider: 0.15,
      nfe_slider: 32,
      speed_slider: 1.0,
    },
    // Positional fallback
    [refAudio, refText || '', genText, true, 0.15, 32, 1.0],
  ];
  const endpoints = ['/basic_tts', '/infer', '/predict', 0];

  let result, lastErr;
  outer: for (const ep of endpoints) {
    for (const args of argShapes) {
      try {
        result = await app.predict(ep, args);
        if (result) break outer;
      } catch (e) {
        lastErr = e;
        console.warn(`[cloneVoice] predict(${ep}) failed, trying next shape:`, e.message || e);
      }
    }
  }
  if (!result) {
    console.error('[cloneVoice] all predict shapes failed', lastErr);
    throw new Error(`Voice server didn't accept our request. Last error: ${lastErr?.message || lastErr}. The Space's API may have changed.`);
  }

  // Result data[0] is usually the output audio (URL string or {url, path}).
  const out = Array.isArray(result?.data) ? result.data[0] : result?.data;
  if (!out) {
    console.error('[cloneVoice] empty result', result);
    throw new Error('Voice server returned an empty result');
  }
  const audioUrl = typeof out === 'string' ? out : (out.url || out.path);
  if (!audioUrl) {
    console.error('[cloneVoice] unexpected output shape', out);
    throw new Error('Voice server returned unexpected output format');
  }
  // Some Spaces return relative paths; resolve against the Space domain.
  const fullUrl = audioUrl.startsWith('http')
    ? audioUrl
    : `https://${HF_SPACE_F5.replace('/', '-')}.hf.space/file=${audioUrl.replace(/^\//, '')}`;
  const audioRes = await fetch(fullUrl);
  if (!audioRes.ok) throw new Error(`Couldn't fetch generated audio: ${audioRes.status}`);
  return await audioRes.blob();
}

// In-page mic recorder. Returns the recorded file via onComplete.
const MicRecorder = ({ onComplete, onCancel, toast, maxSeconds = 30 }) => {
  const [stream, setStream] = useState(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef();
  const audioCtxRef = useRef();
  const rafRef = useRef();

  // Initialize mic on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
        });
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        setStream(s);
        // Audio level meter
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const src = ac.createMediaStreamSource(s);
        const analyser = ac.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        audioCtxRef.current = ac;
        const arr = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(arr);
          let max = 0;
          for (let i = 0; i < arr.length; i++) {
            const v = Math.abs(arr[i] - 128) / 128;
            if (v > max) max = v;
          }
          setLevel(max);
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        toast.error('Mic permission denied. Allow microphone access in your browser and try again.');
        onCancel?.();
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      clearInterval(timerRef.current);
      stream?.getTracks().forEach(t => t.stop());
      try { audioCtxRef.current?.close(); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = () => {
    if (!stream) return;
    chunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    r.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    r.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
      onComplete?.(file);
    };
    r.start();
    recorderRef.current = r;
    setRecording(true);
    setSeconds(0);
    timerRef.current = setInterval(() => {
      setSeconds(prev => {
        const next = prev + 1;
        if (next >= maxSeconds) {
          // auto-stop at the max
          stop();
        }
        return next;
      });
    }, 1000);
  };

  const stop = () => {
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') r.stop();
    clearInterval(timerRef.current);
    setRecording(false);
  };

  const cancel = () => {
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') r.stop();
    clearInterval(timerRef.current);
    stream?.getTracks().forEach(t => t.stop());
    onCancel?.();
  };

  const remaining = Math.max(0, maxSeconds - seconds);
  const pct = Math.min(100, (seconds / maxSeconds) * 100);
  const levelPct = Math.min(100, level * 200); // scale up for visibility

  return (
    <div style={{ padding: 20, background: 'rgba(167,139,250,.06)', borderRadius: 12, border: '1px solid rgba(167,139,250,.25)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
          {recording ? '🔴 Recording…' : stream ? 'Mic ready — click Start' : 'Asking for mic permission…'}
        </div>
        <button className="btn btn-ghost btn-xs" onClick={cancel}><X size={11} /> Cancel</button>
      </div>

      {/* Audio level meter */}
      <div style={{ height: 16, background: 'rgba(255,255,255,.04)', borderRadius: 99, overflow: 'hidden', marginBottom: 14, position: 'relative' }}>
        <div style={{
          height: '100%',
          width: `${levelPct}%`,
          background: levelPct > 80 ? '#f87171' : levelPct > 30 ? '#10b981' : '#a78bfa',
          transition: 'width .05s linear, background .15s',
        }} />
        {!recording && stream && level < 0.02 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#64748b', fontWeight: 700 }}>
            Say something to test your mic
          </div>
        )}
      </div>

      {/* Timer + progress */}
      {recording && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: "'DM Serif Display',serif" }}>
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            </span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{remaining}s remaining (auto-stops at {maxSeconds}s)</span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,.04)', borderRadius: 99, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: '#a78bfa', transition: 'width 1s linear' }} />
          </div>
        </>
      )}

      {/* Tips */}
      {!recording && stream && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14, lineHeight: 1.5 }}>
          💡 <strong style={{ color: '#cbd5e1' }}>For best clone quality:</strong> speak naturally for 15-30 sec. Read a few sentences (e.g. "Hi, this is Monica with RE/MAX Classic. I help families find home in Livonia and Metro Detroit.") Avoid background noise.
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8 }}>
        {!recording ? (
          <button className="btn btn-blue" onClick={start} disabled={!stream} style={{ flex: 1 }}>
            <Mic size={13} /> Start Recording
          </button>
        ) : (
          <button className="btn btn-blue" onClick={stop} style={{ flex: 1 }}>
            <Pause size={13} /> Stop & Use This
          </button>
        )}
      </div>
    </div>
  );
};

const VoiceCloneTool = ({ toast }) => {
  const [refFile, setRefFile] = useState(null);
  const [refUrl, setRefUrl] = useState('');
  const [refText, setRefText] = useState('');
  const [genText, setGenText] = useState('');
  const [output, setOutput] = useState(null);
  const [outputUrl, setOutputUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [logLines, setLogLines] = useState([]);
  const [recording, setRecording] = useState(false);
  const [serverStatus, setServerStatus] = useState('checking'); // 'checking' | 'local' | 'remote' | 'offline'
  const [serverInfo, setServerInfo] = useState(null); // { ok, device, model, url }
  const [activeServerUrl, setActiveServerUrl] = useState('');
  const [remoteUrl, setRemoteUrl] = useState(() => localStorage.getItem(REMOTE_VOICE_LS_KEY) || '');
  const [remoteUrlInput, setRemoteUrlInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [lastUsedBackend, setLastUsedBackend] = useState('');
  const refInput = useRef();

  // Probe BOTH local (this PC) AND remote (Modal / Tailscale URL if configured).
  // Prefer REMOTE when it's a GPU endpoint (Modal) — far faster than local CPU.
  // Fall back to LOCAL if remote is offline.
  const probeLocal = useCallback(async () => {
    setServerStatus('checking');
    const savedRemote = localStorage.getItem(REMOTE_VOICE_LS_KEY) || '';
    if (savedRemote) {
      const remoteInfo = await probeVoiceServer(savedRemote);
      if (remoteInfo) {
        setServerInfo(remoteInfo);
        setActiveServerUrl(remoteInfo.url);
        setServerStatus('remote');
        return 'remote';
      }
    }
    const localInfo = await probeVoiceServer(LOCAL_VOICE_URL);
    if (localInfo) {
      setServerInfo(localInfo);
      setActiveServerUrl(LOCAL_VOICE_URL);
      setServerStatus('local');
      return 'local';
    }
    setServerInfo(null);
    setActiveServerUrl('');
    setServerStatus('offline');
    return 'offline';
  }, []);
  useEffect(() => { probeLocal(); }, [probeLocal]);

  const saveRemoteUrl = async () => {
    const trimmed = remoteUrlInput.trim().replace(/\/+$/, '');
    if (!trimmed) {
      localStorage.removeItem(REMOTE_VOICE_LS_KEY);
      setRemoteUrl('');
      toast?.success?.('Remote URL cleared');
      probeLocal();
      return;
    }
    // Auto-add http:// if user didn't include scheme.
    const url = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    // Test it before saving.
    const info = await probeVoiceServer(url);
    if (info) {
      localStorage.setItem(REMOTE_VOICE_LS_KEY, url);
      setRemoteUrl(url);
      toast?.success?.(`Remote server reachable (${info.device}). Saved.`);
      probeLocal();
      setShowSettings(false);
    } else {
      toast?.error?.(`Couldn't reach ${url}/health. Check the hostname + that the server is running + Tailscale is connected on both machines.`);
    }
  };

  const pickRef = (file) => {
    if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|ogg)$/i.test(file.name)) {
      return toast.error('Pick an audio file (.mp3, .wav, .m4a)');
    }
    setRefFile(file);
    setRefUrl(URL.createObjectURL(file));
    setOutput(null); setOutputUrl('');
  };

  const log = (m) => setLogLines(prev => [...prev.slice(-3), m]);

  const [errorDetail, setErrorDetail] = useState('');

  const generate = async () => {
    if (!refFile) return toast?.error?.('Record or upload a sample of your voice first');
    if (!genText.trim()) return toast?.error?.('Type what you want the cloned voice to say');
    setBusy(true);
    setLogLines([]);
    setOutput(null); setOutputUrl('');
    setErrorDetail('');
    setLastUsedBackend('');

    // Re-probe the local server one more time in case she just started it.
    let fresh = serverStatus;
    if (fresh !== 'local') fresh = await probeLocal();

    // Strategy: F5-TTS server (local on this PC OR remote via Tailscale) first
    // if reachable, else HF Space.
    const tryServer = async () => {
      const blob = await cloneVoiceLocal({
        refAudio: refFile, refText, genText, onLog: log, serverUrl: activeServerUrl,
      });
      setLastUsedBackend(fresh === 'local' ? 'local' : 'remote');
      return blob;
    };
    const tryHF = async () => {
      const blob = await cloneVoice({ refAudio: refFile, refText, genText, onLog: log });
      setLastUsedBackend('hf');
      return blob;
    };

    // Wrap the whole flow in a window-level error trap so even a sync throw
    // from inside @gradio/client (which has bypassed our try/catch in the past)
    // surfaces as an inline error card, not the dev overlay.
    const onWindowError = (ev) => {
      const msg = ev?.error?.message || ev?.reason?.message || ev?.message || String(ev?.reason || ev);
      console.warn('[VoiceClone] window error trapped:', msg);
      setErrorDetail(prev => prev || msg);
      try { toast?.error?.(msg); } catch {}
      ev.preventDefault?.();
    };
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onWindowError);

    try {
      if (fresh !== 'local' && fresh !== 'remote') {
        throw new Error('No voice server reachable. Modal endpoint may be down — check status at modal.com/apps');
      }
      const blob = await tryServer();
      setOutput(blob);
      setOutputUrl(URL.createObjectURL(blob));
      try { toast?.success?.('Generated in your voice'); } catch {}
    } catch (e) {
      console.error('[VoiceClone] generate failed:', e);
      const msg = e?.message || String(e) || 'Unknown error';
      setErrorDetail(msg);
      try { toast?.error?.(msg); } catch {}
    } finally {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onWindowError);
    }
    setBusy(false);
  };

  const download = () => {
    if (!outputUrl) return;
    const a = document.createElement('a');
    a.href = outputUrl;
    a.download = `my-voice-${Date.now()}.wav`;
    a.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Server status banner */}
      <div
        className="glass-card"
        style={{
          padding: '12px 14px',
          background: serverStatus === 'local' || serverStatus === 'remote' ? 'rgba(16,185,129,.06)' : serverStatus === 'checking' ? 'rgba(167,139,250,.06)' : 'rgba(245,158,11,.06)',
          borderColor: serverStatus === 'local' || serverStatus === 'remote' ? 'rgba(16,185,129,.25)' : serverStatus === 'checking' ? 'rgba(167,139,250,.25)' : 'rgba(245,158,11,.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18 }}>
            {serverStatus === 'local' || serverStatus === 'remote' ? '🟢' : serverStatus === 'checking' ? '⏳' : '🟡'}
          </span>
          <div style={{ flex: 1, minWidth: 200 }}>
            {serverStatus === 'local' && (
              <>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#10b981' }}>
                  Voice server running on THIS PC — offline, free, reliable
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  F5-TTS on {serverInfo?.device === 'cuda' ? 'GPU' : 'CPU'} · everything stays on this computer
                </div>
              </>
            )}
            {serverStatus === 'remote' && (
              <>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#10b981' }}>
                  Voice server reachable via Tailscale — free, reliable, across your PCs
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  F5-TTS on {serverInfo?.device === 'cuda' ? 'GPU' : 'CPU'} @ {activeServerUrl}
                </div>
              </>
            )}
            {serverStatus === 'checking' && (
              <div style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa' }}>Checking for voice server…</div>
            )}
            {serverStatus === 'offline' && (
              <>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fbbf24' }}>
                  No voice server reachable — using flaky HF Space as fallback
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  For zero-error cloning across all your PCs: install F5-TTS on one PC, install Tailscale on all of them.
                </div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {serverStatus === 'offline' && (
              <button className="btn btn-blue btn-sm" onClick={() => setShowSetup(s => !s)}>
                {showSetup ? 'Hide setup' : 'Set up'}
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => { setRemoteUrlInput(remoteUrl); setShowSettings(s => !s); }}>
              ⚙ Settings
            </button>
            <button className="btn btn-ghost btn-sm" onClick={probeLocal} disabled={serverStatus === 'checking'}>
              <RefreshCw size={11} style={serverStatus === 'checking' ? { animation: 'spin 1s linear infinite' } : {}} /> Refresh
            </button>
          </div>
        </div>

        {showSettings && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(255,255,255,.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,.06)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Remote voice server (Tailscale)</div>
            <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, marginBottom: 10 }}>
              If F5-TTS is running on another PC and you've installed Tailscale on both, paste that PC's Tailscale URL here. Leave blank to only use the server on THIS PC.
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <input
                className="input"
                style={{ flex: 1, minWidth: 240 }}
                placeholder="http://monica-desktop.tailXXXXX.ts.net:7860"
                value={remoteUrlInput}
                onChange={e => setRemoteUrlInput(e.target.value)}
              />
              <button className="btn btn-blue btn-sm" onClick={saveRemoteUrl}>Save & Test</button>
            </div>
            {remoteUrl && (
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Currently saved: <code style={{ background: 'rgba(255,255,255,.06)', padding: '2px 6px', borderRadius: 4 }}>{remoteUrl}</code>
              </div>
            )}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, lineHeight: 1.6 }}>
              Find your desktop's Tailscale name: right-click the Tailscale tray icon → "This machine" — the full hostname is shown. Full guide: <code style={{ background: 'rgba(255,255,255,.06)', padding: '2px 6px', borderRadius: 4 }}>tools/voice-clone-server/README.md</code>
            </div>
          </div>
        )}

        {showSetup && serverStatus === 'offline' && (
          <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(255,255,255,.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,.06)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Multi-PC setup (one-time)</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
              F5-TTS installs on your <strong>main PC only</strong>. Tailscale on every PC you use lets your laptop reach the main PC's server as if it were on the same network.
            </div>

            <div style={{ fontSize: 12, fontWeight: 800, color: '#10b981', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>Part 1 — On your main PC only (~10 min, ~3 GB disk)</div>
            <ol style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.8, paddingLeft: 22, margin: 0, marginBottom: 14 }}>
              <li><strong>Install Python 3.11</strong> from <a href="https://www.python.org/downloads/" target="_blank" rel="noreferrer" style={{ color: '#7eb8f7' }}>python.org</a>. <strong style={{ color: '#fbbf24' }}>During install, CHECK "Add Python to PATH".</strong></li>
              <li>Navigate to <code style={{ background: 'rgba(255,255,255,.06)', padding: '2px 6px', borderRadius: 4 }}>my-re-hub\tools\voice-clone-server\</code> in File Explorer</li>
              <li>Double-click <code style={{ background: 'rgba(255,255,255,.06)', padding: '2px 6px', borderRadius: 4 }}>start.bat</code>. First run installs F5-TTS + downloads model (~5 min, ~2 GB) — go grab coffee.</li>
              <li>Wait for <code style={{ background: 'rgba(255,255,255,.06)', padding: '2px 6px', borderRadius: 4 }}>Listening on http://0.0.0.0:7860</code>. Leave that black window open whenever you want to clone.</li>
            </ol>

            <div style={{ fontSize: 12, fontWeight: 800, color: '#a78bfa', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>Part 2 — On every PC you use (~3 min each)</div>
            <ol style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.8, paddingLeft: 22, margin: 0, marginBottom: 14 }}>
              <li>Download Tailscale: <a href="https://tailscale.com/download/windows" target="_blank" rel="noreferrer" style={{ color: '#7eb8f7' }}>tailscale.com/download/windows</a></li>
              <li>Install + sign in with the <strong>same Google/Microsoft account on every PC</strong></li>
              <li>Right-click the Tailscale tray icon → "This machine" — note the hostname (something like <code style={{ background: 'rgba(255,255,255,.06)', padding: '2px 6px', borderRadius: 4 }}>monica-desktop.tail12345.ts.net</code>) on your <strong>main PC</strong></li>
            </ol>

            <div style={{ fontSize: 12, fontWeight: 800, color: '#fbbf24', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>Part 3 — Tell this PC where to find the voice server</div>
            <ol style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.8, paddingLeft: 22, margin: 0 }}>
              <li>On your <strong>main PC</strong> (where F5-TTS is running): just hit Refresh above. The banner will turn green automatically — uses localhost.</li>
              <li>On every <strong>other PC</strong> (laptop, etc.): click ⚙ Settings above, paste <code style={{ background: 'rgba(255,255,255,.06)', padding: '2px 6px', borderRadius: 4 }}>http://YOUR-DESKTOP-NAME.tailXXXXX.ts.net:7860</code> (your main PC's Tailscale URL), click Save & Test.</li>
            </ol>

            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 12, padding: '8px 10px', background: 'rgba(126,184,247,.06)', borderRadius: 8 }}>
              <strong>Daily use:</strong> just double-click start.bat on your main PC when you wake it up. Tailscale runs silently 24/7 in the tray. Your laptop will reach it automatically.
            </div>
          </div>
        )}
      </div>

      <div className="glass-card">
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Clone your voice — 100% free</div>
            <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: 'rgba(16,185,129,.15)', color: '#10b981' }}>$0 · F5-TTS · Apache 2.0</span>
            {lastUsedBackend && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,.05)', color: '#94a3b8' }}>
                last used: {lastUsedBackend === 'local' ? 'local server ✓' : 'HF Space'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Record or upload 10-30 seconds of you speaking, type what you want the cloned voice to say, get an audio file. {serverStatus === 'local' ? 'Running on YOUR computer — fully offline.' : 'Currently using a free Hugging Face Space (may be slow/sleeping).'}
          </div>
        </div>

        <input ref={refInput} type="file" accept="audio/*" style={{ display: 'none' }} onChange={e => pickRef(e.target.files?.[0])} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Step 1 — Your voice sample (10-30 sec)</div>
            {recording ? (
              <MicRecorder
                toast={toast}
                onComplete={(file) => {
                  setRefFile(file);
                  setRefUrl(URL.createObjectURL(file));
                  setRecording(false);
                  toast.success('Voice sample captured');
                }}
                onCancel={() => setRecording(false)}
              />
            ) : refUrl ? (
              <div style={{ padding: '10px 12px', background: 'rgba(167,139,250,.06)', borderRadius: 10, border: '1px solid rgba(167,139,250,.2)' }}>
                <audio src={refUrl} controls style={{ width: '100%' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{refFile?.name}</span>
                  <button className="btn btn-ghost btn-xs" onClick={() => setRecording(true)}><Mic size={11} /> Re-record</button>
                  <button className="btn btn-ghost btn-xs" onClick={() => { setRefFile(null); setRefUrl(''); }}><X size={11} /> Remove</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  className="btn btn-blue"
                  onClick={() => setRecording(true)}
                  style={{ padding: '14px 16px', fontSize: 14 }}
                >
                  <Mic size={14} /> Record Now (in browser)
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.08)' }} />
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>OR</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.08)' }} />
                </div>
                <div
                  onClick={() => refInput.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); pickRef(e.dataTransfer.files?.[0]); }}
                  style={{ padding: 20, border: '2px dashed rgba(167,139,250,.3)', borderRadius: 10, background: 'rgba(167,139,250,.04)', textAlign: 'center', cursor: 'pointer' }}
                >
                  <Upload size={20} color="#a78bfa" style={{ marginBottom: 4 }} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Upload a file you already have</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>MP3, WAV, M4A · 10–30 sec works best</div>
                </div>
              </div>
            )}
          </div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Step 2 — Exactly what you said in the sample (optional but better)</div>
            <textarea
              className="textarea"
              style={{ minHeight: 120 }}
              placeholder='Type out the words from your reference audio, e.g.: "Hi, this is Monica with RE/MAX Classic, helping families find home in Livonia."'
              value={refText}
              onChange={e => setRefText(e.target.value)}
            />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              Leave blank and it'll auto-transcribe, but quality is better when you provide it.
            </div>
          </div>
        </div>

        <div className="label" style={{ marginBottom: 6 }}>Step 3 — What you want your cloned voice to say</div>
        <textarea
          className="textarea"
          style={{ minHeight: 140 }}
          placeholder='E.g.: "Just listed in Livonia, 4 beds, 3 baths, fully renovated. DM me for a private tour."'
          value={genText}
          onChange={e => setGenText(e.target.value)}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>{genText.length} chars · ~{Math.ceil(genText.length / 150)} sec audio</span>
          <button className="btn btn-blue" onClick={generate} disabled={busy || !refFile || !genText.trim()}>
            {busy ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Cloning…</> : <><Wand2 size={12} /> Generate in My Voice</>}
          </button>
        </div>

        {busy && (
          <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(167,139,250,.06)', borderRadius: 8 }}>
            {logLines.map((l, i) => (
              <div key={i} style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>· {l}</div>
            ))}
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              First call to a sleeping Space can take 30-60 sec to wake up. After that it's fast.
            </div>
          </div>
        )}

        {errorDetail && !busy && (
          <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#f87171', marginBottom: 4 }}>Voice clone failed</div>
            <div style={{ fontSize: 12, color: '#cbd5e1', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{errorDetail}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              Copy this whole error and paste it back to Claude to fix.
              The Space (mrfakename/E2-F5-TTS) might be sleeping/down/changed its API — open F12 → Console for the full stack trace.
            </div>
          </div>
        )}

        {outputUrl && (
          <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <audio src={outputUrl} controls style={{ flex: 1 }} />
              <button className="btn btn-blue btn-sm" onClick={download}><Download size={12} /> Download</button>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
              Drop this audio into Auto Video Maker as a voiceover. Generated entirely free via F5-TTS.
            </div>
          </div>
        )}
      </div>

      <div className="glass-card" style={{ background: 'rgba(245,158,11,.04)', borderColor: 'rgba(245,158,11,.2)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ fontSize: 20 }}>💡</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Tips for the best clone</div>
            <ul style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
              <li>Use a <strong>clean</strong> recording — no background music, no echo, no other voices</li>
              <li>10–30 seconds of you speaking naturally works best — longer doesn't help</li>
              <li>Match the energy: read your reference text the way you want the cloned voice to sound</li>
              <li>For a 15-sec reel, generate 1-2 sentences at a time and stitch — long single generations can drift</li>
              <li>First request can be slow (Space wake-up); subsequent are fast</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── TOOL: AI VOICE ──────────────────────────────────────────────────────────
// ElevenLabs TTS — free tier gives 10k chars/mo with all preset voices.
// Voice cloning ("sounds like YOU") requires the $5/mo paid plan, which we
// surface in the UI so it's not a surprise.
const AIVoiceTool = ({ toast }) => {
  const [voices, setVoices] = useState([]);
  const [voiceId, setVoiceId] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [usage, setUsage] = useState(null);
  const [keyMissing, setKeyMissing] = useState(false);
  const audioRef = useRef();

  // Load available voices on mount.
  useEffect(() => {
    (async () => {
      try {
        const [vRes, uRes] = await Promise.all([
          fetch('/api/elevenlabs?action=voices'),
          fetch('/api/elevenlabs?action=usage'),
        ]);
        if (vRes.status === 400) {
          setKeyMissing(true);
          return;
        }
        const v = await vRes.json();
        if (v.voices?.length) {
          setVoices(v.voices);
          // Prefer a clean female narrator voice for real estate use
          const preferred = v.voices.find(x => /rachel|bella|elli|grace/i.test(x.name)) || v.voices[0];
          setVoiceId(preferred.voice_id);
        }
        if (uRes.ok) setUsage(await uRes.json());
      } catch (e) {
        console.warn('Voice load failed:', e.message);
      }
    })();
  }, []);

  const generate = async () => {
    if (!voiceId) return toast.error('Pick a voice');
    if (!text.trim()) return toast.error('Type something to say');
    setBusy(true);
    setAudioUrl('');
    try {
      const r = await fetch('/api/elevenlabs?action=tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId, text }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error?.message || `Failed: ${r.status}`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setTimeout(() => audioRef.current?.play(), 100);
      toast.success('Audio generated');
      // Refresh usage so the meter updates
      fetch('/api/elevenlabs?action=usage').then(r => r.ok && r.json().then(setUsage)).catch(() => {});
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };

  const download = () => {
    if (!audioUrl) return;
    const voiceName = voices.find(v => v.voice_id === voiceId)?.name || 'voice';
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `${voiceName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.mp3`;
    a.click();
  };

  // Web Speech API fallback for instant zero-setup TTS (preset browser voices,
  // sounds robotic but works without any account).
  const speakBrowserTTS = () => {
    if (!text.trim()) return toast.error('Type something to say');
    if (!window.speechSynthesis) return toast.error('Your browser doesn\'t support speech synthesis');
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
    toast.info('Playing via browser TTS (not recordable, robotic — set ELEVENLABS_API_KEY for studio quality)');
  };

  const charsLeft = usage ? Math.max(0, (usage.character_limit || 0) - (usage.character_count || 0)) : null;
  const charsPct = usage && usage.character_limit ? (usage.character_count / usage.character_limit) * 100 : 0;
  const tier = usage?.tier || (keyMissing ? 'no-key' : 'free');

  if (keyMissing) {
    return (
      <div className="glass-card">
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <Volume2 size={28} color="#a78bfa" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 8 }}>AI Voice needs a free ElevenLabs key</div>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 14 }}>
              ElevenLabs is the highest-quality TTS service available, and they give you <strong style={{ color: '#10b981' }}>10,000 characters / month free</strong> (about 10 min of audio) with their preset voices. No credit card required.
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Quick setup (3 minutes):</div>
            <ol style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.8, paddingLeft: 22, marginBottom: 14 }}>
              <li>Sign up at <a href="https://elevenlabs.io" target="_blank" rel="noreferrer" style={{ color: '#7eb8f7' }}>elevenlabs.io</a> (free)</li>
              <li>Go to <strong>Profile → API Keys</strong>, copy your key</li>
              <li>Open <code style={{ background: 'rgba(255,255,255,.06)', padding: '2px 6px', borderRadius: 4 }}>C:\Users\miskr\Documents\my-re-hub\.env.local</code> (create it if missing) and add the line: <code style={{ background: 'rgba(255,255,255,.06)', padding: '2px 6px', borderRadius: 4 }}>ELEVENLABS_API_KEY=your_key_here</code></li>
              <li>Restart the dev server (Ctrl+C in the terminal, then <code style={{ background: 'rgba(255,255,255,.06)', padding: '2px 6px', borderRadius: 4 }}>npm start</code>)</li>
              <li>Come back here and refresh the page</li>
            </ol>
            <div style={{ padding: '10px 12px', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 8, fontSize: 12, color: '#fbbf24', marginBottom: 12 }}>
              <strong>About voice cloning ("sounds like YOU"):</strong> ElevenLabs charges $5/mo for that specifically. Free tier gives you preset voices only. For genuinely free voice cloning we'd need to either install Coqui XTTS-v2 locally (Python install, ~1GB model) or use a Hugging Face Space (free but unreliable). Let me know which trade-off you prefer.
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Need a voiceover RIGHT NOW with zero setup? You can also use your browser's built-in TTS — robotic, but $0 and instant:
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input className="input" placeholder="Type a quick test line…" value={text} onChange={e => setText(e.target.value)} style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-sm" onClick={speakBrowserTTS}><Play size={12} /> Play (browser TTS)</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Turn any script into broadcast-quality audio</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Powered by ElevenLabs. Pick a voice, paste your script, get an MP3 you can drop into the Auto Video Maker as a voiceover.
            </div>
          </div>
          {usage && (
            <div style={{ minWidth: 200, padding: '10px 12px', borderRadius: 10, background: 'rgba(167,139,250,.06)', border: '1px solid rgba(167,139,250,.2)' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
                {tier} tier · this month
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 99, overflow: 'hidden', marginBottom: 4 }}>
                <div style={{ height: '100%', width: `${Math.min(100, charsPct)}%`, background: charsPct > 90 ? '#f87171' : '#a78bfa', transition: 'width .3s' }} />
              </div>
              <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                {charsLeft?.toLocaleString() || 0} chars left ({Math.round((charsLeft || 0) / 150)} min audio)
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Voice</div>
            <select className="select" value={voiceId} onChange={e => setVoiceId(e.target.value)}>
              {voices.length === 0 && <option value="">Loading…</option>}
              {voices.map(v => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.name}{v.labels?.gender ? ` (${v.labels.gender})` : ''}{v.category === 'cloned' ? ' — YOUR VOICE' : ''}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
              💡 To clone your own voice ("sounds like YOU"), upgrade to ElevenLabs Starter ($5/mo) → record 90 sec of you talking → it appears here as "YOUR VOICE."
            </div>
          </div>
        </div>

        <div className="label" style={{ marginBottom: 6 }}>Script</div>
        <textarea
          className="textarea"
          style={{ minHeight: 140 }}
          placeholder='Paste a script. E.g.: "Just listed in Livonia — 4 beds, 3 baths, fully renovated. $549k. DM me for a private tour before it hits open house Saturday."'
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={2500}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <span style={{ fontSize: 11, color: text.length > 2000 ? '#fbbf24' : '#64748b' }}>
            {text.length} / 2500 chars · ~{Math.ceil(text.length / 150)} sec audio
          </span>
          <button className="btn btn-blue" onClick={generate} disabled={busy || !voiceId || !text.trim()}>
            {busy ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</> : <><Wand2 size={12} /> Generate Audio</>}
          </button>
        </div>

        {audioUrl && (
          <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <audio ref={audioRef} src={audioUrl} controls style={{ flex: 1 }} />
              <button className="btn btn-blue btn-sm" onClick={download}><Download size={12} /> Download MP3</button>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
              Drop this MP3 into Auto Video Maker as a voiceover, or use it as ad audio.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── TOOL: BACKGROUND REMOVER ────────────────────────────────────────────────
const BackgroundRemoverTool = ({ toast }) => {
  const [source, setSource] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [result, setResult] = useState(null);
  const [resultUrl, setResultUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef();

  const pick = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Pick an image file (PNG/JPG)');
      return;
    }
    setSource(file);
    setSourceUrl(URL.createObjectURL(file));
    setResult(null); setResultUrl('');
  };

  const run = async () => {
    if (!source) return toast.error('Pick an image first');
    setBusy(true);
    setProgress(0);
    try {
      const out = await removeBg(source, setProgress);
      setResult(out);
      setResultUrl(URL.createObjectURL(out));
      toast.success('Background removed — download the PNG below');
    } catch (e) {
      console.error(e);
      toast.error(`Background removal failed: ${e.message}`);
    }
    setBusy(false);
  };

  const download = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = (source?.name?.replace(/\.\w+$/, '') || 'image') + '-nobg.png';
    a.click();
  };

  return (
    <div className="glass-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Remove the background from any photo</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Drop in a listing photo, headshot, or any image. The subject stays — everything behind it becomes transparent. Perfect for cutouts, ad creatives, and overlays.
          </div>
        </div>
      </div>

      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => pick(e.target.files?.[0])} />

      {!source && (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
          style={{
            padding: 40, border: '2px dashed rgba(167,139,250,.3)', borderRadius: 14,
            background: 'rgba(167,139,250,.04)', textAlign: 'center', cursor: 'pointer',
            transition: 'all .15s',
          }}
        >
          <Upload size={32} color="#a78bfa" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
            Drop an image here, or click to pick one
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>PNG · JPG · WebP — runs locally, your photo never leaves your browser</div>
        </div>
      )}

      {source && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>Original</div>
            <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', background: '#070b18', border: '1px solid rgba(255,255,255,.06)' }}>
              <img src={sourceUrl} alt="source" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Without Background
            </div>
            <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', background: 'repeating-conic-gradient(#1e293b 0 25%,#0f172a 0 50%) 50%/20px 20px', border: '1px solid rgba(255,255,255,.06)' }}>
              {resultUrl ? (
                <img src={resultUrl} alt="result" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                  {busy ? (
                    <>
                      <RefreshCw size={28} color="#a78bfa" style={{ animation: 'spin 1s linear infinite' }} />
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
                        {progress > 0 ? `Removing background… ${Math.round(progress * 100)}%` : 'Loading model (~80 MB, first time only)…'}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: '#64748b' }}>Hit "Remove Background" below</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {source && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setSource(null); setSourceUrl(''); setResult(null); setResultUrl(''); }}>
            <X size={12} /> Reset
          </button>
          {!result && (
            <button className="btn btn-blue" onClick={run} disabled={busy} style={{ flex: 1 }}>
              <Wand2 size={13} /> {busy ? 'Working…' : 'Remove Background'}
            </button>
          )}
          {result && (
            <button className="btn btn-blue" onClick={download} style={{ flex: 1 }}>
              <Download size={13} /> Download PNG
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── TOOL: BACKGROUND REPLACE ────────────────────────────────────────────────
// Same removal model + a chosen replacement bg composited beneath.
const BackgroundReplaceTool = ({ toast }) => {
  const [subject, setSubject] = useState(null);
  const [subjectUrl, setSubjectUrl] = useState('');
  const [bg, setBg] = useState(null);
  const [bgUrl, setBgUrl] = useState('');
  const [result, setResult] = useState(null);
  const [resultUrl, setResultUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  const pick = useCallback((file, slot) => {
    if (!file || !file.type.startsWith('image/')) return toast?.error?.('Pick an image');
    const url = URL.createObjectURL(file);
    if (slot === 'subject') { setSubject(file); setSubjectUrl(url); }
    else { setBg(file); setBgUrl(url); }
    setResult(null); setResultUrl('');
  }, [toast]);

  const run = async () => {
    if (!subject) return toast.error('Pick the foreground image');
    if (!bg) return toast.error('Pick a replacement background image');
    setBusy(true);
    setProgress(0);
    try {
      const cutout = await removeBg(subject, setProgress);
      const composited = await compositeOnBackground(cutout, bg);
      setResult(composited);
      setResultUrl(URL.createObjectURL(composited));
      toast.success('Composited — download below');
    } catch (e) {
      console.error(e);
      toast.error(`Composite failed: ${e.message}`);
    }
    setBusy(false);
  };

  const download = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = (subject?.name?.replace(/\.\w+$/, '') || 'image') + '-replaced.png';
    a.click();
  };

  return (
    <div className="glass-card">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Replace the background with a property photo</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          Put yourself or your client in front of any listing. Pick a foreground (your headshot) and a backdrop (the property), and the AI does the rest.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <FilePicker label="Foreground (subject)" accent="#a78bfa" file={subject} url={subjectUrl} onPick={f => pick(f, 'subject')} hint="Headshot, you talking, etc." />
        <FilePicker label="Background (backdrop)" accent="#10b981" file={bg} url={bgUrl} onPick={f => pick(f, 'bg')} hint="Listing photo, room shot, etc." />
      </div>

      {(subject && bg) && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>Result</div>
          <div style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 12, overflow: 'hidden', background: '#070b18', border: '1px solid rgba(255,255,255,.06)' }}>
            {resultUrl ? (
              <img src={resultUrl} alt="result" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {busy ? (
                  <div style={{ textAlign: 'center' }}>
                    <RefreshCw size={28} color="#a78bfa" style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
                      {progress > 0 ? `${Math.round(progress * 100)}%` : 'Loading model…'}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#64748b' }}>Click "Composite" below</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {!result ? (
          <button className="btn btn-blue" onClick={run} disabled={busy || !subject || !bg} style={{ flex: 1 }}>
            <Wand2 size={13} /> {busy ? 'Working…' : 'Composite'}
          </button>
        ) : (
          <button className="btn btn-blue" onClick={download} style={{ flex: 1 }}>
            <Download size={13} /> Download PNG
          </button>
        )}
      </div>
    </div>
  );
};

const FilePicker = ({ label, accent, file, url, onPick, hint }) => {
  const ref = useRef();
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => onPick(e.target.files?.[0])} />
      <div
        onClick={() => ref.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); onPick(e.dataTransfer.files?.[0]); }}
        style={{
          aspectRatio: '1', borderRadius: 12, border: `1px dashed ${accent}55`,
          background: `${accent}0a`, cursor: 'pointer', position: 'relative', overflow: 'hidden',
        }}
      >
        {url ? (
          <img src={url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4, color: accent }}>
            <ImageIcon size={26} />
            <div style={{ fontSize: 11, fontWeight: 700 }}>Drop or click</div>
            <div style={{ fontSize: 10, color: '#64748b', textAlign: 'center', padding: '0 12px' }}>{hint}</div>
          </div>
        )}
      </div>
      {file && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.name}
        </div>
      )}
    </div>
  );
};

// ─── ROADMAP / WHAT YOU ALREADY HAVE ─────────────────────────────────────────
const RoadmapTool = ({ setPage }) => {
  const sections = [
    {
      title: 'Already in your Auto Video Maker',
      color: '#10b981',
      items: [
        { icon: '🎙', t: 'AI Transcription (Whisper)', d: 'Word-level timestamps for your voiceover and webcam recordings — open-source, in-browser.' },
        { icon: '✂️', t: 'Filler Word Auto-Cut', d: '"um", "uh", "you know", "i mean" — detected and stitched out via FFmpeg.' },
        { icon: '🔇', t: 'Audio Denoise', d: 'FFT-based noise reduction on voiceover tracks.' },
        { icon: '💬', t: 'TikTok-Style Burned Captions', d: 'Karaoke highlighting — current word pops, neighbors stay readable.' },
        { icon: '🎨', t: 'Auto Color Enhance', d: 'Per-frame brightness/contrast/saturation analysis, no manual sliders.' },
        { icon: '📱', t: 'iPhone Format Conversion', d: 'HEIC → JPG, MOV/HEVC → MP4, all transparent to you.' },
      ],
      cta: { label: 'Open Auto Video Maker', page: 'video-studio' },
    },
    {
      title: 'New here in AI Studio',
      color: '#a78bfa',
      items: [
        { icon: '🎯', t: 'Smart Clips (Opus Clip equivalent)', d: 'Drop a long video, Whisper transcribes, Claude/Ollama picks the 3-5 best hookable 15-60s clips for social — each trimmed to its own MP4.' },
        { icon: '🎤', t: 'Voice Clone — FREE (F5-TTS on Modal GPU)', d: 'Open-source voice cloning hosted free on Modal\'s GPU. Upload a 10-30s sample, type your script, get audio in YOUR voice in ~10 sec.' },
        { icon: '🎬', t: 'Video Background Replace', d: 'Real-time MediaPipe selfie segmentation. Talking head → standing in front of any listing photo. Free, browser-only.' },
        { icon: '🔊', t: 'AI Voice — Presets (ElevenLabs)', d: 'Broadcast-quality preset voices. 10k chars/month free.' },
        { icon: '🪄', t: 'Background Remover (image)', d: 'Open-source ONNX model. Drop a photo, get a transparent-bg PNG.' },
        { icon: '🌆', t: 'Background Replace (image)', d: 'Composite your subject onto any property photo.' },
      ],
    },
    {
      title: 'Now powering everything (free LLM)',
      color: '#10b981',
      items: [
        { icon: '🧠', t: 'Auto-fallback to Ollama', d: 'The /api/claude/messages proxy now tries Anthropic, then falls back to your local Ollama install. Install Ollama from ollama.com + run `ollama pull llama3.2` and every AI feature works for $0.' },
      ],
    },
    {
      title: 'Shipping next',
      color: '#f59e0b',
      items: [
        { icon: '✍️', t: 'Text-Based Editor (Descript-style)', d: 'Edit the transcript; cuts apply to the video. Whisper foundation is already in place.' },
        { icon: '🎨', t: 'Face Smoothing (Facetune-style)', d: 'MediaPipe face landmarks + selective gaussian — skin/teeth/eye polish.' },
        { icon: '📐', t: 'Multi-Format Export', d: 'One source clip → 9:16 + 1:1 + 16:9 in one render pass, smart-crop centered on the action.' },
        { icon: '📺', t: 'B-Roll Generator', d: 'Pexels free API + Claude prompt → drop in stock footage that matches your script.' },
        { icon: '🖼', t: 'AI Thumbnail Picker', d: 'Claude vision scans your render and picks the most engaging frame as the cover image.' },
        { icon: '🎵', t: 'Beat-Sync Music Cuts', d: 'Web Audio analysis detects beat positions; scene cuts snap to the beat.' },
        { icon: '🪄', t: 'Make Me a Reel (one-button wizard)', d: 'Unifies everything above into a single "answer 3 questions, get a finished reel" flow.' },
      ],
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {sections.map(sec => (
        <div key={sec.title} className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: sec.color }} />
              {sec.title}
            </div>
            {sec.cta && (
              <button className="btn btn-ghost btn-sm" onClick={() => setPage(sec.cta.page)}>
                {sec.cta.label} →
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            {sec.items.map(it => (
              <div key={it.t} style={{ padding: '12px 14px', background: 'rgba(255,255,255,.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,.05)' }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{it.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 3 }}>{it.t}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>{it.d}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default AIStudio;
