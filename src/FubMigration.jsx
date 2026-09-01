/**
 * FubMigration.jsx — one-time mass importer that pulls every note, event,
 * text, call, and email from Follow Up Boss into IndexedDB. After it runs,
 * ContactDetail reads from local storage instead of calling FUB on every
 * open — meaning Monica can cancel FUB and lose nothing.
 *
 * Architecture:
 *   • Per-lead key in IDB: `fub_data_<leadId>` →
 *       { notes, events, texts, calls, emails, importedAt, fubId, error? }
 *   • Resumable: progress saved to localStorage `fub_import_progress`
 *     after every batch, so closing the tab and reopening picks up where it
 *     left off
 *   • Rate-limit aware: 5 parallel endpoints per lead, 2 leads concurrent,
 *     adaptive backoff on HTTP 429
 *   • Debug log: collects per-endpoint counts to diagnose the missing-texts
 *     issue ("FUB returned 0 textMessages for this lead but I see them in
 *     the FUB UI")
 *
 * Why IndexedDB and not Supabase:
 *   • 6041 leads × ~50KB FUB data = ~300MB. Supabase free tier is 500MB
 *     for the whole DB. IDB has multi-GB quota and is faster.
 *   • For cross-device sync we can layer Supabase on top later; not the
 *     critical path for "let me cancel FUB tomorrow."
 */

import React, { useState, useEffect, useRef } from 'react';
import { useLS } from './cloudHooks';
import { idbGet, idbSet, idbCountByPrefix, idbExportByPrefix, idbImportBackup } from './cloudHooks';

const PROGRESS_KEY = 'fub_import_progress';
const ENDPOINTS = ['notes', 'events', 'textMessages', 'calls', 'emails'];

// Build IDB key for a given lead's FUB data blob
const dataKey = (leadId) => `fub_data_${leadId}`;

// Pull the FUB API key the user stashed on the Integrations page so we can
// forward it as x-fub-key — same pattern syncFUB uses
function getFubKey() {
  try {
    return (JSON.parse(localStorage.getItem('integrations') || '{}')?.fub?.apiKey)
        || process.env.REACT_APP_FUB_API_KEY
        || '';
  } catch { return ''; }
}

// Fetch a single FUB endpoint for a given lead, returns the array of records
// (handling FUB's various response shapes). On 429 returns {retryAfter: ms}.
async function fetchEndpoint(endpoint, fubId, fubKey) {
  const url = `/api/fub/${endpoint}?personId=${fubId}&limit=100`;
  const r = await fetch(url, { headers: { 'x-fub-key': fubKey } });
  if (r.status === 429) {
    const retryAfter = parseInt(r.headers.get('retry-after') || '5', 10) * 1000;
    return { __rateLimit: true, retryAfter };
  }
  if (!r.ok) {
    return { __error: `HTTP ${r.status}` };
  }
  const data = await r.json().catch(() => ({}));
  // Response shape varies by endpoint:
  //   /notes → { notes: [...] }
  //   /events → { events: [...] }
  //   /textMessages → { textmessages: [...] }  ← LOWERCASE! This was the bug
  //   /calls → { calls: [...] }
  //   /emails → { emails: [...] }
  // Be robust: try multiple possible keys
  const possibleKeys = [endpoint, endpoint.toLowerCase(), endpoint + 's'];
  for (const k of possibleKeys) {
    if (Array.isArray(data[k])) return data[k];
  }
  // Last resort: find any array in the response
  for (const k of Object.keys(data)) {
    if (Array.isArray(data[k])) return data[k];
  }
  return [];
}

// Import one lead's worth of FUB data — all 5 endpoints in parallel
async function importLead(lead, fubKey, debugLog) {
  if (!lead.fubId) {
    return { skipped: true, reason: 'no fubId' };
  }
  const results = await Promise.all(
    ENDPOINTS.map(ep => fetchEndpoint(ep, lead.fubId, fubKey))
  );
  // Check for rate limit hits
  for (const r of results) {
    if (r?.__rateLimit) {
      return { rateLimited: true, retryAfter: r.retryAfter };
    }
  }
  const [notes, events, textMessages, calls, emails] = results;
  // Debug counts (push to global log for diagnosis)
  if (debugLog) {
    debugLog.push({
      leadId: lead.id,
      fubId: lead.fubId,
      counts: {
        notes: Array.isArray(notes) ? notes.length : 'ERR',
        events: Array.isArray(events) ? events.length : 'ERR',
        textMessages: Array.isArray(textMessages) ? textMessages.length : 'ERR',
        calls: Array.isArray(calls) ? calls.length : 'ERR',
        emails: Array.isArray(emails) ? emails.length : 'ERR',
      },
    });
  }
  const blob = {
    fubId: lead.fubId,
    notes: Array.isArray(notes) ? notes : [],
    events: Array.isArray(events) ? events : [],
    textMessages: Array.isArray(textMessages) ? textMessages : [],
    calls: Array.isArray(calls) ? calls : [],
    emails: Array.isArray(emails) ? emails : [],
    importedAt: Date.now(),
  };
  await idbSet(dataKey(lead.id), blob);
  const total = blob.notes.length + blob.events.length + blob.textMessages.length + blob.calls.length + blob.emails.length;
  return { ok: true, total, counts: { notes: blob.notes.length, events: blob.events.length, texts: blob.textMessages.length, calls: blob.calls.length, emails: blob.emails.length } };
}

export default function FubMigration({ toast }) {
  const [leads] = useLS('leads', []);
  const fubLeads = leads.filter(l => l.fubId);
  const [progress, setProgress] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null'); } catch { return null; }
  });
  const [running, setRunning] = useState(false);
  const [idbCount, setIdbCount] = useState(0);
  const [debugLog, setDebugLog] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const stopRef = useRef(false);
  // The auto-sync toggle — flips localStorage['fub_auto_sync_disabled']
  // which the useEffect in App.js reads on mount. After this is set,
  // my-re-hub stops auto-calling FUB on app load / window focus / every 10m.
  const [autoSyncDisabled, setAutoSyncDisabled] = useState(
    () => localStorage.getItem('fub_auto_sync_disabled') === '1'
  );
  const toggleAutoSync = () => {
    const next = !autoSyncDisabled;
    if (next) localStorage.setItem('fub_auto_sync_disabled', '1');
    else localStorage.removeItem('fub_auto_sync_disabled');
    setAutoSyncDisabled(next);
    toast.success(next
      ? '🛑 FUB auto-sync disabled — reads from local cache only'
      : '🔄 FUB auto-sync enabled — will pull updates every 10 min'
    );
  };

  // Count what's already in IDB on mount (for resume scenarios)
  useEffect(() => {
    idbCountByPrefix('fub_data_').then(setIdbCount);
  }, [progress?.lastCompletedIndex]);

  // Verification scan — opens IDB and sums up record counts across every
  // imported lead so Monica can SEE the data is there without opening
  // individual leads. Runs on demand from a button.
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const runVerification = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const counts = { leads: 0, notes: 0, events: 0, textMessages: 0, calls: 0, emails: 0 };
      const samples = [];
      let scanned = 0;
      for (const lead of fubLeads) {
        const blob = await idbGet(`fub_data_${lead.id}`);
        if (!blob) continue;
        counts.leads++;
        counts.notes += (blob.notes || []).length;
        counts.events += (blob.events || []).length;
        counts.textMessages += (blob.textMessages || []).length;
        counts.calls += (blob.calls || []).length;
        counts.emails += (blob.emails || []).length;
        // Save a few samples to display so Monica can sanity-check
        if (samples.length < 3 && ((blob.notes||[]).length + (blob.emails||[]).length) > 0) {
          samples.push({ name: lead.name, ...counts && {
            notes: (blob.notes||[]).length,
            emails: (blob.emails||[]).length,
            texts: (blob.textMessages||[]).length,
            calls: (blob.calls||[]).length,
          }});
        }
        scanned++;
        if (scanned % 500 === 0) await new Promise(r => setTimeout(r, 0));
      }
      setVerifyResult({ counts, samples });
      toast.success(`✓ Local DB verified — ${counts.leads.toLocaleString()} leads with data`);
    } catch (e) {
      toast.error('Verification failed: ' + e.message);
    }
    setVerifying(false);
  };

  // ── Backup to a real file on her computer ─────────────────────────────────
  // IndexedDB is the ONLY place the imported FUB history lives (idbSet never
  // touches Supabase). In May 2026 the import completed, was verified, and the
  // browser silently deleted it anyway. Everything below exists so that never
  // costs her the data again.
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupNote, setBackupNote] = useState('');
  const restoreInputRef = useRef(null);

  const downloadBackup = async () => {
    setBackupBusy(true);
    setBackupNote('Reading local database…');
    try {
      const { blob, count, skipped, bytes } = await idbExportByPrefix(
        'fub_data_',
        (n) => setBackupNote(`Packaging ${n.toLocaleString()} leads…`)
      );
      if (!count) {
        toast.error('Nothing to back up yet — no imported FUB data found.');
        setBackupNote('');
        setBackupBusy(false);
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `my-re-hub-fub-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke late — Firefox cancels an in-flight download if the object URL
      // is released too early on a file this large.
      setTimeout(() => URL.revokeObjectURL(url), 60000);

      const mb = (bytes / 1048576).toFixed(1);
      setBackupNote(`Saved ${count.toLocaleString()} leads (${mb} MB) to your Downloads folder${skipped ? ` · ${skipped} record(s) skipped` : ''}.`);
      toast.success(`💾 Backed up ${count.toLocaleString()} leads (${mb} MB)`);
    } catch (e) {
      setBackupNote('');
      toast.error('Backup failed: ' + e.message);
    }
    setBackupBusy(false);
  };

  const restoreBackup = async (file) => {
    if (!file) return;
    setBackupBusy(true);
    setBackupNote('Reading backup file…');
    try {
      const text = await file.text();
      setBackupNote('Restoring into local database…');
      const { written, exportedAt } = await idbImportBackup(
        text,
        (n, total) => setBackupNote(`Restoring ${n.toLocaleString()} of ${total.toLocaleString()}…`)
      );
      const when = exportedAt ? new Date(exportedAt).toLocaleDateString() : 'unknown date';
      setBackupNote(`Restored ${written.toLocaleString()} leads from the ${when} backup.`);
      toast.success(`✅ Restored ${written.toLocaleString()} leads`);
      idbCountByPrefix('fub_data_').then(setIdbCount);
    } catch (e) {
      setBackupNote('');
      toast.error('Restore failed: ' + e.message);
    }
    setBackupBusy(false);
  };

  const saveProgress = (p) => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
    setProgress(p);
  };

  const start = async () => {
    const fubKey = getFubKey();
    if (!fubKey) {
      toast.error('FUB key not found. Set it in Integrations → Follow Up Boss first.');
      return;
    }
    if (fubLeads.length === 0) {
      toast.error('No FUB-sourced leads to import. Run a FUB sync first to import contacts.');
      return;
    }
    setRunning(true);
    stopRef.current = false;
    const startIndex = (progress?.lastCompletedIndex ?? -1) + 1;
    if (startIndex === 0) {
      saveProgress({ startedAt: Date.now(), lastCompletedIndex: -1, totalLeads: fubLeads.length, recordsImported: 0, errors: [] });
    }
    const log = [];
    setDebugLog([]);
    const PARALLEL = 2; // 2 leads at a time × 5 endpoints each = 10 concurrent requests
    let cursor = startIndex;
    let recordsImported = progress?.recordsImported || 0;
    const errors = progress?.errors || [];

    while (cursor < fubLeads.length && !stopRef.current) {
      const slice = fubLeads.slice(cursor, cursor + PARALLEL);
      const results = await Promise.all(slice.map(l => importLead(l, fubKey, log)));
      // Handle rate limits — find any 429s, sleep that long, retry the same slice
      const rateLimitHit = results.find(r => r?.rateLimited);
      if (rateLimitHit) {
        const wait = Math.max(rateLimitHit.retryAfter, 2000);
        toast.info(`⏳ FUB rate limit — pausing ${Math.ceil(wait/1000)}s…`);
        await new Promise(r => setTimeout(r, wait));
        continue; // retry the same cursor
      }
      // Tally
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const lead = slice[i];
        if (r?.ok) recordsImported += r.total;
        else if (r?.__error || r?.error) errors.push({ leadId: lead.id, leadName: lead.name, error: r.__error || r.error });
      }
      cursor += slice.length;
      const newProgress = {
        ...(progress || {}),
        lastCompletedIndex: cursor - 1,
        totalLeads: fubLeads.length,
        recordsImported,
        errors,
        startedAt: progress?.startedAt || Date.now(),
      };
      saveProgress(newProgress);
      setDebugLog(prev => [...prev, ...log.splice(0)]);
      // Brief pause to keep UI responsive and respect FUB rate limits
      await new Promise(r => setTimeout(r, 250));
    }

    setRunning(false);
    if (stopRef.current) {
      toast.info('⏸ Import paused — click Resume to continue');
    } else {
      toast.success(`✅ FUB import complete — ${recordsImported.toLocaleString()} records saved across ${fubLeads.length} leads`);
      // Auto-disable FUB auto-sync on completion. The whole point of running
      // the migration was to stop depending on FUB live calls — flipping this
      // flag immediately enforces "read from local DB only" mode.
      if (localStorage.getItem('fub_auto_sync_disabled') !== '1') {
        localStorage.setItem('fub_auto_sync_disabled', '1');
        setAutoSyncDisabled(true);
        toast.success('🛑 FUB auto-sync disabled automatically — you are now reading from local cache only.');
      }
    }
    idbCountByPrefix('fub_data_').then(setIdbCount);
  };

  const pause = () => { stopRef.current = true; };

  const reset = () => {
    if (!window.confirm('Clear all imported FUB data and restart from scratch? This deletes the local cache (FUB itself is untouched).')) return;
    localStorage.removeItem(PROGRESS_KEY);
    setProgress(null);
    setDebugLog([]);
    // Note: we don't clear IDB entries here — the user might want them to persist
    // If they truly want a clean slate, they can run again over the same keys (overwrites)
    toast.info('Progress reset — click Start to begin a fresh import');
  };

  // Counts + ETA
  const done = progress?.lastCompletedIndex != null ? progress.lastCompletedIndex + 1 : 0;
  const remaining = Math.max(fubLeads.length - done, 0);
  const pct = fubLeads.length > 0 ? Math.round((done / fubLeads.length) * 100) : 0;
  const elapsed = progress?.startedAt ? (Date.now() - progress.startedAt) / 1000 : 0;
  const rate = done > 0 && elapsed > 0 ? done / elapsed : 0;
  const etaSec = rate > 0 ? Math.round(remaining / rate) : null;
  const etaStr = etaSec == null ? '—'
    : etaSec < 60 ? `${etaSec}s`
    : etaSec < 3600 ? `${Math.round(etaSec/60)} min`
    : `${(etaSec/3600).toFixed(1)} hr`;

  // Aggregated counts across debug log (sanity-check that texts/calls are coming through)
  const totalCounts = debugLog.reduce((acc, d) => {
    for (const k of Object.keys(d.counts)) {
      acc[k] = (acc[k] || 0) + (typeof d.counts[k] === 'number' ? d.counts[k] : 0);
    }
    return acc;
  }, {});

  return (
    <div className="col" style={{ maxWidth: 720 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9', fontFamily: "'DM Serif Display',serif" }}>
        🗄️ FUB Mass Import
      </div>
      <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.7 }}>
        Pulls every note, event, text, call, and email from Follow Up Boss into local storage <strong style={{ color: '#fff' }}>permanently</strong>. After this runs, contact details load from your local data — no FUB roundtrip on every open. Once it's done, you can cancel FUB and keep all your history.
      </div>

      {/* Status card */}
      <div className="glass-card" style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: "'DM Serif Display',serif" }}>
              {done.toLocaleString()} <span style={{ color: '#64748b', fontSize: 14 }}>/ {fubLeads.length.toLocaleString()} leads</span>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
              {idbCount.toLocaleString()} stored in local DB · {(progress?.recordsImported || 0).toLocaleString()} records imported · ETA {etaStr}
            </div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#b8864b', fontFamily: "'DM Serif Display',serif" }}>
            {pct}%
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ height: 8, background: 'rgba(255,255,255,.05)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #b8864b, #e0b370)',
            transition: 'width .3s',
          }} />
        </div>
      </div>

      {/* Auto-sync toggle — the "stop calling FUB every time I open the app" switch */}
      <div className="glass-card" style={{
        padding: '14px 16px',
        background: autoSyncDisabled ? 'rgba(16,185,129,.06)' : 'rgba(184,134,75,.06)',
        border: `1px solid ${autoSyncDisabled ? 'rgba(16,185,129,.2)' : 'rgba(184,134,75,.2)'}`,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 3 }}>
            {autoSyncDisabled ? '🛑 FUB auto-sync is OFF' : '🔄 FUB auto-sync is ON'}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
            {autoSyncDisabled
              ? 'my-re-hub reads from your local cache only. FUB is not called on app open. Turn this back on if you want fresh data from FUB.'
              : 'Pulls latest from FUB every 10 min + on app open. After migration completes, turn this OFF so you can cancel FUB.'}
          </div>
        </div>
        <button
          onClick={toggleAutoSync}
          style={{
            background: autoSyncDisabled ? '#10b981' : 'rgba(255,255,255,.08)',
            border: 'none', borderRadius: 8,
            padding: '8px 14px', fontSize: 11.5, fontWeight: 800,
            color: '#fff', cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}>
          {autoSyncDisabled ? 'Turn ON' : 'Turn OFF'}
        </button>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {/* Verify button appears once any data has been imported */}
        {idbCount > 0 && (
          <button className="btn" style={{
            background: 'rgba(16,185,129,.12)', color: '#6ee7b7',
            border: '1px solid rgba(16,185,129,.3)', width: 'fit-content',
          }} onClick={runVerification} disabled={verifying}>
            {verifying ? '⏳ Verifying…' : '✓ Verify Local Data'}
          </button>
        )}
        {!running && done < fubLeads.length && (
          <button className="btn btn-blue" onClick={start} style={{ width: 'fit-content' }}>
            {done > 0 ? '▶ Resume Import' : '▶ Start Import'}
          </button>
        )}
        {running && (
          <button className="btn" style={{ background: 'rgba(212,160,23,.15)', color: '#f0c040', border: '1px solid rgba(212,160,23,.3)', width: 'fit-content' }} onClick={pause}>
            ⏸ Pause
          </button>
        )}
        {done > 0 && !running && (
          <button className="btn" style={{ background: 'rgba(239,68,68,.08)', color: '#f87171', border: '1px solid rgba(239,68,68,.2)', width: 'fit-content' }} onClick={reset}>
            🔄 Reset Progress
          </button>
        )}
        {debugLog.length > 0 && (
          <button className="btn btn-ghost btn-sm" style={{ width: 'fit-content' }} onClick={() => setShowDebug(s => !s)}>
            {showDebug ? 'Hide' : 'Show'} debug log ({debugLog.length} leads)
          </button>
        )}
      </div>

      {/* ── Backup panel ────────────────────────────────────────────────────
          Deliberately always visible, not gated on idbCount, so the Restore
          path is reachable on a browser where the data has already been wiped
          — that is exactly the moment she needs it most. */}
      <div className="glass-card" style={{
        padding: '14px 16px',
        background: 'rgba(59,130,246,.06)',
        border: '1px solid rgba(59,130,246,.22)',
      }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>
          💾 Backup — a copy you own
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.55, marginBottom: 10 }}>
          Imported FUB history lives only in this browser. Browsers can delete it without warning —
          that already happened once. Download a backup file and keep it somewhere safe
          (Downloads is fine; a USB stick or Google Drive is better). If the data ever
          disappears again, Restore brings it back in seconds.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn" style={{
            background: 'rgba(59,130,246,.15)', color: '#93c5fd',
            border: '1px solid rgba(59,130,246,.35)', width: 'fit-content',
          }} onClick={downloadBackup} disabled={backupBusy}>
            {backupBusy ? '⏳ Working…' : '⬇ Download Backup'}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ width: 'fit-content' }}
            onClick={() => restoreInputRef.current?.click()} disabled={backupBusy}>
            ⬆ Restore from Backup
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';       // allow re-picking the same file later
              restoreBackup(f);
            }}
          />
          {backupNote && (
            <span style={{ fontSize: 11, color: '#cbd5e1' }}>{backupNote}</span>
          )}
        </div>
      </div>

      {/* Verification results — shown after Verify Local Data button click */}
      {verifyResult && (
        <div className="glass-card" style={{ padding: '16px 18px', background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.3)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 10 }}>
            ✅ Local DB verified — your FUB data is saved
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'Leads', n: verifyResult.counts.leads, c: '#fff' },
              { label: 'Notes', n: verifyResult.counts.notes, c: '#cbd5e1' },
              { label: 'Events', n: verifyResult.counts.events, c: '#b8864b' },
              { label: 'Texts', n: verifyResult.counts.textMessages, c: verifyResult.counts.textMessages > 0 ? '#3b82f6' : '#475569' },
              { label: 'Calls', n: verifyResult.counts.calls, c: '#10b981' },
              { label: 'Emails', n: verifyResult.counts.emails, c: '#ea4335' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center', padding: '8px 4px', background: 'rgba(0,0,0,.15)', borderRadius: 6 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: s.c, fontFamily: "'DM Serif Display',serif" }}>
                  {s.n.toLocaleString()}
                </div>
                <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .3 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {verifyResult.counts.textMessages === 0 && (
            <div style={{ padding: '8px 10px', background: 'rgba(212,160,23,.08)', border: '1px solid rgba(212,160,23,.25)', borderRadius: 6, fontSize: 11, color: '#f0c040', marginBottom: 8 }}>
              ⚠ <strong>Zero texts imported.</strong> This is the X-System bug — see RESEARCH_NOTES.md for the fix (register a system at apps.followupboss.com/system-registration + add FUB_SYSTEM env vars on Vercel, then re-run import).
            </div>
          )}
          <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
            All this data is now in your browser's IndexedDB. Lead detail pages read from here instead of calling FUB. You can cancel FUB and this data persists.
          </div>
        </div>
      )}

      {/* Realtime aggregated counts — proves texts/calls are coming through */}
      {debugLog.length > 0 && (
        <div className="glass-card" style={{ padding: '14px 16px', background: 'rgba(167,139,250,.04)', border: '1px solid rgba(167,139,250,.15)' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>
            What FUB has returned so far
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {['notes', 'events', 'textMessages', 'calls', 'emails'].map(k => (
              <div key={k} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', fontFamily: "'DM Serif Display',serif" }}>
                  {(totalCounts[k] || 0).toLocaleString()}
                </div>
                <div style={{ fontSize: 9.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .3 }}>{k}</div>
              </div>
            ))}
          </div>
          {totalCounts.textMessages === 0 && debugLog.length > 20 && (
            <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 6, fontSize: 11, color: '#f87171' }}>
              ⚠ FUB returned 0 texts across {debugLog.length} leads. Either no texts exist OR there's an API issue. Click "Show debug log" to inspect.
            </div>
          )}
        </div>
      )}

      {/* Debug log */}
      {showDebug && (
        <div className="glass-card" style={{ padding: '14px 16px', maxHeight: 320, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
          {debugLog.slice(-50).reverse().map((d, i) => (
            <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,.03)', color: '#94a3b8' }}>
              <span style={{ color: '#fff' }}>{d.leadId.slice(-8)}</span> ·
              n:{d.counts.notes} e:{d.counts.events} <span style={{ color: d.counts.textMessages > 0 ? '#6ee7b7' : '#475569' }}>t:{d.counts.textMessages}</span> c:{d.counts.calls} m:{d.counts.emails}
            </div>
          ))}
          {debugLog.length > 50 && <div style={{ color: '#475569', textAlign: 'center', padding: 6 }}>… {debugLog.length - 50} more entries above</div>}
        </div>
      )}

      {/* Error log */}
      {progress?.errors?.length > 0 && (
        <div className="glass-card" style={{ padding: '14px 16px', background: 'rgba(239,68,68,.04)', border: '1px solid rgba(239,68,68,.2)' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#f87171', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>
            {progress.errors.length} error{progress.errors.length === 1 ? '' : 's'}
          </div>
          {progress.errors.slice(0, 10).map((e, i) => (
            <div key={i} style={{ fontSize: 11, color: '#94a3b8', padding: '3px 0' }}>
              {e.leadName} → {e.error}
            </div>
          ))}
        </div>
      )}

      {/* Instructions */}
      <div className="info-banner info-blue">
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          <strong>How long will this take?</strong> Estimated {Math.ceil(fubLeads.length / 60)}–{Math.ceil(fubLeads.length / 30)} min for {fubLeads.length.toLocaleString()} leads at FUB's rate limits. Safe to close this tab — it resumes automatically. Run it overnight if needed.
        </div>
      </div>
    </div>
  );
}
