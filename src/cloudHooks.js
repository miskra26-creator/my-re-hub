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
  const channelName = `user_data_${currentUserId}_${key}`;
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

async function idbGet(key) {
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

async function idbSet(key, value) {
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
        const serialized = JSON.stringify(cloudValue);
        const localSerialized = localStorage.getItem(key);
        if (serialized !== localSerialized) {
          latest.current = cloudValue;
          setValue(cloudValue);
          try { localStorage.setItem(key, serialized); } catch {}
        }
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
          if (JSON.stringify(cloud) !== JSON.stringify(local)) {
            latest.current = cloud;
            setValue(cloud);
            idbSet(key, cloud).catch(console.warn);
          }
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
