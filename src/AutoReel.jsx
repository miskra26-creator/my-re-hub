/**
 * AutoReel — listing photos → polished cinematic reels in ~30 seconds.
 *
 * Monica's "AutoReel.ai / VideoTour.AI clone." Three steps: pick a listing
 * (or upload photos), pick a vibe, hit Generate. AI handles photo curation,
 * room detection, scene ordering, narrative copy, and renders a cinematic
 * reel with her gold/dark MI brand. One-tap post to FB or IG.
 *
 * Engine: src/cinematicRender.js
 * AI:     src/aiAutoReel.js (Gemini Vision + text via /api/claude/messages)
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Sparkles, Upload, X, Image as ImageIcon, Play, Download, Wand2,
  ArrowRight, RotateCcw, Check, Loader, AlertCircle, Share2,
} from 'lucide-react';
import { supabase, isCloudEnabled } from './supabase';
import { useLS } from './cloudHooks';
import {
  VIBES, VIBE_BY_ID, ROOM_ORDER,
  curatePhotos, buildSceneOrder, generateNarrative, generateTourScript,
} from './aiAutoReel';
import { renderCinematicReel, REEL_MUSIC, pickRandomTrack } from './cinematicRender';
import {
  saveVoiceRef, loadVoiceRef, clearVoiceRef, hasVoiceRefSaved, getRefTranscript,
  synthesizeNarration, probeAudioDuration,
} from './autoReelVoice';
import { stagePhoto, STAGING_STYLES, STYLE_BY_ID } from './aiVirtualStaging';
import { generateClipsForScenes, probeVideoMotionServer, getVideoMotionUrl, setVideoMotionUrl } from './aiVideoMotion';
import { stitchReel } from './aiReelStitch';

// ── Tiny styled element helpers (match app's visual language) ─────────────────
const S = {
  card: {
    background: 'rgba(15,20,38,.6)', border: '1px solid rgba(255,255,255,.06)',
    borderRadius: 14, padding: 18, marginBottom: 14, backdropFilter: 'blur(10px)',
  },
  cardLabel: {
    fontSize: 11, fontWeight: 800, color: '#b8864b', letterSpacing: 2,
    textTransform: 'uppercase', marginBottom: 12,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 5 },
  fieldLabel: { fontSize: 10.5, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' },
  input: {
    background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: 13.5,
    outline: 'none', fontFamily: 'inherit',
  },
  chip: {
    background: 'rgba(184,134,75,.12)', border: '1px solid rgba(184,134,75,.35)',
    borderRadius: 8, padding: '7px 12px', color: '#e0b370', fontSize: 12,
    fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  primaryBtn: {
    background: 'linear-gradient(135deg, #b8864b, #d4a017)',
    border: 'none', borderRadius: 10, padding: '14px 24px',
    color: '#0f172a', fontSize: 14.5, fontWeight: 900, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 8,
    boxShadow: '0 6px 24px rgba(184,134,75,.35)',
  },
  ghostBtn: {
    background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 8, padding: '10px 16px', color: '#cbd5e1', fontSize: 13,
    fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
  },
};

export default function AutoReel({ setPage, toast }) {
  // ── Step state ──────────────────────────────────────────────────────────────
  const [listingId, setListingId] = useState('');
  const [listing, setListing] = useState({
    address: '', city: '', zip: '', list_price: '', beds: '', baths: '', sqft: '', status: '', mls_num: '',
  });
  const [photos, setPhotos] = useState([]); // [{ id, file, url }]
  const [vibe, setVibe] = useState('luxury');
  const [aspect, setAspect] = useState('9:16');
  const [narration, setNarration] = useLS('autoreel_narration', false);
  const [voicePref, setVoicePref] = useLS('autoreel_voice_pref', 'cloned'); // 'cloned' | 'pro' | 'browser'
  const [captions, setCaptions] = useLS('autoreel_captions', true);
  const [autoStage, setAutoStage] = useLS('autoreel_autostage', true);
  const [stagingStyle, setStagingStyle] = useLS('autoreel_staging_style', 'modern');
  // AI motion: when ON, use Modal-hosted LTX-Video for real camera motion
  // per scene. When OFF, fall back to the Ken Burns canvas pipeline.
  const [aiMotion, setAiMotion] = useLS('autoreel_ai_motion', false);
  const [motionUrlInput, setMotionUrlInput] = useState('');
  const [motionServerStatus, setMotionServerStatus] = useState('unchecked'); // 'unchecked'|'checking'|'online'|'offline'
  const [motionServerInfo, setMotionServerInfo] = useState(null);

  const probeMotion = useCallback(async () => {
    setMotionServerStatus('checking');
    const info = await probeVideoMotionServer();
    if (info) {
      setMotionServerStatus('online');
      setMotionServerInfo(info);
    } else {
      setMotionServerStatus('offline');
      setMotionServerInfo(null);
    }
  }, []);

  // Auto-probe once on mount if AI motion is enabled
  useEffect(() => {
    if (aiMotion) probeMotion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [hasVoiceRef, setHasVoiceRef] = useState(() => hasVoiceRefSaved());
  const [voiceSetupOpen, setVoiceSetupOpen] = useState(false);

  // ── ElevenLabs voice picker state ───────────────────────────────────────────
  const [elVoices, setElVoices] = useState([]);
  const [elVoiceId, setElVoiceId] = useLS('autoreel_el_voice_id', '');
  const [elKeyMissing, setElKeyMissing] = useState(false);
  const [elUsage, setElUsage] = useState(null);
  const [elLoaded, setElLoaded] = useState(false);

  // Lazy-load voices when she opens the Pro Voice option for the first time
  useEffect(() => {
    if (!narration || voicePref !== 'pro' || elLoaded) return;
    setElLoaded(true);
    (async () => {
      try {
        const [vRes, uRes] = await Promise.all([
          fetch('/api/elevenlabs/voices'),
          fetch('/api/elevenlabs/usage'),
        ]);
        if (vRes.status === 400) { setElKeyMissing(true); return; }
        const v = await vRes.json();
        if (v.voices?.length) {
          setElVoices(v.voices);
          // Prefer a real estate-friendly female narrator if she hasn't picked
          if (!elVoiceId) {
            const preferred = v.voices.find(x => /rachel|bella|elli|grace|charlotte|sarah/i.test(x.name))
                            || v.voices[0];
            setElVoiceId(preferred.voice_id);
          }
        }
        if (uRes.ok) setElUsage(await uRes.json());
      } catch (e) { /* swallow, pro-voice will just fall through to F5/browser */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narration, voicePref]);

  // ── Async state ─────────────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(''); // 'curate'|'narrate'|'render'|'upload'|'post'
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [log, setLog] = useState([]);
  const [result, setResult] = useState(null); // { blob, url, narrative, scenes, publicUrl? }

  // ── Review-before-render state ──────────────────────────────────────────────
  // After AI curates + narrates, we PAUSE here so Monica can fix any wrong
  // labels / captions before the expensive render kicks off. AI is good at
  // spotting features in photos but sometimes confuses room types or makes
  // up labels that don't match what's visible.
  const [reviewPlan, setReviewPlan] = useState(null);
  // reviewPlan shape: {
  //   scenes,        // ordered, with staged photos if applicable
  //   narrative,     // { hook, sceneLabels[], closingHeadline, closingCta, igCaption, fbCaption, statsLine }
  //   tourScript,    // { fullScript, perScene } | null  (only when narration is on)
  //   music,         // chosen background track
  // }
  const [integrations] = useLS('integrations', {});
  const meta = integrations?.meta || { accessToken: '', pageId: '', igAccountId: '' };
  const [brand] = useLS('rehub_brand', {});
  const [agentVoice] = useLS('agent_voice', '');
  const [profile] = useLS('re_profile', { name: 'Monica Iskra' });

  // ── Listings dropdown ───────────────────────────────────────────────────────
  const [allListings, setAllListings] = useState([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  useEffect(() => {
    (async () => {
      if (!isCloudEnabled) { setListingsLoading(false); return; }
      try {
        const { data } = await supabase
          .from('listings')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(40);
        setAllListings(data || []);
      } catch (e) { /* swallow */ }
      setListingsLoading(false);
    })();
  }, []);

  const loadListing = useCallback((l) => {
    setListingId(l.id);
    setListing({
      address: l.address || '',
      city: l.city || '',
      zip: l.zip || '',
      list_price: l.list_price || l.sale_price || '',
      beds: l.beds || '',
      baths: l.baths || '',
      sqft: l.sqft || '',
      status: l.status || '',
      mls_num: l.mls_num || '',
    });
    toast?.success(`Loaded ${l.address}`);
  }, [toast]);

  // ── Photo upload ────────────────────────────────────────────────────────────
  const fileRef = useRef();
  const addPhotos = useCallback((files) => {
    const arr = Array.from(files || []).filter(f => f.type.startsWith('image/'));
    const items = arr.map((f) => ({
      id: 'p_' + Math.random().toString(36).slice(2),
      file: f,
      url: URL.createObjectURL(f),
      name: f.name,
    }));
    setPhotos(p => [...p, ...items].slice(0, 30));
  }, []);

  const removePhoto = useCallback((id) => {
    setPhotos(p => {
      const tgt = p.find(x => x.id === id);
      if (tgt?.url) URL.revokeObjectURL(tgt.url);
      return p.filter(x => x.id !== id);
    });
  }, []);

  // Cleanup blob URLs when unmounting
  useEffect(() => () => {
    photos.forEach(p => p.url && URL.revokeObjectURL(p.url));
  }, []); // eslint-disable-line

  // ── Generate ────────────────────────────────────────────────────────────────
  const canGenerate = photos.length >= 3 && !busy;
  const vibeDef = VIBE_BY_ID[vibe] || VIBES[0];

  // ── PHASE 1: PLAN — runs the cheap AI work, then pauses for review ──────────
  // Curates photos, stages vacant rooms, generates the narrative + script.
  // Sets reviewPlan so Monica can edit anything wrong before the expensive
  // render/voiceover steps run.
  const planReel = async () => {
    if (photos.length < 3) {
      toast?.error('Add at least 3 photos');
      return;
    }
    setBusy(true);
    setResult(null);
    setReviewPlan(null);
    setLog([]);
    const addLog = (m) => setLog(l => [...l, m]);

    try {
      // ── Phase 1: AI photo curation ─────────────────────────────────────────
      setPhase('curate');
      setProgress(0.05);
      setProgressLabel('AI analyzing your photos…');
      addLog(`Sending ${photos.length} photos to AI for scoring + room detection`);
      const curated = await curatePhotos(photos, listing);
      addLog(`AI scored ${curated.length} photos`);

      // Pick best 8-10 photos in tour order
      const targetCount = Math.min(Math.max(6, photos.length), 10);
      const ordered = buildSceneOrder(curated, targetCount);
      addLog(`Picked ${ordered.length} best photos, ordered: ${ordered.map(o => o.room).join(' → ')}`);
      setProgress(0.25);

      // Build scenes with photo refs. The label is the AI-extracted specific
      // feature ("WHITE QUARTZ ISLAND") — generic room words have been stripped
      // upstream so we don't show useless "KITCHEN" overlays.
      const scenes = ordered.map(o => ({
        photo: photos[o.index],
        room:  o.room,
        label: o.label || '',
        score: o.score,
        vacancy: o.vacancy,
      }));

      // ── Phase 1b: Auto-stage vacant rooms ──────────────────────────────────
      // Vacant exterior / detail / outdoor shots are skipped (they don't need
      // furnishing). Only interior vacant photos get staged.
      const STAGEABLE_ROOMS = new Set(['living','primary','bedroom','dining','office','basement','kitchen','bath']);
      const vacantScenes = scenes
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.vacancy === 'vacant' && STAGEABLE_ROOMS.has(s.room));

      if (autoStage && vacantScenes.length > 0) {
        setPhase('stage');
        setProgressLabel(`Staging ${vacantScenes.length} vacant room${vacantScenes.length === 1 ? '' : 's'}…`);
        addLog(`Auto-staging ${vacantScenes.length} vacant room(s) with Gemini Image · style=${stagingStyle}`);
        for (let n = 0; n < vacantScenes.length; n++) {
          const { s, i } = vacantScenes[n];
          setProgressLabel(`Staging vacant ${s.room} (${n + 1} of ${vacantScenes.length})…`);
          try {
            const staged = await stagePhoto({
              photo: s.photo.file || s.photo,
              room: s.room,
              style: stagingStyle,
              onLog: addLog,
            });
            // Swap the scene's photo with the staged version
            const stagedUrl = URL.createObjectURL(staged.blob);
            scenes[i] = {
              ...scenes[i],
              photo: { url: stagedUrl, file: staged.blob, name: `staged-${s.room}.png` },
              wasStaged: true,
            };
            addLog(`✓ Staged scene ${i + 1} (${s.room})`);
          } catch (e) {
            addLog(`Stage failed for scene ${i + 1}: ${e.message} — using original`);
          }
          setProgress(0.25 + (0.15 * (n + 1) / vacantScenes.length));
        }
        addLog(`Staging complete · ${vacantScenes.length} room(s) processed`);
      } else if (vacantScenes.length > 0) {
        addLog(`${vacantScenes.length} vacant room(s) detected but auto-stage is OFF`);
      }

      // ── Phase 2: Narrative ────────────────────────────────────────────────
      setPhase('narrate');
      setProgressLabel('Writing hook + scene labels…');
      addLog('Generating AI copy: hook, scene labels, CTA, captions');
      const narrative = await generateNarrative({
        scenes, listing, vibe,
        agentVoice, agent: profile,
      });
      addLog(`Hook: "${narrative.hook}"`);
      setProgress(0.55);

      // ── Phase 2b: Narration script (optional) ─────────────────────────────
      // We generate the spoken-script TEXT now (cheap) but DON'T synthesize
      // voice yet — Monica can edit the script in the review panel first.
      let tourScript = null;
      if (narration) {
        setPhase('script');
        setProgressLabel('Writing narration script…');
        addLog('Generating tour narration script (synthesis happens after review)');
        try {
          tourScript = await generateTourScript({
            scenes, listing, vibe, agentVoice, agent: profile,
          });
          addLog(`Script: "${tourScript.fullScript.slice(0, 80)}..."`);
        } catch (e) {
          addLog(`Script gen failed (continuing without voiceover): ${e.message}`);
        }
        setProgress(0.75);
      }

      // Pick music now so it's in the plan
      const music = pickRandomTrack(vibeDef.music);
      addLog(`Music: ${music?.name || '(silent)'}`);

      // ── PAUSE FOR REVIEW ──────────────────────────────────────────────────
      // Monica can now edit hook / scene labels / closing CTA / narration
      // script before we burn money on voice synthesis + AI motion + render.
      setReviewPlan({ scenes, narrative, tourScript, music });
      setProgress(1.0);
      setProgressLabel('Plan ready — review labels below, edit anything wrong, then hit Render');
      setPhase('review');
      addLog('✓ Plan ready · review the labels below before rendering');
      toast?.success('Plan ready — review the labels then hit Render Final Reel');
    } catch (e) {
      addLog(`ERROR: ${e.message}`);
      toast?.error('Plan failed: ' + e.message);
      setPhase('');
    } finally {
      setBusy(false);
    }
  };

  // ── PHASE 2: RENDER FINAL — uses the (possibly edited) reviewPlan ──────────
  // This is where money/time gets spent: voiceover synthesis + AI motion (if
  // enabled) + the actual render. Anything Monica edited in the review panel
  // gets applied here.
  const renderFinalReel = async () => {
    if (!reviewPlan) return;
    setBusy(true);
    setResult(null);
    const addLog = (m) => setLog(l => [...l, m]);
    const { scenes, narrative, tourScript, music } = reviewPlan;

    try {
      // ── Phase 2b: Synthesize the voiceover (using possibly-edited script) ──
      let voiceover = null;
      if (narration && tourScript?.fullScript) {
        setPhase('voice');
        setProgress(0.05);
        setProgressLabel(`Synthesizing voice (${voicePref})…`);
        addLog('Synthesizing narration audio');
        try {
          const voiceRes = await synthesizeNarration({
            script: tourScript.fullScript,
            preferred: voicePref,
            elevenLabsVoiceId: elVoiceId,
            onLog: addLog,
          });
          if (voiceRes?.blob) {
            const dur = voiceRes.durationSec || await probeAudioDuration(voiceRes.blob);
            voiceover = {
              blob: voiceRes.blob,
              mime: voiceRes.mime,
              durationSec: dur,
              perScene: tourScript.perScene || [],
              wordTimings: voiceRes.wordTimings || [],
              provider: voiceRes.provider,
            };
            addLog(`Voice rendered: ${dur.toFixed(1)}s via ${voiceRes.provider}${voiceRes.wordTimings?.length ? ` · ${voiceRes.wordTimings.length} word timings for karaoke captions` : ''}`);
          } else {
            addLog('No audio blob returned — skipping narration in the video');
          }
        } catch (voiceErr) {
          addLog(`Narration failed (continuing without): ${voiceErr.message}`);
          toast?.warning?.('Narration failed — reel will render without voice');
        }
        setProgress(0.20);
      }

      // ── Phase 3: Render ───────────────────────────────────────────────────
      // Two paths:
      //   - aiMotion=true:  LTX-Video generates real camera motion per scene,
      //                     FFmpeg stitches the clips together with audio
      //   - aiMotion=false: Canvas Ken Burns pipeline (legacy slideshow mode)
      setPhase('render');
      let renderRes;

      if (aiMotion) {
        addLog('Using AI image-to-video motion (LTX-Video on Modal)');
        setProgressLabel('Generating AI camera motion per scene…');
        const renderBase = 0.20;

        // Step A: generate one AI clip per scene via the Modal endpoint
        const aiClips = await generateClipsForScenes(scenes, {
          onProgress: (p, label) => {
            setProgress(renderBase + 0.40 * p);
            if (label) setProgressLabel(label);
          },
          onLog: addLog,
        });
        const okClips = aiClips.filter(c => c.blob);
        if (!okClips.length) {
          throw new Error('All AI motion clips failed — your LTX-Video Modal server may not be deployed yet. Run the deploy command from the AI Motion section above.');
        }
        addLog(`✓ Got ${okClips.length}/${scenes.length} AI clips back`);

        // Step B: stitch the clips together with audio + intro/outro cards
        setProgressLabel('Stitching final reel…');
        renderRes = await stitchReel({
          clips: aiClips, scenes, narrative, brand, vibe,
          music: music ? { url: music.url, volume: 0.7 } : null,
          voiceover,
          opts: {
            aspect,
            onProgress: (p, label) => {
              setProgress(renderBase + 0.40 + 0.35 * p);
              if (label) setProgressLabel(label);
            },
            onLog: addLog,
          },
        });
      } else {
        addLog('Using Ken Burns canvas pipeline (no AI motion)');
        setProgressLabel('Rendering cinematic reel…');
        renderRes = await renderCinematicReel({
          scenes, narrative, brand, vibe,
          music: music ? { url: music.url, volume: 0.7 } : null,
          voiceover,
          opts: {
            aspect,
            quality: 'high',
            captions,
            onProgress: (p, label) => {
              setProgress(0.20 + 0.75 * p);
              if (label) setProgressLabel(label);
            },
            onLog: addLog,
          },
        });
      }
      addLog(`Rendered ${renderRes.durationSec.toFixed(1)}s at ${renderRes.dimensions.w}×${renderRes.dimensions.h}`);

      const blobUrl = URL.createObjectURL(renderRes.blob);
      setResult({
        blob: renderRes.blob,
        mime: renderRes.mime,
        url: blobUrl,
        narrative,
        scenes,
        durationSec: renderRes.durationSec,
        dimensions: renderRes.dimensions,
      });
      setReviewPlan(null);
      setProgress(1);
      setProgressLabel('Done');
      setPhase('');
      toast?.success(`Reel rendered! (${renderRes.durationSec.toFixed(1)}s)`);
    } catch (e) {
      addLog(`ERROR: ${e.message}`);
      toast?.error('Render failed: ' + e.message);
      setPhase('');
    } finally {
      setBusy(false);
    }
  };

  // Apply edits from the review panel back into reviewPlan state
  const updateReviewNarrative = (patch) => {
    setReviewPlan(p => p ? { ...p, narrative: { ...p.narrative, ...patch } } : p);
  };
  const updateReviewSceneLabel = (sceneIdx, newLabel) => {
    setReviewPlan(p => {
      if (!p) return p;
      const labels = [...(p.narrative.sceneLabels || [])];
      labels[sceneIdx] = newLabel;
      return { ...p, narrative: { ...p.narrative, sceneLabels: labels } };
    });
  };
  const updateReviewScript = (newScript) => {
    setReviewPlan(p => p ? { ...p, tourScript: { ...p.tourScript, fullScript: newScript } } : p);
  };

  const cancelPlan = () => {
    setReviewPlan(null);
    setProgress(0);
    setProgressLabel('');
    setPhase('');
  };

  // ── Download ────────────────────────────────────────────────────────────────
  const download = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.url;
    const ext = result.mime.includes('webm') ? 'webm' : 'mp4';
    const safeAddr = (listing.address || 'reel').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    a.download = `${safeAddr}-${vibe}-${Date.now()}.${ext}`;
    a.click();
  };

  // ── Upload to Supabase Storage + return public URL ──────────────────────────
  const uploadReel = async () => {
    if (!result?.blob) throw new Error('No reel rendered yet');
    if (!isCloudEnabled) throw new Error('Cloud (Supabase) not configured');
    const ext = result.mime.includes('webm') ? 'webm' : 'mp4';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('reels').upload(path, result.blob, {
        contentType: result.mime, upsert: false, cacheControl: '3600',
      });
    if (upErr) {
      // Most common: bucket doesn't exist yet. Tell her how to fix.
      if (/Bucket not found|does not exist/i.test(upErr.message)) {
        throw new Error('Storage bucket "reels" not set up yet. Run supabase-migrations/005_reels_bucket.sql in your Supabase SQL editor.');
      }
      throw new Error('Upload failed: ' + upErr.message);
    }
    const { data: { publicUrl } } = supabase.storage.from('reels').getPublicUrl(path);
    return publicUrl;
  };

  // ── Post to Meta ────────────────────────────────────────────────────────────
  const postToMeta = async (platforms) => {
    if (!result) { toast?.error('Render the reel first'); return; }
    if (!meta.accessToken || !meta.pageId) {
      toast?.error('Connect Facebook/Instagram first in Settings → Integrations');
      return;
    }
    if (platforms.includes('instagram') && !meta.igAccountId) {
      toast?.error('Instagram account not connected — connect it in Settings → Integrations');
      return;
    }
    setBusy(true);
    setPhase('upload');
    setProgressLabel('Uploading reel for Meta…');
    try {
      // Need a public URL for Meta to fetch the video
      let publicUrl = result.publicUrl;
      if (!publicUrl) {
        publicUrl = await uploadReel();
        setResult(r => ({ ...r, publicUrl }));
      }
      setPhase('post');
      setProgressLabel(`Posting to ${platforms.join(' + ')}…`);

      const caption = platforms.includes('instagram')
        ? (result.narrative.igCaption || '')
        : (result.narrative.fbCaption || result.narrative.igCaption || '');

      const r = await fetch('/api/meta/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post: {
            caption,
            mediaUrl: publicUrl,
            mediaType: 'video',
            platforms,
          },
          meta,
        }),
      }).catch(() => null);

      // Fallback: call publishPostToMeta directly if API route doesn't exist.
      // Since publishPostToMeta is defined in App.js (not exported), use the
      // Graph API directly here for the common video-post case.
      if (!r || !r.ok) {
        await postDirectly({ platforms, caption, videoUrl: publicUrl, meta });
      }

      toast?.success(`Posted to ${platforms.join(' + ')}!`);
      setPhase('');
    } catch (e) {
      toast?.error('Post failed: ' + e.message);
      setPhase('');
    } finally {
      setBusy(false);
    }
  };

  // ── Reset to make another ───────────────────────────────────────────────────
  const reset = () => {
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult(null);
    setProgress(0);
    setLog([]);
  };

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <div className="page-content">
      <div style={{marginBottom:28}}>
        <button className="btn-back" style={{marginBottom:14}} onClick={()=>setPage?.('dashboard')}>
          ← Dashboard
        </button>
        <div style={{display:'flex',alignItems:'center',gap:14, flexWrap:'wrap'}}>
          <div style={{
            width:54, height:54, borderRadius:14,
            background:'linear-gradient(135deg, #b8864b, #d4a017)',
            display:'flex',alignItems:'center',justifyContent:'center',
            boxShadow:'0 8px 32px rgba(184,134,75,.35)',
          }}>
            <Sparkles size={26} color="#0f172a" strokeWidth={2.5}/>
          </div>
          <div>
            <div className="page-title" style={{margin:0}}>AutoReel</div>
            <div className="page-sub" style={{margin:0}}>
              Listing photos → scroll-stopping reels · AI does the work · ~30 sec
            </div>
          </div>
        </div>
      </div>

      {/* ── STEP 1: Source ── */}
      <div style={S.card}>
        <div style={S.cardLabel}>① Listing</div>

        {/* Listings dropdown */}
        {allListings.length > 0 && (
          <div style={{marginBottom:14}}>
            <div style={S.fieldLabel}>Pick from your Realcomp listings</div>
            <select
              value={listingId}
              onChange={(e) => {
                const l = allListings.find(x => x.id === e.target.value);
                if (l) loadListing(l);
                else { setListingId(''); }
              }}
              style={{...S.input, marginTop:5, width:'100%'}}
            >
              <option value="">— Or fill in details manually —</option>
              {allListings.map(l => (
                <option key={l.id} value={l.id}>
                  {[l.address, l.city, l.status, l.list_price ? `$${Number(l.list_price).toLocaleString()}` : ''].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
          </div>
        )}
        {listingsLoading && (
          <div style={{fontSize:11, color:'#64748b', marginBottom:14}}>Loading your listings…</div>
        )}

        {/* Manual fields */}
        <div style={{display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:10, marginBottom:10}}>
          <div style={S.field}>
            <span style={S.fieldLabel}>Address</span>
            <input value={listing.address} onChange={e=>setListing(s=>({...s, address:e.target.value}))}
              style={S.input} placeholder="123 Main St"/>
          </div>
          <div style={S.field}>
            <span style={S.fieldLabel}>City</span>
            <input value={listing.city} onChange={e=>setListing(s=>({...s, city:e.target.value}))}
              style={S.input} placeholder="Livonia"/>
          </div>
          <div style={S.field}>
            <span style={S.fieldLabel}>Price</span>
            <input value={listing.list_price} onChange={e=>setListing(s=>({...s, list_price:e.target.value}))}
              style={S.input} placeholder="425000"/>
          </div>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 2fr', gap:10}}>
          <div style={S.field}>
            <span style={S.fieldLabel}>Beds</span>
            <input value={listing.beds} onChange={e=>setListing(s=>({...s, beds:e.target.value}))} style={S.input}/>
          </div>
          <div style={S.field}>
            <span style={S.fieldLabel}>Baths</span>
            <input value={listing.baths} onChange={e=>setListing(s=>({...s, baths:e.target.value}))} style={S.input}/>
          </div>
          <div style={S.field}>
            <span style={S.fieldLabel}>Sqft</span>
            <input value={listing.sqft} onChange={e=>setListing(s=>({...s, sqft:e.target.value}))} style={S.input}/>
          </div>
          <div style={S.field}>
            <span style={S.fieldLabel}>Status</span>
            <select value={listing.status} onChange={e=>setListing(s=>({...s, status:e.target.value}))} style={S.input}>
              <option value="">—</option>
              <option value="Active">Active</option>
              <option value="Just Listed">Just Listed</option>
              <option value="Coming Soon">Coming Soon</option>
              <option value="Price Reduced">Price Reduced</option>
              <option value="Pending">Pending</option>
              <option value="Sold">Sold</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── STEP 2: Photos ── */}
      <div style={S.card}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
          <div style={S.cardLabel}>② Photos · {photos.length} {photos.length === 30 && '(max)'}</div>
          <div style={{fontSize:11, color:'#64748b'}}>3 minimum · 10-15 ideal · AI picks the best</div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{display:'none'}}
          onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }}
        />

        {photos.length === 0 ? (
          <button
            onClick={() => fileRef.current?.click()}
            style={{
              width:'100%', padding:'40px 20px', borderRadius:12,
              background:'rgba(255,255,255,.03)', border:'2px dashed rgba(184,134,75,.4)',
              color:'#e0b370', fontSize:14, fontWeight:700, cursor:'pointer',
              display:'flex', flexDirection:'column', alignItems:'center', gap:10,
            }}
          >
            <Upload size={28}/>
            Upload listing photos
            <span style={{fontSize:11, color:'#64748b', fontWeight:500}}>
              JPG / PNG · the more the better · AI picks the strongest shots
            </span>
          </button>
        ) : (
          <>
            <div style={{
              display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))', gap:10, marginBottom:12,
            }}>
              {photos.map((p, i) => (
                <div key={p.id} style={{position:'relative', aspectRatio:'1', borderRadius:8, overflow:'hidden', background:'#000'}}>
                  <img src={p.url} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}}/>
                  <button onClick={() => removePhoto(p.id)} style={{
                    position:'absolute', top:4, right:4, width:24, height:24, borderRadius:6,
                    background:'rgba(0,0,0,.7)', border:'none', color:'#fff', cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}>
                    <X size={14}/>
                  </button>
                  <div style={{
                    position:'absolute', bottom:0, left:0, right:0, padding:'8px 6px 4px',
                    background:'linear-gradient(transparent, rgba(0,0,0,.8))',
                    color:'#fff', fontSize:10, fontWeight:700, textAlign:'left',
                  }}>
                    {i + 1}
                  </div>
                </div>
              ))}
            </div>
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              <button onClick={() => fileRef.current?.click()} style={S.chip}>
                <Upload size={13}/> Add more
              </button>
              <button onClick={() => { photos.forEach(p => URL.revokeObjectURL(p.url)); setPhotos([]); }}
                style={{...S.chip, color:'#fca5a5', borderColor:'rgba(239,68,68,.35)', background:'rgba(239,68,68,.08)'}}>
                <X size={13}/> Clear all
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── STEP 3: Vibe ── */}
      <div style={S.card}>
        <div style={S.cardLabel}>③ Vibe</div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:10}}>
          {VIBES.map(v => (
            <button
              key={v.id}
              onClick={() => setVibe(v.id)}
              style={{
                background: vibe === v.id ? 'linear-gradient(135deg, rgba(184,134,75,.25), rgba(212,160,23,.15))' : 'rgba(255,255,255,.03)',
                border: vibe === v.id ? '2px solid #b8864b' : '1px solid rgba(255,255,255,.08)',
                borderRadius: 12, padding: '14px 12px', cursor: 'pointer',
                textAlign: 'left', transition: 'all .15s ease',
              }}
            >
              <div style={{fontSize:22, marginBottom:6}}>{v.emoji}</div>
              <div style={{fontSize:13.5, fontWeight:900, color:'#f1f5f9', marginBottom:4}}>{v.name}</div>
              <div style={{fontSize:10.5, color:'#94a3b8', lineHeight:1.4}}>{v.desc}</div>
            </button>
          ))}
        </div>

        <div style={{display:'flex', gap:18, marginTop:14, flexWrap:'wrap', alignItems:'flex-end'}}>
          <div>
            <div style={S.fieldLabel}>Format</div>
            <div style={{display:'flex', gap:6, marginTop:5}}>
              {[
                { id:'9:16', label:'Vertical · Reel' },
                { id:'1:1',  label:'Square · Post' },
                { id:'16:9', label:'Landscape · YT' },
              ].map(a => (
                <button key={a.id} onClick={() => setAspect(a.id)} style={{
                  background: aspect === a.id ? 'rgba(184,134,75,.20)' : 'rgba(255,255,255,.04)',
                  border: aspect === a.id ? '1px solid #b8864b' : '1px solid rgba(255,255,255,.1)',
                  borderRadius: 8, padding:'7px 12px', color: aspect === a.id ? '#e0b370' : '#cbd5e1',
                  fontSize:11.5, fontWeight:700, cursor:'pointer',
                }}>{a.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── STEP 3.25: AI Camera Motion (LTX-Video on Modal) ── */}
      <div style={{...S.card, borderColor: aiMotion ? 'rgba(184,134,75,.5)' : 'rgba(255,255,255,.06)', background: aiMotion ? 'linear-gradient(135deg, rgba(184,134,75,.08), rgba(15,20,38,.6))' : S.card.background}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:10}}>
          <div style={S.cardLabel}>🎬 AI Camera Motion <span style={{color:'#94a3b8', fontWeight:600, letterSpacing:0, textTransform:'none'}}>· real cinematic motion · LTX-Video on your Modal</span></div>
          <label style={{
            display:'inline-flex', alignItems:'center', gap:8, cursor:'pointer',
            fontSize:12, fontWeight:800, color: aiMotion ? '#e0b370' : '#cbd5e1',
          }}>
            <input
              type="checkbox"
              checked={aiMotion}
              onChange={(e) => { setAiMotion(e.target.checked); if (e.target.checked) probeMotion(); }}
              style={{width:18, height:18, accentColor:'#b8864b'}}
            />
            {aiMotion ? 'AI motion ON' : 'AI motion OFF (slideshow mode)'}
          </label>
        </div>

        {!aiMotion && (
          <div style={{fontSize:11.5, color:'#94a3b8', lineHeight:1.5}}>
            <strong style={{color:'#cbd5e1'}}>OFF</strong> = Ken Burns slideshow (free, in-browser). Photos zoom and pan but don't have real depth. This is the basic version.
            <br/><br/>
            <strong style={{color:'#e0b370'}}>ON</strong> = each photo gets sent to your Modal-deployed LTX-Video server, which generates a 4-second AI video clip with real cinematic camera motion (push-ins, pans, parallax, depth). Stitched together with FFmpeg-wasm in your browser. ~$0.30-0.50/month at your usage.
          </div>
        )}

        {aiMotion && (
          <>
            <div style={{fontSize:11.5, color:'#94a3b8', lineHeight:1.5, marginBottom:14}}>
              Each photo → AI clip with real camera motion (push-ins, pans, orbits, parallax). Renders take longer (~10-15 sec per scene + stitching) but the output feels like a real walkthrough, not a slideshow.
            </div>

            {/* Server status */}
            <div style={{
              background: motionServerStatus === 'online' ? 'rgba(16,185,129,.08)' :
                         motionServerStatus === 'offline' ? 'rgba(239,68,68,.08)' : 'rgba(255,255,255,.03)',
              borderLeft: `3px solid ${motionServerStatus === 'online' ? '#10b981' : motionServerStatus === 'offline' ? '#ef4444' : '#94a3b8'}`,
              padding: '10px 12px', borderRadius: 6, marginBottom: 12,
            }}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap'}}>
                <div style={{fontSize:12, color:'#e2e8f0'}}>
                  Modal endpoint: <code style={{background:'rgba(0,0,0,.3)', padding:'1px 6px', borderRadius:3, fontSize:11}}>{getVideoMotionUrl()}</code>
                </div>
                <div style={{display:'flex', gap:6, alignItems:'center', fontSize:11, fontWeight:700}}>
                  {motionServerStatus === 'checking' && <span style={{color:'#94a3b8'}}>Checking…</span>}
                  {motionServerStatus === 'online' && <span style={{color:'#6ee7b7'}}>✓ Online · {motionServerInfo?.model}</span>}
                  {motionServerStatus === 'offline' && <span style={{color:'#fca5a5'}}>✗ Offline / not deployed</span>}
                  <button onClick={probeMotion} style={{...S.ghostBtn, padding:'4px 10px', fontSize:11}}>↻ Recheck</button>
                </div>
              </div>

              {motionServerStatus === 'offline' && (
                <div style={{marginTop:8, fontSize:11, color:'#fca5a5', lineHeight:1.5}}>
                  Your LTX-Video Modal app isn't deployed yet. Run this once on your machine to deploy it:
                  <pre style={{
                    background:'rgba(0,0,0,.4)', padding:'8px 10px', borderRadius:4, marginTop:6,
                    fontFamily:'monospace', fontSize:11, color:'#e0b370', overflow:'auto', whiteSpace:'pre-wrap',
                  }}>{`cd C:\\Users\\miskr\\Documents\\my-re-hub\\tools\\video-motion-server
..\\voice-clone-server\\venv\\Scripts\\python.exe -m modal deploy modal_deploy.py`}</pre>
                  Modal will print a URL like <code style={{background:'rgba(0,0,0,.3)', padding:'1px 5px', borderRadius:3}}>https://miskra26--ltx-motion-api.modal.run</code>. The default in this app matches that pattern — if yours differs, paste it below.
                </div>
              )}

              <div style={{marginTop:10, display:'flex', gap:6, alignItems:'center'}}>
                <input
                  type="text"
                  value={motionUrlInput}
                  onChange={(e) => setMotionUrlInput(e.target.value)}
                  placeholder="(Optional) Custom Modal URL if yours differs from default"
                  style={{...S.input, flex:1, fontSize:11, padding:'6px 10px'}}
                />
                <button onClick={() => { if (motionUrlInput.trim()) { setVideoMotionUrl(motionUrlInput.trim()); setMotionUrlInput(''); probeMotion(); } }}
                  style={{...S.ghostBtn, padding:'6px 12px', fontSize:11}}>Save URL</button>
              </div>
            </div>

            <div style={{fontSize:11, color:'#64748b', lineHeight:1.5}}>
              <strong>Per-reel cost on your Modal:</strong> ~$0.02-0.04 (about 8 scenes × $0.003 each). Modal's $30 free signup credit covers years.
            </div>
          </>
        )}
      </div>

      {/* ── STEP 3.5: Virtual Staging (Gemini Image) ── */}
      <div style={{...S.card, borderColor: autoStage ? 'rgba(184,134,75,.35)' : 'rgba(255,255,255,.06)'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:10}}>
          <div style={S.cardLabel}>🛋 Auto-stage vacant rooms <span style={{color:'#94a3b8', fontWeight:600, letterSpacing:0, textTransform:'none'}}>· Gemini Image · free</span></div>
          <label style={{
            display:'inline-flex', alignItems:'center', gap:8, cursor:'pointer',
            fontSize:12, fontWeight:800, color: autoStage ? '#e0b370' : '#cbd5e1',
          }}>
            <input
              type="checkbox"
              checked={autoStage}
              onChange={(e) => setAutoStage(e.target.checked)}
              style={{width:18, height:18, accentColor:'#b8864b'}}
            />
            {autoStage ? 'Auto-stage ON' : 'Auto-stage OFF'}
          </label>
        </div>

        {!autoStage && (
          <div style={{fontSize:11.5, color:'#94a3b8', lineHeight:1.5}}>
            When ON, the AI checks each photo for vacancy and automatically furnishes empty rooms with photorealistic furniture before rendering the reel. Vacant exterior, outdoor, and detail shots are skipped (they don't need staging). Uses your free Gemini Image quota — ~5-10 photos per reel.
          </div>
        )}

        {autoStage && (
          <>
            <div style={{fontSize:11.5, color:'#94a3b8', lineHeight:1.5, marginBottom:12}}>
              AI auto-detects vacant interior rooms during photo curation, then stages them with the style you pick below. You'll see the staging progress before the reel renders. For full control over each photo, use the standalone <strong style={{color:'#e0b370'}}>Virtual Staging tab</strong>.
            </div>

            <div style={S.fieldLabel}>Style for auto-staging</div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:8, marginTop:6}}>
              {STAGING_STYLES.map(s => (
                <button key={s.id} onClick={() => setStagingStyle(s.id)} style={{
                  background: stagingStyle === s.id ? 'linear-gradient(135deg, rgba(184,134,75,.25), rgba(212,160,23,.10))' : 'rgba(255,255,255,.03)',
                  border: stagingStyle === s.id ? '2px solid #b8864b' : '1px solid rgba(255,255,255,.08)',
                  borderRadius: 10, padding: '10px 10px', cursor: 'pointer',
                  textAlign: 'left',
                }}>
                  <div style={{fontSize:16, marginBottom:3}}>{s.emoji}</div>
                  <div style={{fontSize:11.5, fontWeight:800, color:'#f1f5f9'}}>{s.name}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── STEP 4: AI Narration (the VideoTour.AI feature) ── */}
      <div style={{...S.card, borderColor: narration ? 'rgba(184,134,75,.35)' : 'rgba(255,255,255,.06)'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:10}}>
          <div style={S.cardLabel}>④ AI Narration <span style={{color:'#94a3b8', fontWeight:600, letterSpacing:0, textTransform:'none'}}>· VideoTour-AI style</span></div>
          <label style={{
            display:'inline-flex', alignItems:'center', gap:8, cursor:'pointer',
            fontSize:12, fontWeight:800, color: narration ? '#e0b370' : '#cbd5e1',
          }}>
            <input
              type="checkbox"
              checked={narration}
              onChange={(e) => setNarration(e.target.checked)}
              style={{width:18, height:18, accentColor:'#b8864b'}}
            />
            {narration ? 'AI voiceover ON' : 'AI voiceover OFF'}
          </label>
        </div>

        {!narration && (
          <div style={{fontSize:11.5, color:'#94a3b8', lineHeight:1.5}}>
            Turn this on to have AI write a tour script and read it aloud over the reel — in your own cloned voice (free, via your Modal F5-TTS server). Music auto-ducks during narration. Optional subtitles bake in.
          </div>
        )}

        {narration && (
          <>
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:10, marginBottom:12}}>
              {[
                { id:'cloned',  emoji:'🎙️', name:'My Voice',     desc:'F5-TTS clones from your saved reference recording' },
                { id:'pro',     emoji:'🎬', name:'Pro Voice',    desc:'ElevenLabs studio voice (needs API key)' },
                { id:'browser', emoji:'💻', name:'Browser TTS',  desc:'Free fallback · robotic but works offline' },
              ].map(v => (
                <button key={v.id} onClick={() => setVoicePref(v.id)} style={{
                  background: voicePref === v.id ? 'linear-gradient(135deg, rgba(184,134,75,.25), rgba(212,160,23,.10))' : 'rgba(255,255,255,.03)',
                  border: voicePref === v.id ? '2px solid #b8864b' : '1px solid rgba(255,255,255,.08)',
                  borderRadius: 10, padding: '12px 10px', cursor: 'pointer',
                  textAlign: 'left',
                }}>
                  <div style={{fontSize:18, marginBottom:4}}>{v.emoji}</div>
                  <div style={{fontSize:12.5, fontWeight:800, color:'#f1f5f9'}}>{v.name}</div>
                  <div style={{fontSize:10, color:'#94a3b8', lineHeight:1.4, marginTop:3}}>{v.desc}</div>
                </button>
              ))}
            </div>

            {/* Pro Voice (ElevenLabs) voice picker */}
            {voicePref === 'pro' && (
              <div style={{marginBottom:12}}>
                {elKeyMissing ? (
                  <div style={{
                    background:'rgba(245,158,11,.08)', borderLeft:'3px solid #f59e0b',
                    padding:'10px 12px', borderRadius:6,
                    fontSize:12, color:'#fbbf24', lineHeight:1.5,
                  }}>
                    <strong>ElevenLabs key needed.</strong> Grab a free key at <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer" style={{color:'#fbbf24', textDecoration:'underline'}}>elevenlabs.io</a> (free tier: 10k characters/month — ~30 reels). Then add <code style={{background:'rgba(0,0,0,.3)', padding:'1px 5px', borderRadius:3}}>ELEVENLABS_API_KEY</code> to Vercel env vars and redeploy. Until then, Pro Voice falls back to your cloned voice.
                  </div>
                ) : elVoices.length === 0 ? (
                  <div style={{fontSize:11, color:'#94a3b8'}}>Loading voices…</div>
                ) : (
                  <>
                    <div style={S.fieldLabel}>ElevenLabs voice ({elVoices.length} available)</div>
                    <select
                      value={elVoiceId}
                      onChange={(e) => setElVoiceId(e.target.value)}
                      style={{...S.input, width:'100%', marginTop:5}}
                    >
                      {elVoices.map(v => (
                        <option key={v.voice_id} value={v.voice_id}>
                          {v.name}{v.labels?.gender ? ` · ${v.labels.gender}` : ''}{v.labels?.accent ? ` · ${v.labels.accent}` : ''}{v.category && v.category !== 'premade' ? ` · ${v.category}` : ''}
                        </option>
                      ))}
                    </select>
                    {(() => {
                      const picked = elVoices.find(v => v.voice_id === elVoiceId);
                      return picked?.preview_url ? (
                        <audio src={picked.preview_url} controls style={{width:'100%', marginTop:6, height:32}}/>
                      ) : null;
                    })()}
                    {elUsage && elUsage.character_limit > 0 && (
                      <div style={{marginTop:8, fontSize:11, color:'#94a3b8'}}>
                        <div style={{display:'flex', justifyContent:'space-between', marginBottom:3}}>
                          <span>{elUsage.tier} tier · {elUsage.character_count.toLocaleString()} / {elUsage.character_limit.toLocaleString()} chars used this month</span>
                          <span style={{color:'#b8864b', fontWeight:700}}>{Math.max(0, elUsage.character_limit - elUsage.character_count).toLocaleString()} left</span>
                        </div>
                        <div style={{height:4, background:'rgba(255,255,255,.06)', borderRadius:2, overflow:'hidden'}}>
                          <div style={{
                            width: `${Math.min(100, (elUsage.character_count / elUsage.character_limit) * 100)}%`,
                            height:'100%', background:'#b8864b',
                          }}/>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {voicePref === 'cloned' && !hasVoiceRef && (
              <div style={{
                background:'rgba(245,158,11,.08)', borderLeft:'3px solid #f59e0b',
                padding:'10px 12px', borderRadius:6, marginBottom:10,
                fontSize:12, color:'#fbbf24', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10,
              }}>
                <span>Record a 15-30 sec reference clip once. Every future reel uses YOUR voice.</span>
                <button onClick={() => setVoiceSetupOpen(true)} style={{
                  background:'#f59e0b', border:'none', borderRadius:6, padding:'6px 12px',
                  color:'#0f172a', fontSize:11.5, fontWeight:900, cursor:'pointer', flexShrink:0,
                }}>Set up voice</button>
              </div>
            )}

            {voicePref === 'cloned' && hasVoiceRef && (
              <div style={{fontSize:11.5, color:'#6ee7b7', marginBottom:10, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <span>✓ Your reference voice is saved · used for every narration</span>
                <button onClick={() => setVoiceSetupOpen(true)} style={{
                  background:'transparent', border:'none', color:'#94a3b8', cursor:'pointer',
                  fontSize:11, textDecoration:'underline',
                }}>Re-record</button>
              </div>
            )}

            <label style={{display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#cbd5e1', cursor:'pointer'}}>
              <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} style={{accentColor:'#b8864b'}}/>
              Burn in karaoke subtitles · words light up as spoken · TikTok-grade engagement (recommended)
            </label>
          </>
        )}
      </div>

      {/* ── Voice Setup Modal ── */}
      {voiceSetupOpen && (
        <VoiceSetupModal
          onClose={() => setVoiceSetupOpen(false)}
          onSaved={() => { setHasVoiceRef(true); setVoiceSetupOpen(false); toast?.success('Voice reference saved — every reel now uses your voice'); }}
          onCleared={() => { setHasVoiceRef(false); toast?.info('Voice reference cleared'); }}
          toast={toast}
        />
      )}

      {/* ── PLAN (step 1 of 2) ── */}
      <div style={S.card}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:14}}>
          <div>
            <div style={{fontSize:14, fontWeight:800, color:'#f1f5f9', marginBottom:4}}>
              {reviewPlan ? 'Plan ready — review below' : result ? 'Done · scroll down' : 'Step 1: AI plans the reel'}
            </div>
            <div style={{fontSize:12, color:'#94a3b8'}}>
              {photos.length < 3
                ? `Add ${3 - photos.length} more photo${3 - photos.length === 1 ? '' : 's'} to start`
                : reviewPlan
                  ? 'AI picked your best photos, ordered them, wrote labels + script. Edit any wrong labels below, then hit Render.'
                  : `${photos.length} photos · ${vibeDef.name} vibe · ${aspect} — click to have AI analyze + write copy first`}
            </div>
          </div>
          {!reviewPlan && (
            <button onClick={planReel} disabled={!canGenerate} style={{
              ...S.primaryBtn,
              opacity: canGenerate ? 1 : 0.4, cursor: canGenerate ? 'pointer' : 'not-allowed',
            }}>
              {busy ? <Loader size={16} className="spin"/> : <Wand2 size={16}/>}
              {busy ? 'Planning…' : 'Plan Reel'}
            </button>
          )}
        </div>

        {(busy || progress > 0) && !result && (
          <div style={{marginTop:14}}>
            <div style={{fontSize:11.5, color:'#cbd5e1', marginBottom:6, display:'flex', justifyContent:'space-between'}}>
              <span>{progressLabel}</span>
              <span style={{color:'#b8864b', fontWeight:800}}>{Math.round(progress * 100)}%</span>
            </div>
            <div style={{height:6, background:'rgba(255,255,255,.06)', borderRadius:3, overflow:'hidden'}}>
              <div style={{
                width: `${progress * 100}%`, height:'100%',
                background:'linear-gradient(90deg, #b8864b, #d4a017)',
                transition:'width .3s ease',
              }}/>
            </div>
          </div>
        )}

        {log.length > 0 && (
          <details style={{marginTop:14}}>
            <summary style={{fontSize:11, color:'#64748b', cursor:'pointer'}}>Show process log</summary>
            <div style={{
              marginTop:8, padding:'10px 12px', background:'rgba(0,0,0,.4)', borderRadius:6,
              fontFamily:'monospace', fontSize:11, color:'#7eb8f7', maxHeight:200, overflow:'auto',
            }}>
              {log.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          </details>
        )}
      </div>

      {/* ── REVIEW PANEL (between plan and final render) ── */}
      {reviewPlan && !result && (
        <div style={{
          ...S.card,
          borderColor:'rgba(184,134,75,.5)',
          background:'linear-gradient(180deg, rgba(184,134,75,.10), rgba(15,20,38,.6))',
        }}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:10}}>
            <div>
              <div style={{...S.cardLabel, color:'#d4a017', marginBottom:4}}>✏️ Review & edit before rendering</div>
              <div style={{fontSize:11.5, color:'#94a3b8'}}>
                AI guessed the labels from each photo. If anything's wrong or off-brand, fix it here. These are what shows on screen.
              </div>
            </div>
            <button onClick={cancelPlan} disabled={busy} style={{
              ...S.ghostBtn, color:'#fca5a5', borderColor:'rgba(239,68,68,.3)',
            }}>
              <X size={13}/> Discard plan
            </button>
          </div>

          {/* Hook (on-screen opening text) */}
          <div style={{marginBottom:14}}>
            <div style={S.fieldLabel}>Hook (big text on the opening slide)</div>
            <input
              type="text"
              value={reviewPlan.narrative.hook || ''}
              onChange={(e) => updateReviewNarrative({ hook: e.target.value })}
              style={{...S.input, width:'100%', marginTop:5, fontSize:14, fontWeight:700}}
              maxLength={60}
            />
          </div>

          {/* Per-scene labels */}
          <div style={{marginBottom:14}}>
            <div style={S.fieldLabel}>Per-scene labels (the text that pops up on each photo)</div>
            <div style={{fontSize:10.5, color:'#64748b', marginTop:4, marginBottom:8}}>
              Empty = no label shows (often best). Use ALL-CAPS 2-4 words describing the feature visible ("WHITE QUARTZ ISLAND", "VAULTED CEILINGS"). NOT generic room names.
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:8}}>
              {reviewPlan.scenes.map((s, i) => {
                const label = reviewPlan.narrative.sceneLabels?.[i] || '';
                const url = s.photo?.url || (s.photo?.file ? URL.createObjectURL(s.photo.file) : '');
                return (
                  <div key={i} style={{
                    display:'flex', gap:10, alignItems:'center',
                    padding:'8px 10px', background:'rgba(0,0,0,.25)', borderRadius:8,
                  }}>
                    <div style={{
                      width:60, height:60, borderRadius:6, overflow:'hidden', flexShrink:0,
                      background:'#000',
                    }}>
                      {url && <img src={url} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}}/>}
                    </div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:10, color:'#94a3b8', marginBottom:3, display:'flex', gap:8, alignItems:'center'}}>
                        <span style={{fontWeight:700}}>Scene {i + 1}</span>
                        <span style={{color:'#64748b'}}>· {s.room}</span>
                        {s.wasStaged && <span style={{color:'#b8864b', fontWeight:700}}>· virtually staged</span>}
                      </div>
                      <input
                        type="text"
                        value={label}
                        onChange={(e) => updateReviewSceneLabel(i, e.target.value.toUpperCase())}
                        placeholder='Leave blank to show NO label (often best) · or "WHITE QUARTZ ISLAND"'
                        style={{...S.input, width:'100%', fontSize:12.5, padding:'7px 10px'}}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Closing card text */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14}}>
            <div>
              <div style={S.fieldLabel}>Closing headline</div>
              <input
                type="text"
                value={reviewPlan.narrative.closingHeadline || ''}
                onChange={(e) => updateReviewNarrative({ closingHeadline: e.target.value })}
                style={{...S.input, width:'100%', marginTop:5}}
              />
            </div>
            <div>
              <div style={S.fieldLabel}>Closing CTA</div>
              <input
                type="text"
                value={reviewPlan.narrative.closingCta || ''}
                onChange={(e) => updateReviewNarrative({ closingCta: e.target.value })}
                style={{...S.input, width:'100%', marginTop:5}}
              />
            </div>
          </div>

          {/* Narration script (only if narration is on) */}
          {narration && reviewPlan.tourScript && (
            <div style={{marginBottom:14}}>
              <div style={S.fieldLabel}>Narration script (what you'll hear out loud · edit anything wrong before voice synthesis)</div>
              <textarea
                value={reviewPlan.tourScript.fullScript || ''}
                onChange={(e) => updateReviewScript(e.target.value)}
                rows={5}
                style={{...S.input, width:'100%', marginTop:5, resize:'vertical', fontFamily:'inherit', lineHeight:1.5}}
              />
              <div style={{fontSize:10.5, color:'#64748b', marginTop:4}}>
                Approximate length: ~{Math.round(reviewPlan.tourScript.fullScript.split(/\s+/).length / 2.4)} seconds spoken. Voice synthesis happens AFTER you hit Render.
              </div>
            </div>
          )}

          {/* Captions for posting (these don't show in the video, only used for posting later) */}
          <details style={{marginBottom:14}}>
            <summary style={{cursor:'pointer', fontSize:11.5, color:'#94a3b8', fontWeight:700}}>
              Edit Instagram / Facebook captions (for posting, not on the video) ▾
            </summary>
            <div style={{marginTop:10, display:'flex', flexDirection:'column', gap:10}}>
              <div>
                <div style={S.fieldLabel}>Instagram caption (text + hashtags)</div>
                <textarea
                  value={reviewPlan.narrative.igCaption || ''}
                  onChange={(e) => updateReviewNarrative({ igCaption: e.target.value })}
                  rows={4}
                  style={{...S.input, width:'100%', marginTop:5, resize:'vertical', fontFamily:'inherit', whiteSpace:'pre-wrap'}}
                />
              </div>
              <div>
                <div style={S.fieldLabel}>Facebook caption</div>
                <textarea
                  value={reviewPlan.narrative.fbCaption || ''}
                  onChange={(e) => updateReviewNarrative({ fbCaption: e.target.value })}
                  rows={3}
                  style={{...S.input, width:'100%', marginTop:5, resize:'vertical', fontFamily:'inherit'}}
                />
              </div>
            </div>
          </details>

          <div style={{display:'flex', gap:10, justifyContent:'flex-end', flexWrap:'wrap', alignItems:'center'}}>
            <div style={{fontSize:11, color:'#64748b', marginRight:'auto'}}>
              {aiMotion
                ? '⚠ AI motion ON — render will hit your Modal endpoint (~30 sec per scene). Make sure it\'s deployed.'
                : 'AI motion OFF — render uses the free in-browser Ken Burns pipeline (~60 sec total).'}
            </div>
            <button onClick={renderFinalReel} disabled={busy} style={{
              ...S.primaryBtn,
              opacity: busy ? 0.5 : 1,
            }}>
              {busy ? <Loader size={16} className="spin"/> : <Wand2 size={16}/>}
              {busy ? 'Rendering…' : 'Render Final Reel →'}
            </button>
          </div>
        </div>
      )}

      {/* ── RESULT ── */}
      {result && (
        <div style={{...S.card, borderColor:'rgba(184,134,75,.4)', background:'linear-gradient(180deg, rgba(184,134,75,.08), rgba(15,20,38,.6))'}}>
          <div style={{...S.cardLabel, color:'#d4a017', display:'flex', alignItems:'center', gap:6}}>
            <Check size={14}/> Your reel is ready
          </div>

          {/* Preview */}
          <div style={{
            background:'#000', borderRadius:12, overflow:'hidden', marginBottom:14,
            display:'flex', justifyContent:'center', maxHeight:520,
          }}>
            <video src={result.url} controls autoPlay loop style={{maxWidth:'100%', maxHeight:520, display:'block'}}/>
          </div>

          <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:14}}>
            <button onClick={download} style={S.primaryBtn}>
              <Download size={16}/> Download MP4
            </button>
            <button onClick={() => postToMeta(['facebook'])} disabled={busy} style={{
              ...S.ghostBtn,
              background:'rgba(24,119,242,.15)', borderColor:'rgba(24,119,242,.4)', color:'#60a5fa',
              opacity: busy ? 0.5 : 1,
            }}>
              <span style={{fontSize:15}}>📘</span> Post to Facebook
            </button>
            <button onClick={() => postToMeta(['instagram'])} disabled={busy} style={{
              ...S.ghostBtn,
              background:'rgba(228,64,95,.15)', borderColor:'rgba(228,64,95,.4)', color:'#f9a8d4',
              opacity: busy ? 0.5 : 1,
            }}>
              <span style={{fontSize:15}}>📷</span> Post to Instagram
            </button>
            <button onClick={() => postToMeta(['facebook','instagram'])} disabled={busy} style={{
              ...S.ghostBtn,
              opacity: busy ? 0.5 : 1,
            }}>
              <Sparkles size={15}/> Post to Both
            </button>
            <button onClick={reset} style={S.ghostBtn}>
              <RotateCcw size={15}/> Make Another
            </button>
          </div>

          {/* Generated copy */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px,1fr))', gap:10}}>
            <CopyCard label="Hook (on-screen)"        text={result.narrative.hook}/>
            <CopyCard label="Closing CTA"             text={result.narrative.closingCta}/>
            <CopyCard label="Instagram caption"       text={result.narrative.igCaption} multiline/>
            <CopyCard label="Facebook caption"        text={result.narrative.fbCaption} multiline/>
          </div>

          {/* Phase indicator while posting */}
          {(phase === 'upload' || phase === 'post') && (
            <div style={{marginTop:14, padding:10, background:'rgba(184,134,75,.1)', borderRadius:8, fontSize:12, color:'#e0b370', display:'flex', alignItems:'center', gap:8}}>
              <Loader size={14} className="spin"/> {progressLabel}
            </div>
          )}
        </div>
      )}

      {/* ── Meta connection hint ── */}
      {!meta.accessToken && (
        <div style={{...S.card, background:'rgba(245,158,11,.08)', borderColor:'rgba(245,158,11,.3)'}}>
          <div style={{display:'flex', gap:10, alignItems:'flex-start'}}>
            <AlertCircle size={18} color="#f59e0b" style={{flexShrink:0, marginTop:1}}/>
            <div style={{fontSize:12.5, color:'#fbbf24', lineHeight:1.5}}>
              <strong>To use auto-post:</strong> connect Facebook + Instagram in Settings → Integrations (already wired up if you've set up Social Engagement Agent). Until then, Download MP4 works and you can post manually.
            </div>
          </div>
        </div>
      )}

      <style>{`
        .spin { animation: spin 1.1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function CopyCard({ label, text, multiline }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    navigator.clipboard?.writeText(text || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{
      background:'rgba(0,0,0,.25)', border:'1px solid rgba(255,255,255,.06)',
      borderRadius:10, padding:12,
    }}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
        <div style={{fontSize:10, fontWeight:800, color:'#b8864b', letterSpacing:1.5, textTransform:'uppercase'}}>{label}</div>
        <button onClick={onCopy} style={{
          background: copied ? 'rgba(16,185,129,.2)' : 'rgba(255,255,255,.05)',
          border:'1px solid rgba(255,255,255,.1)', borderRadius:5,
          color: copied ? '#6ee7b7' : '#cbd5e1', fontSize:10, fontWeight:700,
          padding:'3px 8px', cursor:'pointer',
        }}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <div style={{
        fontSize:12, color:'#e2e8f0', lineHeight:1.5,
        whiteSpace: multiline ? 'pre-wrap' : 'normal',
        wordBreak:'break-word',
      }}>
        {text || '—'}
      </div>
    </div>
  );
}

// ── Voice setup modal ────────────────────────────────────────────────────────
// Record once, save reference audio to IndexedDB. Every future reel uses it.
function VoiceSetupModal({ onClose, onSaved, onCleared, toast }) {
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState(null); // { blob, url, name, durationSec }
  const [transcript, setTranscript] = useState(getRefTranscript() || '');
  const [busy, setBusy] = useState(false);
  const mediaRef = useRef();
  const chunksRef = useRef([]);
  const fileInputRef = useRef();
  const [stream, setStream] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        setStream(s);
      } catch (e) {
        toast?.error('Mic access denied');
      }
    })();
    return () => { stream?.getTracks?.()?.forEach(t => t.stop()); };
    // eslint-disable-next-line
  }, []);

  const startRec = () => {
    if (!stream) return;
    chunksRef.current = [];
    const mime = ['audio/webm;codecs=opus','audio/webm','audio/mp4']
      .find(m => MediaRecorder.isTypeSupported(m)) || 'audio/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime });
    rec.ondataavailable = e => e.data && e.data.size && chunksRef.current.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      const url = URL.createObjectURL(blob);
      const file = new File([blob], `voice_ref_${Date.now()}.webm`, { type: mime });
      file.name = file.name; // ensure name is preserved
      setRecorded({ blob: file, url, name: file.name });
    };
    mediaRef.current = rec;
    rec.start();
    setRecording(true);
  };

  const stopRec = () => {
    try { mediaRef.current?.stop(); } catch (e) {/* */}
    setRecording(false);
  };

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = '';
    const url = URL.createObjectURL(f);
    setRecorded({ blob: f, url, name: f.name });
  };

  const save = async () => {
    if (!recorded?.blob) return;
    setBusy(true);
    try {
      await saveVoiceRef(recorded.blob, transcript);
      onSaved?.();
    } catch (e) {
      toast?.error('Save failed: ' + e.message);
    }
    setBusy(false);
  };

  const clear = async () => {
    if (!window.confirm('Clear your saved voice reference?')) return;
    await clearVoiceRef();
    setRecorded(null);
    onCleared?.();
  };

  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20,
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'#0f172a', borderRadius:14, padding:24, maxWidth:560, width:'100%',
        border:'1px solid rgba(184,134,75,.3)', boxShadow:'0 20px 80px rgba(0,0,0,.5)',
      }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
          <div style={{fontSize:18, fontWeight:900, color:'#fff'}}>🎙️ Voice Setup</div>
          <button onClick={onClose} style={{background:'transparent', border:'none', color:'#94a3b8', fontSize:22, cursor:'pointer'}}>×</button>
        </div>

        <div style={{fontSize:13, color:'#cbd5e1', marginBottom:18, lineHeight:1.5}}>
          Record 15-30 seconds of yourself talking naturally. Read a few sentences out loud —
          e.g. "Hi, I'm Monica with RE/MAX Classic. I help families find home in Livonia and Metro Detroit."
          F5-TTS will clone your voice from this once and reuse it for every AutoReel narration.
        </div>

        <div style={{
          background:'rgba(0,0,0,.3)', borderRadius:10, padding:16, marginBottom:14,
          border:'1px solid rgba(255,255,255,.06)',
        }}>
          {!recorded ? (
            <>
              <div style={{textAlign:'center', marginBottom:14}}>
                <div style={{
                  width:80, height:80, borderRadius:'50%', margin:'0 auto 10px',
                  background: recording ? '#ef4444' : 'rgba(184,134,75,.2)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  border:`3px solid ${recording ? '#fca5a5' : '#b8864b'}`,
                  animation: recording ? 'pulse 1.4s ease-in-out infinite' : 'none',
                }}>
                  <div style={{fontSize:32}}>{recording ? '🔴' : '🎙️'}</div>
                </div>
                <div style={{fontSize:12, color:'#94a3b8'}}>
                  {recording ? 'Recording… read 2-3 sentences' : stream ? 'Tap to record' : 'Mic permission needed'}
                </div>
              </div>
              <div style={{display:'flex', gap:8, justifyContent:'center'}}>
                {!recording ? (
                  <button onClick={startRec} disabled={!stream} style={{
                    ...S.primaryBtn, opacity: stream ? 1 : 0.4,
                  }}>
                    🎙️ Start Recording
                  </button>
                ) : (
                  <button onClick={stopRec} style={{
                    ...S.primaryBtn, background:'linear-gradient(135deg, #ef4444, #b91c1c)', color:'#fff',
                  }}>
                    ⏹ Stop
                  </button>
                )}
                <button onClick={() => fileInputRef.current?.click()} style={S.ghostBtn}>
                  ⬆ Upload audio file
                </button>
                <input ref={fileInputRef} type="file" accept="audio/*" style={{display:'none'}} onChange={onPickFile}/>
              </div>
            </>
          ) : (
            <>
              <audio src={recorded.url} controls style={{width:'100%', marginBottom:10}}/>
              <div style={{fontSize:11, color:'#94a3b8', marginBottom:10}}>{recorded.name}</div>
              <div style={{display:'flex', gap:8}}>
                <button onClick={() => setRecorded(null)} style={S.ghostBtn}>↻ Re-record</button>
              </div>
            </>
          )}
        </div>

        {recorded && (
          <div style={{marginBottom:14}}>
            <div style={S.fieldLabel}>Transcript (what you said — improves clone accuracy)</div>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={3}
              placeholder="Hi, I'm Monica with RE/MAX Classic…"
              style={{...S.input, width:'100%', marginTop:5, resize:'vertical', fontFamily:'inherit'}}
            />
          </div>
        )}

        <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
          {hasVoiceRefSaved() && (
            <button onClick={clear} style={{
              ...S.ghostBtn, color:'#fca5a5', borderColor:'rgba(239,68,68,.3)',
            }}>
              Clear saved
            </button>
          )}
          <button onClick={onClose} style={S.ghostBtn}>Cancel</button>
          {recorded && (
            <button onClick={save} disabled={busy} style={{...S.primaryBtn, opacity: busy ? 0.5 : 1}}>
              {busy ? '…' : '✓ Save voice'}
            </button>
          )}
        </div>

        <style>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,.5); }
            50% { transform: scale(1.05); box-shadow: 0 0 0 12px rgba(239,68,68,0); }
          }
        `}</style>
      </div>
    </div>
  );
}

// ── Direct Meta posting helper ────────────────────────────────────────────────
// Mirrors App.js's publishPostToMeta() but lives here so AutoReel doesn't have
// to dig into App.js. Posts a video URL to FB and/or IG via Graph API v19.
async function postDirectly({ platforms, caption, videoUrl, meta }) {
  const errors = [];

  if (platforms.includes('facebook') && meta.pageId && meta.accessToken) {
    const r = await fetch(`https://graph.facebook.com/v19.0/${meta.pageId}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_url: videoUrl,
        description: caption,
        access_token: meta.accessToken,
      }),
    });
    const d = await r.json();
    if (d.error) errors.push('Facebook: ' + d.error.message);
  }

  if (platforms.includes('instagram') && meta.igAccountId && meta.accessToken) {
    // Step 1: create the IG media container
    const cr = await fetch(`https://graph.facebook.com/v19.0/${meta.igAccountId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type: 'REELS',
        video_url: videoUrl,
        caption,
        access_token: meta.accessToken,
      }),
    });
    const cd = await cr.json();
    if (cd.error) { errors.push('Instagram: ' + cd.error.message); }
    else {
      // Step 2: poll until processed (videos take a few sec to encode on Meta's side)
      let ready = false;
      for (let i = 0; i < 18; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const sr = await fetch(`https://graph.facebook.com/v19.0/${cd.id}?fields=status_code&access_token=${meta.accessToken}`);
        const sd = await sr.json();
        if (sd.status_code === 'FINISHED') { ready = true; break; }
        if (sd.status_code === 'ERROR') { errors.push('Instagram failed to process the video'); break; }
      }
      if (ready) {
        // Step 3: publish
        const pr = await fetch(`https://graph.facebook.com/v19.0/${meta.igAccountId}/media_publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creation_id: cd.id, access_token: meta.accessToken }),
        });
        const pd = await pr.json();
        if (pd.error) errors.push('Instagram publish: ' + pd.error.message);
      }
    }
  }

  if (errors.length) throw new Error(errors.join(' · '));
}
