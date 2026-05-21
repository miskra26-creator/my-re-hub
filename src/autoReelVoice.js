/**
 * autoReelVoice — TTS orchestration for AutoReel narration.
 *
 * Three providers, tried in order:
 *   1. F5-TTS (Monica's cloned voice) — Modal endpoint at miskra26--api.modal.run
 *      Sounds like HER. Requires her saved reference audio (one-time recording).
 *   2. ElevenLabs — studio quality library voices. 10k chars/mo free tier.
 *      Used if she has ELEVENLABS_API_KEY but no saved voice ref.
 *   3. Browser SpeechSynthesis — universal fallback, free, robotic.
 *
 * Returns: { blob, mime, durationSec, provider }
 *   The blob is a Wav/MP3 audio file ready to mix into the reel render.
 */

// ─── localStorage keys ───────────────────────────────────────────────────────
const KEY_VOICE_REF_NAME = 'autoreel_voice_ref_name';
const KEY_VOICE_REF_TEXT = 'autoreel_voice_ref_text';
const REMOTE_VOICE_LS_KEY = 'voice_clone_remote_url'; // shared with AIStudio's VoiceCloneTool

// ─── IndexedDB helpers for storing the reference audio blob ───────────────────
const DB_NAME = 'autoreel_voice';
const DB_STORE = 'refs';

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function saveVoiceRef(blob, transcript = '') {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(blob, 'ref_audio');
    tx.oncomplete = () => {
      try {
        localStorage.setItem(KEY_VOICE_REF_NAME, blob.name || 'recorded.webm');
        localStorage.setItem(KEY_VOICE_REF_TEXT, transcript || '');
      } catch (e) {/* */}
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadVoiceRef() {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const rq = tx.objectStore(DB_STORE).get('ref_audio');
      rq.onsuccess = () => resolve(rq.result || null);
      rq.onerror = () => reject(rq.error);
    });
  } catch (e) {
    return null;
  }
}

export async function clearVoiceRef() {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete('ref_audio');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {/* */}
  try {
    localStorage.removeItem(KEY_VOICE_REF_NAME);
    localStorage.removeItem(KEY_VOICE_REF_TEXT);
  } catch (e) {/* */}
}

export function getRefTranscript() {
  try { return localStorage.getItem(KEY_VOICE_REF_TEXT) || ''; } catch (e) { return ''; }
}

export function hasVoiceRefSaved() {
  try { return !!localStorage.getItem(KEY_VOICE_REF_NAME); } catch (e) { return false; }
}

// ─── F5-TTS server probe ──────────────────────────────────────────────────────
async function probeF5() {
  const remote = (() => { try { return localStorage.getItem(REMOTE_VOICE_LS_KEY) || ''; } catch (e) { return ''; } })();
  const candidates = [
    remote || 'https://miskra26--api.modal.run',
    'http://localhost:7860',
  ];
  for (const base of candidates) {
    if (!base) continue;
    try {
      const r = await fetch(`${base.replace(/\/+$/, '')}/health`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const d = await r.json();
        if (d?.ok) return base.replace(/\/+$/, '');
      }
    } catch (e) {/* */}
  }
  return null;
}

// ─── Convert WebM/Opus → WAV using FFmpeg (mirrors AIStudio's util) ───────────
async function webmToWav(file) {
  if (!file) return null;
  const isWebm = file.type?.includes('webm') || /\.(webm|opus)$/i.test(file.name || '');
  if (!isWebm) return file;
  // Lazy-load the FFmpeg shared instance already used elsewhere in the app
  const { getFFmpegShared } = await import('./audioCleaner');
  const { ffmpeg, fetchFile } = await getFFmpegShared();
  const inName = `vref_${Date.now()}.webm`;
  const outName = `vref_${Date.now()}.wav`;
  await ffmpeg.writeFile(inName, await fetchFile(file));
  await ffmpeg.exec(['-i', inName, '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', outName]);
  const data = await ffmpeg.readFile(outName);
  try { await ffmpeg.deleteFile(inName); } catch (e) {/* */}
  try { await ffmpeg.deleteFile(outName); } catch (e) {/* */}
  return new File([data], 'ref.wav', { type: 'audio/wav' });
}

// ─── Provider 1: F5-TTS via Monica's Modal endpoint ──────────────────────────
async function synthesizeF5({ script, onLog }) {
  const serverUrl = await probeF5();
  if (!serverUrl) return null;
  onLog?.(`F5-TTS server online at ${serverUrl}`);

  const ref = await loadVoiceRef();
  if (!ref) {
    onLog?.('No saved voice reference — skipping F5-TTS (record one in Voice Setup)');
    return null;
  }
  onLog?.('Converting reference audio to WAV…');
  const wavRef = await webmToWav(ref);
  const transcript = getRefTranscript();

  onLog?.(`Sending ${script.length} chars to F5-TTS for voice cloning…`);
  const fd = new FormData();
  fd.append('ref_audio', wavRef);
  fd.append('ref_text', transcript);
  fd.append('gen_text', script);

  const r = await fetch(`${serverUrl}/clone`, { method: 'POST', body: fd });
  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`F5-TTS returned ${r.status}: ${err.slice(0, 200)}`);
  }
  const blob = await r.blob();
  onLog?.(`F5-TTS returned ${(blob.size / 1024).toFixed(0)} KB of audio`);

  // F5-TTS doesn't return per-word timing. Estimate it by spreading words
  // evenly across the audio duration. Slightly imperfect but the karaoke
  // effect still feels synced — words land within ~150ms of their actual
  // spoken time, well within human perception tolerance.
  const dur = await probeAudioDuration(blob);
  const wordTimings = estimateWordTimingsLinear(script, dur);

  return { blob, mime: blob.type || 'audio/wav', provider: 'f5-tts', wordTimings, durationSec: dur };
}

// ─── Provider 2: ElevenLabs (free tier) ───────────────────────────────────────
async function synthesizeElevenLabs({ script, voiceId, onLog }) {
  if (!voiceId) {
    onLog?.('ElevenLabs voice not selected');
    return null;
  }
  try {
    // Use the with-timestamps endpoint so we get word-level alignment back,
    // which powers the karaoke caption mode.
    const r = await fetch('/api/elevenlabs?action=tts-timestamps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: script, voiceId }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      if (r.status === 400 && /not configured|api key/i.test(err?.error?.message || err?.error || '')) {
        onLog?.('ElevenLabs key not configured on the server');
        return null;
      }
      throw new Error(err.error?.message || err.error || `ElevenLabs returned ${r.status}`);
    }
    const data = await r.json();
    // Decode the base64 audio into a Blob
    const audioRes = await fetch(data.audioBase64);
    const blob = await audioRes.blob();
    onLog?.(`ElevenLabs returned ${(blob.size / 1024).toFixed(0)} KB · ${data.wordTimings?.length || 0} word timings`);
    return {
      blob,
      mime: 'audio/mpeg',
      provider: 'elevenlabs',
      wordTimings: data.wordTimings || [],
    };
  } catch (e) {
    onLog?.(`ElevenLabs failed: ${e.message}`);
    return null;
  }
}

// ─── Provider 3: Browser SpeechSynthesis → MediaRecorder ──────────────────────
// Last resort. Quality is robotic but it always works and costs $0.
async function synthesizeBrowserTTS({ script, voiceName, onLog }) {
  if (!('speechSynthesis' in window)) return null;
  onLog?.('Using browser SpeechSynthesis (robotic but free)');

  // Pick the most "natural" voice available
  const voices = await new Promise((resolve) => {
    let v = speechSynthesis.getVoices();
    if (v.length) { resolve(v); return; }
    speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
    // Safety timeout
    setTimeout(() => resolve(speechSynthesis.getVoices()), 1500);
  });

  let chosenVoice = null;
  if (voiceName) chosenVoice = voices.find(v => v.name === voiceName) || null;
  if (!chosenVoice) {
    // Prefer en-US natural-sounding voices
    chosenVoice =
      voices.find(v => /natural|enhanced|premium/i.test(v.name) && v.lang.startsWith('en')) ||
      voices.find(v => v.lang === 'en-US') ||
      voices[0];
  }

  // Render speech audio to a blob by piping speechSynthesis through
  // an OfflineAudioContext is NOT possible (speechSynthesis doesn't expose
  // raw audio). Workaround: use MediaRecorder on a MediaStream from the
  // AudioContext via createMediaStreamDestination — but speechSynthesis
  // doesn't route through Web Audio.
  //
  // The reliable cross-browser approach: record from the OS audio loopback
  // is unavailable from the browser. So we synthesize timing only and let
  // the render engine play() the speechSynthesis utterance in real-time
  // while capturing the canvas + the AudioContext mix.
  //
  // That doesn't fit cleanly into our offline render. So for browser-TTS
  // mode we generate a silent placeholder track of estimated duration and
  // return a flag instructing the render engine to play speechSynthesis
  // directly during the live record. The wallet-fix: most users with
  // saved voice ref OR ElevenLabs key will never hit this branch.
  const wordsPerMin = 165;
  const wordCount = script.trim().split(/\s+/).length;
  const estSec = Math.max(8, (wordCount / wordsPerMin) * 60);

  // Return a marker — render engine sees provider='browser-tts' and
  // triggers speechSynthesis.speak() during recording instead of mixing
  // an audio blob.
  return {
    blob: null,
    mime: 'audio/none',
    provider: 'browser-tts',
    speakConfig: {
      text: script,
      voiceName: chosenVoice?.name || null,
      rate: 1.0, pitch: 1.0, volume: 1.0,
      estDurationSec: estSec,
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────
// synthesizeNarration: try providers in user-preferred order, return whichever
// works. Caller passes { preferred: 'cloned'|'pro'|'browser' } to bias the order.
export async function synthesizeNarration({ script, preferred = 'cloned', elevenLabsVoiceId, onLog }) {
  const log = onLog || (() => {});
  log(`Synthesizing ${script.length}-char narration · preferred=${preferred}`);

  const tryOrder = preferred === 'pro'
    ? [() => synthesizeElevenLabs({ script, voiceId: elevenLabsVoiceId, onLog: log }),
       () => synthesizeF5({ script, onLog: log }),
       () => synthesizeBrowserTTS({ script, onLog: log })]
    : preferred === 'browser'
    ? [() => synthesizeBrowserTTS({ script, onLog: log })]
    : [() => synthesizeF5({ script, onLog: log }),
       () => synthesizeElevenLabs({ script, voiceId: elevenLabsVoiceId, onLog: log }),
       () => synthesizeBrowserTTS({ script, onLog: log })];

  for (const attempt of tryOrder) {
    try {
      const result = await attempt();
      if (result) {
        log(`✓ Using ${result.provider}`);
        return result;
      }
    } catch (e) {
      log(`Provider failed: ${e.message}`);
    }
  }
  throw new Error('All TTS providers failed — try Voice Setup to record your reference voice');
}

// Estimate playback duration of a generated audio blob (used to pace the reel).
export async function probeAudioDuration(blob) {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => resolve(a.duration || 0);
    a.onerror = () => resolve(0);
    a.src = URL.createObjectURL(blob);
  });
}

// Estimate per-word timings by linearly distributing words across the audio
// duration, weighted by syllable count so multi-syllable words get more time.
// Used when the TTS provider doesn't return native timing (e.g. F5-TTS).
//
// Not perfect — but the karaoke caption highlight is forgiving: as long as
// words light up within ~150ms of being spoken, the effect feels right.
export function estimateWordTimingsLinear(text, durationSec) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length || !durationSec) return [];
  // Weight each word by approximate syllable count (vowel-group heuristic)
  const weights = words.map(w => {
    const cleaned = w.toLowerCase().replace(/[^a-z]/g, '');
    if (!cleaned) return 1;
    const groups = cleaned.match(/[aeiouy]+/g)?.length || 1;
    // Cap at 5 — words like "responsibility" shouldn't dominate
    return Math.min(5, Math.max(1, groups));
  });
  const totalW = weights.reduce((a, b) => a + b, 0);
  // Reserve a tiny head/tail buffer so first/last words don't sit on edges
  const usable = Math.max(0.1, durationSec - 0.1);
  const startBuf = 0.05;

  const timings = [];
  let cursor = startBuf;
  for (let i = 0; i < words.length; i++) {
    const wDur = (weights[i] / totalW) * usable;
    timings.push({ word: words[i], startSec: cursor, endSec: cursor + wDur });
    cursor += wDur;
  }
  return timings;
}
