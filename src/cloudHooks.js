/**
 * cloudHooks.js — local-first hooks with optional Supabase sync.
 *
 * Same API as before:
 *   const [value, setValue, loaded] = useLS(key, default);
 *   const [value, setValue, loaded] = useIDB(key, default);
 *
 * Behavior:
 *   • Local storage (localStorage / IndexedDB) is always used — instant reads,
 *     works offline, no network round-trip on every render.
 *   • When Supabase is configured AND the user is signed in, every write is
 *     ALSO pushed to the cloud (debounced ~500ms), and changes from other
 *     devices flow back in via realtime subscriptions.
 *   • First login on a fresh device: cloud data downloads + replaces local.
 *   • First login from a device that has local data + empty cloud: local
 *     uploads to cloud (one-time migration).
 *
 * If Supabase env vars are missing or the user isn't signed in, this behaves
 * exactly like the previous local-only version.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isCloudEnabled } from './supabase';

const SAVE_DEBOUNCE_MS = 500;

// ── Auth state (module-level singleton) ─────────────────────────────────────
let currentUserId = null;
const authListeners = new Set();

if (isCloudEnabled) {
  supabase.auth.getUser().then(({ data }) => {
    currentUserId = data?.user?.id || null;
    authListeners.forEach((fn) => fn(currentUserId));
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    const newId = session?.user?.id || null;
    if (newId !== currentUserId) {
      currentUserId = newId;
      authListeners.forEach((fn) => fn(currentUserId));
    }
  });
}

function onAuthChange(fn) {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

// ── Cloud helpers ────────────────────────────────────────────────────────────
async function cloudGet(key) {
  if (!isCloudEnabled || !currentUserId) return undefined;
  try {
    const { data, error } = await supabase
      .from('user_data')
      .select('value')
      .eq('user_id', currentUserId)
      .eq('key', key)
      .maybeSingle();
    if (error) {
      console.warn(`[cloudGet ${key}]`, error.message);
      return undefined;
    }
    return data?.value;
  } catch (e) {
    console.warn(`[cloudGet ${key}] exception`, e.message);
    return undefined;
  }
}

async function cloudSet(key, value) {
  if (!isCloudEnabled || !currentUserId) return;
  try {
    const { error } = await supabase
      .from('user_data')
      .upsert(
        { user_id: currentUserId, key, value, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,key' }
      );
    if (error) console.warn(`[cloudSet ${key}]`, error.message);
  } catch (e) {
    console.warn(`[cloudSet ${key}] exception`, e.message);
  }
}

function cloudSubscribe(key, onChange) {
  if (!isCloudEnabled || !currentUserId) return () => {};
  // Unique suffix so React StrictMode double-mount doesn't collide on the
  // same channel name (Supabase forbids .on() after .subscribe() on a channel
  // that already exists in its registry).
  const channelName = `user_data_${currentUserId}_${key}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_data',
        filter: `user_id=eq.${currentUserId}`,
      },
      (payload) => {
        if (payload.new && payload.new.key === key) {
          onChange(payload.new.value);
        }
      }
    )
    .subscribe();
  return () => {
    try { supabase.removeChannel(channel); } catch {}
  };
}

// ── IndexedDB helpers ────────────────────────────────────────────────────────
const DB_NAME = 're-hub-db';
const DB_VERSION = 1;
const STORE = 'keyval';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function idbGet(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = (e) => resolve(e.target.result ?? null);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    console.warn('idbGet error', e);
    return null;
  }
}

export async function idbSet(key, value) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    console.warn('idbSet error', e);
  }
}

// Count how many keys in IDB start with a given prefix — used by the FUB
// migration tool to show "X of 6041 leads imported" without loading every
// blob into memory.
export async function idbCountByPrefix(prefix) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = (e) => {
        const keys = e.target.result || [];
        resolve(keys.filter(k => typeof k === 'string' && k.startsWith(prefix)).length);
      };
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

// ── Backup / restore ─────────────────────────────────────────────────────────
// The FUB import writes every note, call, text and email to IndexedDB and
// NOWHERE else — idbSet() does not sync to Supabase. In May the import finished
// 100%, was verified on screen, and by September the browser had silently
// evicted all of it. navigator.storage.persist() (see src/index.js) makes that
// much less likely, but "less likely" is not a backup. This is the backup:
// a plain JSON file on Monica's own disk that no browser can throw away.
//
// Written with a cursor rather than getAll() because the full export is ~300MB
// across 6,000 leads — materialising that as one JavaScript object, then one
// giant string, would risk an out-of-memory crash mid-backup. Instead each
// record is serialised individually and pushed onto an array of string parts;
// Blob() stitches them together and (in Firefox and Chrome) spills to disk
// rather than holding the whole thing in the JS heap.
//
// One malformed record must not cost her the other 5,999, so serialisation
// failures are skipped and reported instead of thrown.
export async function idbExportByPrefix(prefix, onProgress) {
  const db = await openDB();
  const parts = ['{"format":"my-re-hub-backup","version":1,"prefix":' +
    JSON.stringify(prefix) + ',"exportedAt":' + JSON.stringify(new Date().toISOString()) +
    ',"records":{'];
  let count = 0;
  let skipped = 0;

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) { resolve(); return; }
      const key = cursor.key;
      if (typeof key === 'string' && key.startsWith(prefix)) {
        try {
          parts.push((count ? ',' : '') + JSON.stringify(key) + ':' + JSON.stringify(cursor.value));
          count++;
          if (onProgress && count % 250 === 0) onProgress(count);
        } catch {
          skipped++;
        }
      }
      // Must continue synchronously — awaiting anything here would let the
      // IDB transaction auto-close and truncate the backup partway through.
      cursor.continue();
    };
    req.onerror = (e) => reject(e.target.error);
  });

  parts.push('}}');
  const blob = new Blob(parts, { type: 'application/json' });
  return { blob, count, skipped, bytes: blob.size };
}

// Restore a file produced by idbExportByPrefix. Writes in batches so a huge
// restore doesn't hold one transaction open for minutes, and so the UI can
// show progress. Existing keys are overwritten — a restore is "make local
// match this file", not a merge.
export async function idbImportBackup(text, onProgress) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON — it may be truncated or not a backup file.');
  }
  if (!parsed || parsed.format !== 'my-re-hub-backup' || !parsed.records) {
    throw new Error('That file is not a my-re-hub backup.');
  }

  const entries = Object.entries(parsed.records);
  const db = await openDB();
  const BATCH = 200;
  let written = 0;

  for (let i = 0; i < entries.length; i += BATCH) {
    const slice = entries.slice(i, i + BATCH);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const [k, v] of slice) store.put(v, k);
      tx.oncomplete = resolve;
      tx.onerror = (e) => reject(e.target.error);
    });
    written += slice.length;
    if (onProgress) onProgress(written, entries.length);
  }

  return { written, exportedAt: parsed.exportedAt || null };
}

// ── useLS — localStorage + Supabase sync ────────────────────────────────────
export function useLS(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const saveTimer = useRef(null);
  const latest = useRef(value);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const syncFromCloud = async () => {
      if (!isCloudEnabled || !currentUserId) return;
      const cloudValue = await cloudGet(key);
      if (!mounted.current) return;

      if (cloudValue !== undefined && cloudValue !== null) {
        // Trust cloud; don't stringify-compare (O(n) on large arrays).
        // An extra setValue is much cheaper than two JSON.stringify on a 5000-lead array.
        latest.current = cloudValue;
        setValue(cloudValue);
        try { localStorage.setItem(key, JSON.stringify(cloudValue)); } catch {}
      } else {
        // Cloud empty — upload local if we have it (migration)
        const localStr = localStorage.getItem(key);
        if (localStr !== null) {
          try { cloudSet(key, JSON.parse(localStr)); } catch {}
        }
      }
    };

    syncFromCloud();
    const unAuth = onAuthChange(() => syncFromCloud());

    const unsub = cloudSubscribe(key, (newValue) => {
      if (!mounted.current) return;
      latest.current = newValue;
      setValue(newValue);
      try { localStorage.setItem(key, JSON.stringify(newValue)); } catch {}
    });

    return () => {
      mounted.current = false;
      unAuth();
      unsub();
    };
  }, [key]);

  const set = useCallback((valOrFn) => {
    setValue((prev) => {
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      latest.current = next;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch (e) {
        console.warn('localStorage write failed', e);
      }
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        cloudSet(key, latest.current).catch(console.warn);
      }, SAVE_DEBOUNCE_MS);
      return next;
    });
  }, [key]);

  return [value, set, true];
}

// ── useIDB — IndexedDB + Supabase sync (for large values like receipts) ─────
export function useIDB(key, defaultValue) {
  const [value, setValue] = useState(defaultValue);
  const [loaded, setLoaded] = useState(false);
  const latest = useRef(defaultValue);
  const saveTimer = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    const init = async () => {
      const local = await idbGet(key);
      if (cancelled) return;
      if (local !== null && local !== undefined) {
        latest.current = local;
        setValue(local);
      }
      setLoaded(true);

      if (isCloudEnabled && currentUserId) {
        const cloud = await cloudGet(key);
        if (cancelled) return;
        if (cloud !== undefined && cloud !== null) {
          // Cloud is truth when present. Skip the stringify-compare (it was
          // O(n) on both sides — punishing on 5000-lead arrays). An extra
          // setValue is way cheaper than two JSON.stringify of a huge blob.
          latest.current = cloud;
          setValue(cloud);
          idbSet(key, cloud).catch(console.warn);
        } else if (local !== null && local !== undefined) {
          cloudSet(key, local).catch(console.warn);
        }
      }
    };

    init();

    const unAuth = onAuthChange(() => init());

    const unsub = cloudSubscribe(key, (newValue) => {
      if (!mounted.current) return;
      latest.current = newValue;
      setValue(newValue);
      idbSet(key, newValue).catch(console.warn);
    });

    return () => {
      cancelled = true;
      mounted.current = false;
      unAuth();
      unsub();
    };
  }, [key]);

  const set = useCallback((valOrFn) => {
    setValue((prev) => {
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      latest.current = next;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        idbSet(key, latest.current).catch(console.warn);
        cloudSet(key, latest.current).catch(console.warn);
      }, 300);
      return next;
    });
  }, [key]);

  return [value, set, loaded];
}
