/**
 * cloudHooks.js — local storage hooks (localStorage + IndexedDB)
 * Same interface as before — no Supabase required for local use.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── useLS — localStorage hook ────────────────────────────────────────────────
export function useLS(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch { return defaultValue; }
  });

  const set = useCallback((valOrFn) => {
    setValue(prev => {
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch(e) { console.warn('localStorage write failed', e); }
      return next;
    });
  }, [key]);

  return [value, set, true];
}

// ─── useIDB — IndexedDB hook for leads ───────────────────────────────────────
const DB_NAME = 're-hub-db';
const DB_VERSION = 1;
const STORE = 'keyval';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function idbGet(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = e => resolve(e.target.result ?? null);
      req.onerror = e => reject(e.target.error);
    });
  } catch(e) { console.warn('idbGet error', e); return null; }
}

async function idbSet(key, value) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = e => reject(e.target.error);
    });
  } catch(e) { console.warn('idbSet error', e); }
}

export function useIDB(key, defaultValue) {
  const [value, setValue] = useState(defaultValue);
  const [loaded, setLoaded] = useState(false);
  const latestValue = useRef(defaultValue);
  const saveTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    idbGet(key).then(raw => {
      if (cancelled) return;
      if (raw !== null && raw !== undefined) {
        setValue(raw);
        latestValue.current = raw;
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
    return () => { cancelled = true; };
  }, [key]);

  const set = useCallback((valOrFn) => {
    setValue(prev => {
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      latestValue.current = next;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        idbSet(key, latestValue.current).catch(console.warn);
      }, 300);
      return next;
    });
  }, [key]);

  return [value, set, loaded];
}
