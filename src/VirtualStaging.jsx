/**
 * VirtualStaging — standalone tab.
 *
 * Drop in a vacant-room photo, pick a style, get back a photorealistic staged
 * version. Powered by Gemini 2.5 Flash Image (Monica's free key, 500/day).
 *
 * Workflow:
 *   1. Upload one or more photos
 *   2. Per-photo: pick room type + style + optional notes
 *   3. Stage all (sequential) — see before/after as each completes
 *   4. Download staged photos · or download all as a zip
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Upload, X, Sparkles, Download, RotateCcw, Loader, Check,
  AlertCircle, ImageIcon as ImageLucide, Wand2,
} from 'lucide-react';
import { STAGING_STYLES, STYLE_BY_ID, stagePhoto } from './aiVirtualStaging';

const ROOM_OPTIONS = [
  { id:'living',   label:'Living room' },
  { id:'primary',  label:'Primary bedroom' },
  { id:'bedroom',  label:'Bedroom' },
  { id:'kitchen',  label:'Kitchen' },
  { id:'dining',   label:'Dining room' },
  { id:'bath',     label:'Bathroom' },
  { id:'office',   label:'Home office / den' },
  { id:'basement', label:'Basement / rec room' },
  { id:'outdoor',  label:'Patio / outdoor' },
  { id:'entry',    label:'Entryway' },
];

// Visual language matches the rest of the app
const S = {
  card: {
    background: 'rgba(15,20,38,.6)', border: '1px solid rgba(255,255,255,.06)',
    borderRadius: 14, padding: 18, marginBottom: 14, backdropFilter: 'blur(10px)',
  },
  cardLabel: {
    fontSize: 11, fontWeight: 800, color: '#b8864b', letterSpacing: 2,
    textTransform: 'uppercase', marginBottom: 12,
  },
  fieldLabel: { fontSize: 10.5, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' },
  input: {
    background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 8, padding: '9px 12px', color: '#f1f5f9', fontSize: 13,
    outline: 'none', fontFamily: 'inherit',
  },
  primaryBtn: {
    background: 'linear-gradient(135deg, #b8864b, #d4a017)',
    border: 'none', borderRadius: 10, padding: '12px 22px',
    color: '#0f172a', fontSize: 14, fontWeight: 900, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 8,
    boxShadow: '0 6px 24px rgba(184,134,75,.35)',
  },
  ghostBtn: {
    background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 8, padding: '8px 14px', color: '#cbd5e1', fontSize: 12.5,
    fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
  },
};

export default function VirtualStaging({ setPage, toast }) {
  const [items, setItems] = useState([]); // [{ id, file, originalUrl, room, style, customNotes, status, stagedBlob?, stagedUrl?, error? }]
  const [globalStyle, setGlobalStyle] = useState('modern');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const fileRef = useRef();

  const addPhotos = useCallback((files) => {
    const arr = Array.from(files || []).filter(f => f.type.startsWith('image/'));
    const next = arr.map(f => ({
      id: 'p_' + Math.random().toString(36).slice(2),
      file: f,
      originalUrl: URL.createObjectURL(f),
      room: 'living',
      style: globalStyle,
      customNotes: '',
      status: 'idle',
    }));
    setItems(p => [...p, ...next]);
  }, [globalStyle]);

  const removeItem = (id) => {
    setItems(p => {
      const tgt = p.find(x => x.id === id);
      if (tgt) {
        URL.revokeObjectURL(tgt.originalUrl);
        if (tgt.stagedUrl) URL.revokeObjectURL(tgt.stagedUrl);
      }
      return p.filter(x => x.id !== id);
    });
  };

  // Cleanup on unmount
  useEffect(() => () => {
    items.forEach(it => {
      URL.revokeObjectURL(it.originalUrl);
      if (it.stagedUrl) URL.revokeObjectURL(it.stagedUrl);
    });
  }, []); // eslint-disable-line

  const updateItem = (id, patch) => {
    setItems(p => p.map(it => it.id === id ? { ...it, ...patch } : it));
  };

  // Stage a single photo
  const stageOne = async (item) => {
    setBusyId(item.id);
    updateItem(item.id, { status: 'staging', error: null });
    try {
      const result = await stagePhoto({
        photo: item.file,
        room: item.room,
        style: item.style,
        customNotes: item.customNotes,
      });
      const stagedUrl = URL.createObjectURL(result.blob);
      updateItem(item.id, {
        status: 'done',
        stagedBlob: result.blob,
        stagedMime: result.mime,
        stagedUrl,
      });
      toast?.success('Staged!');
    } catch (e) {
      updateItem(item.id, { status: 'error', error: e.message });
      toast?.error(e.message);
    }
    setBusyId(null);
  };

  // Batch: stage every photo sequentially
  const stageAll = async () => {
    if (!items.length) return;
    setBusy(true);
    for (const it of items) {
      if (it.status === 'done') continue;
      await stageOne(it);
    }
    setBusy(false);
  };

  // Regenerate a single photo (after Monica didn't like the first attempt)
  const regenerate = async (id) => {
    const it = items.find(x => x.id === id);
    if (!it) return;
    if (it.stagedUrl) URL.revokeObjectURL(it.stagedUrl);
    updateItem(id, { stagedBlob: null, stagedUrl: null, status: 'idle' });
    await stageOne(it);
  };

  const downloadOne = (it) => {
    if (!it.stagedBlob) return;
    const ext = (it.stagedMime || 'image/png').split('/')[1] || 'png';
    const safeRoom = it.room.toLowerCase();
    const a = document.createElement('a');
    a.href = it.stagedUrl;
    a.download = `staged-${safeRoom}-${Date.now()}.${ext}`;
    a.click();
  };

  const downloadAll = () => {
    items.filter(it => it.stagedBlob).forEach((it, i) => setTimeout(() => downloadOne(it), i * 250));
  };

  const setAllStyle = (styleId) => {
    setGlobalStyle(styleId);
    setItems(p => p.map(it => it.status === 'idle' ? { ...it, style: styleId } : it));
  };

  const doneCount = items.filter(it => it.status === 'done').length;

  return (
    <div className="page-content">
      {/* Header */}
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
            <Wand2 size={26} color="#0f172a" strokeWidth={2.5}/>
          </div>
          <div>
            <div className="page-title" style={{margin:0}}>Virtual Staging</div>
            <div className="page-sub" style={{margin:0}}>
              Empty room photo → photorealistic furnished version · powered by Gemini 2.5 Flash Image · 500/day free
            </div>
          </div>
        </div>
      </div>

      {/* Style picker (default for new uploads + bulk-apply) */}
      <div style={S.card}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:10}}>
          <div style={S.cardLabel}>① Pick a style</div>
          {items.length > 0 && (
            <button onClick={() => setAllStyle(globalStyle)} style={S.ghostBtn}>
              Apply to all unstaged
            </button>
          )}
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:10}}>
          {STAGING_STYLES.map(s => (
            <button
              key={s.id}
              onClick={() => setGlobalStyle(s.id)}
              style={{
                background: globalStyle === s.id ? 'linear-gradient(135deg, rgba(184,134,75,.25), rgba(212,160,23,.15))' : 'rgba(255,255,255,.03)',
                border: globalStyle === s.id ? '2px solid #b8864b' : '1px solid rgba(255,255,255,.08)',
                borderRadius: 12, padding: '14px 12px', cursor: 'pointer', textAlign: 'left',
              }}>
              <div style={{fontSize:22, marginBottom:6}}>{s.emoji}</div>
              <div style={{fontSize:13.5, fontWeight:900, color:'#f1f5f9', marginBottom:4}}>{s.name}</div>
              <div style={{fontSize:10.5, color:'#94a3b8', lineHeight:1.4}}>{s.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Upload + photo list */}
      <div style={S.card}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
          <div style={S.cardLabel}>② Upload empty room photos</div>
          <div style={{fontSize:11, color:'#64748b'}}>
            {items.length > 0 && `${items.length} photo${items.length === 1 ? '' : 's'} · ${doneCount} staged`}
          </div>
        </div>

        <input ref={fileRef} type="file" accept="image/*" multiple style={{display:'none'}}
          onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }}/>

        {items.length === 0 ? (
          <button onClick={() => fileRef.current?.click()} style={{
            width:'100%', padding:'40px 20px', borderRadius:12,
            background:'rgba(255,255,255,.03)', border:'2px dashed rgba(184,134,75,.4)',
            color:'#e0b370', fontSize:14, fontWeight:700, cursor:'pointer',
            display:'flex', flexDirection:'column', alignItems:'center', gap:10,
          }}>
            <Upload size={28}/>
            Upload empty room photos
            <span style={{fontSize:11, color:'#64748b', fontWeight:500}}>
              JPG / PNG · multiple OK · each gets staged separately
            </span>
          </button>
        ) : (
          <>
            <div style={{display:'flex', flexDirection:'column', gap:14, marginBottom:14}}>
              {items.map(it => (
                <PhotoCard
                  key={it.id}
                  item={it}
                  onRoom={(room) => updateItem(it.id, { room })}
                  onStyle={(style) => updateItem(it.id, { style })}
                  onNotes={(customNotes) => updateItem(it.id, { customNotes })}
                  onStage={() => stageOne(it)}
                  onRegenerate={() => regenerate(it.id)}
                  onRemove={() => removeItem(it.id)}
                  onDownload={() => downloadOne(it)}
                  disabled={busy || busyId === it.id}
                  busy={busyId === it.id}
                />
              ))}
            </div>

            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              <button onClick={() => fileRef.current?.click()} style={S.ghostBtn}>
                <Upload size={13}/> Add more
              </button>
              {items.some(it => it.status !== 'done') && (
                <button onClick={stageAll} disabled={busy} style={{...S.primaryBtn, opacity: busy ? 0.5 : 1}}>
                  {busy ? <Loader size={15} className="spin"/> : <Sparkles size={15}/>}
                  {busy ? 'Staging…' : `Stage all ${items.filter(it => it.status !== 'done').length} photos`}
                </button>
              )}
              {doneCount > 0 && (
                <button onClick={downloadAll} style={S.ghostBtn}>
                  <Download size={13}/> Download all staged ({doneCount})
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Tips */}
      <div style={{
        ...S.card,
        background:'rgba(184,134,75,.06)', borderColor:'rgba(184,134,75,.2)',
      }}>
        <div style={{fontSize:12, color:'#cbd5e1', lineHeight:1.6}}>
          <strong style={{color:'#e0b370'}}>💡 Best results:</strong> the AI adds furniture to your photo — it can't move walls or change the room layout. For best output:
          <ul style={{margin:'8px 0 0', paddingLeft:20}}>
            <li>Use well-lit photos taken at typical wide-angle (don't use fisheye)</li>
            <li>Pick the correct room type so the AI knows what furniture makes sense</li>
            <li>Hit "Re-generate" if the first attempt isn't quite right — each one's different</li>
            <li>For tricky rooms, add notes like "skip the rug" or "add a corner fireplace seating area"</li>
          </ul>
        </div>
      </div>

      <style>{`
        .spin { animation: spin 1.1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Per-photo card ────────────────────────────────────────────────────────────
function PhotoCard({ item, onRoom, onStyle, onNotes, onStage, onRegenerate, onRemove, onDownload, disabled, busy }) {
  const styleDef = STYLE_BY_ID[item.style] || STAGING_STYLES[0];
  const hasResult = item.status === 'done' && item.stagedUrl;

  return (
    <div style={{
      background:'rgba(0,0,0,.25)', border:'1px solid rgba(255,255,255,.06)',
      borderRadius:12, padding:14,
    }}>
      <div style={{display:'grid', gridTemplateColumns: hasResult ? '1fr 1fr' : '180px 1fr', gap:14, alignItems:'flex-start'}}>
        {/* Original */}
        <div style={{position:'relative'}}>
          <div style={{
            fontSize:10, fontWeight:800, color:'#64748b', letterSpacing:1.5, textTransform:'uppercase', marginBottom:6,
          }}>Original {hasResult && '· empty'}</div>
          <div style={{background:'#000', borderRadius:8, overflow:'hidden', aspectRatio: hasResult ? '4/3' : '4/3'}}>
            <img src={item.originalUrl} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}}/>
          </div>
        </div>

        {/* Staged result (only after staging completes) */}
        {hasResult && (
          <div style={{position:'relative'}}>
            <div style={{
              fontSize:10, fontWeight:800, color:'#b8864b', letterSpacing:1.5, textTransform:'uppercase', marginBottom:6,
              display:'flex', alignItems:'center', gap:6,
            }}>
              <Check size={12}/> Staged · {styleDef.name}
            </div>
            <div style={{background:'#000', borderRadius:8, overflow:'hidden', aspectRatio:'4/3', border:'2px solid #b8864b'}}>
              <img src={item.stagedUrl} alt="" style={{width:'100%', height:'100%', objectFit:'cover'}}/>
            </div>
          </div>
        )}

        {/* Controls (shown only before result) */}
        {!hasResult && (
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            <div style={{display:'flex', gap:8}}>
              <div style={{flex:1}}>
                <div style={S.fieldLabel}>Room</div>
                <select value={item.room} onChange={(e) => onRoom(e.target.value)} disabled={disabled} style={{...S.input, width:'100%', marginTop:4}}>
                  {ROOM_OPTIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
              <div style={{flex:1}}>
                <div style={S.fieldLabel}>Style</div>
                <select value={item.style} onChange={(e) => onStyle(e.target.value)} disabled={disabled} style={{...S.input, width:'100%', marginTop:4}}>
                  {STAGING_STYLES.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <div style={S.fieldLabel}>Extra notes (optional)</div>
              <input
                type="text"
                value={item.customNotes}
                onChange={(e) => onNotes(e.target.value)}
                disabled={disabled}
                placeholder="e.g. add a fireplace, keep it bright, no rug"
                style={{...S.input, width:'100%', marginTop:4}}
              />
            </div>

            {item.status === 'staging' && (
              <div style={{display:'flex', alignItems:'center', gap:8, color:'#e0b370', fontSize:12, marginTop:4}}>
                <Loader size={14} className="spin"/> Generating…
              </div>
            )}
            {item.status === 'error' && (
              <div style={{
                background:'rgba(239,68,68,.1)', borderLeft:'3px solid #ef4444',
                padding:'8px 10px', borderRadius:6, fontSize:11, color:'#fca5a5',
              }}>
                <AlertCircle size={12} style={{verticalAlign:'middle', marginRight:6}}/>
                {item.error}
              </div>
            )}

            <div style={{display:'flex', gap:6, marginTop:6}}>
              <button onClick={onStage} disabled={disabled} style={{
                ...S.primaryBtn, padding:'8px 16px', fontSize:12.5,
                opacity: disabled ? 0.5 : 1,
              }}>
                {busy ? <Loader size={13} className="spin"/> : <Sparkles size={13}/>}
                {busy ? 'Staging…' : 'Stage this photo'}
              </button>
              <button onClick={onRemove} style={{
                ...S.ghostBtn, padding:'8px 12px', fontSize:12,
                color:'#fca5a5', borderColor:'rgba(239,68,68,.3)',
              }}>
                <X size={12}/> Remove
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action row when result is ready */}
      {hasResult && (
        <div style={{display:'flex', gap:8, marginTop:12, flexWrap:'wrap'}}>
          <button onClick={onDownload} style={S.primaryBtn}>
            <Download size={14}/> Download staged
          </button>
          <button onClick={onRegenerate} disabled={disabled} style={S.ghostBtn}>
            <RotateCcw size={13}/> Re-generate
          </button>
          <button onClick={onRemove} style={{
            ...S.ghostBtn, color:'#fca5a5', borderColor:'rgba(239,68,68,.3)',
          }}>
            <X size={13}/> Remove
          </button>
          <div style={{flex:1}}/>
          <div style={{display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#64748b'}}>
            Drag the staged image anywhere — or use it in AutoReel
          </div>
        </div>
      )}
    </div>
  );
}
