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
  ArrowRight, RotateCcw, Check, Loader, Facebook, Instagram, AlertCircle,
} from 'lucide-react';
import { supabase, isCloudEnabled } from './supabase';
import { useLS } from './cloudHooks';
import {
  VIBES, VIBE_BY_ID, ROOM_ORDER,
  curatePhotos, buildSceneOrder, generateNarrative,
} from './aiAutoReel';
import { renderCinematicReel, REEL_MUSIC, pickRandomTrack } from './cinematicRender';

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

  // ── Async state ─────────────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(''); // 'curate'|'narrate'|'render'|'upload'|'post'
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [log, setLog] = useState([]);
  const [result, setResult] = useState(null); // { blob, url, narrative, scenes, publicUrl? }
  const [meta] = useLS('integrations.meta', { accessToken: '', pageId: '', igAccountId: '' });
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

  const generate = async () => {
    if (photos.length < 3) {
      toast?.error('Add at least 3 photos');
      return;
    }
    setBusy(true);
    setResult(null);
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

      // Build scenes with photo refs
      const scenes = ordered.map(o => ({
        photo: photos[o.index],
        room:  o.room,
        label: o.label,
        score: o.score,
      }));

      // ── Phase 2: Narrative ────────────────────────────────────────────────
      setPhase('narrate');
      setProgressLabel('Writing hook + scene labels…');
      addLog('Generating AI copy: hook, scene labels, CTA, captions');
      const narrative = await generateNarrative({
        scenes, listing, vibe,
        agentVoice, agent: profile,
      });
      addLog(`Hook: "${narrative.hook}"`);
      setProgress(0.40);

      // ── Phase 3: Render ───────────────────────────────────────────────────
      setPhase('render');
      setProgressLabel('Rendering cinematic reel…');
      addLog('Starting cinematic render');

      // Pick a music track matching the vibe's music category
      const music = pickRandomTrack(vibeDef.music);
      addLog(`Music: ${music?.name || '(silent)'}`);

      const renderRes = await renderCinematicReel({
        scenes, narrative, brand, vibe,
        music: music ? { url: music.url, volume: 0.7 } : null,
        opts: {
          aspect,
          quality: 'high',
          onProgress: (p, label) => {
            // Render is 40-95% of overall
            setProgress(0.40 + 0.55 * p);
            if (label) setProgressLabel(label);
          },
          onLog: addLog,
        },
      });
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
      setProgress(1);
      setProgressLabel('Done');
      setPhase('');
      toast?.success(`Reel rendered! (${renderRes.durationSec.toFixed(1)}s)`);
    } catch (e) {
      addLog(`ERROR: ${e.message}`);
      toast?.error('Generation failed: ' + e.message);
      setPhase('');
    } finally {
      setBusy(false);
    }
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

        <div style={{display:'flex', gap:10, marginTop:14, flexWrap:'wrap'}}>
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

      {/* ── GENERATE ── */}
      <div style={S.card}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:14}}>
          <div>
            <div style={{fontSize:14, fontWeight:800, color:'#f1f5f9', marginBottom:4}}>Ready to make magic?</div>
            <div style={{fontSize:12, color:'#94a3b8'}}>
              {photos.length < 3
                ? `Add ${3 - photos.length} more photo${3 - photos.length === 1 ? '' : 's'} to start`
                : `${photos.length} photos · ${vibeDef.name} vibe · ${aspect}`}
            </div>
          </div>
          <button onClick={generate} disabled={!canGenerate} style={{
            ...S.primaryBtn,
            opacity: canGenerate ? 1 : 0.4, cursor: canGenerate ? 'pointer' : 'not-allowed',
          }}>
            {busy ? <Loader size={16} className="spin"/> : <Wand2 size={16}/>}
            {busy ? 'Generating…' : 'Generate Reel'}
          </button>
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
              <Facebook size={15}/> Post to Facebook
            </button>
            <button onClick={() => postToMeta(['instagram'])} disabled={busy} style={{
              ...S.ghostBtn,
              background:'rgba(228,64,95,.15)', borderColor:'rgba(228,64,95,.4)', color:'#f9a8d4',
              opacity: busy ? 0.5 : 1,
            }}>
              <Instagram size={15}/> Post to Instagram
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
