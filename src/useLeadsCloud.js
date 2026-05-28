/**
 * useLeadsCloud — purpose-built hook for the `leads` table.
 *
 * WHY THIS EXISTS: previously leads were stored as one giant JSON blob in
 * user_data.value with key='leads'. At 6000+ leads:
 *   • Every read fetched ~2MB
 *   • Every write uploaded ~2MB
 *   • JSON.stringify on the array took 100-400ms
 *   • The whole app stuttered on every Add Lead form keystroke
 *
 * The new architecture stores one row per lead in the `leads` table:
 *   • Per-lead writes: a few hundred bytes (one UPSERT)
 *   • Realtime: per-row change events
 *   • Indexed for status / updated_at / fub_id queries
 *
 * MODULE-LEVEL STORE: all calls to useLeadsCloud() share one underlying
 * store. We fetch leads once from Supabase, subscribe once via realtime,
 * and broadcast changes to every subscriber. With 10+ components using
 * leads, this avoids 10× redundant fetches.
 *
 * Public API (same shape as useIDB for drop-in compatibility):
 *   const [leads, setLeads, loaded] = useLeadsCloud();
 *
 * `setLeads(arrayOrFn)` performs a smart diff and only sends changed rows
 * to Supabase. Old code that does `setLeads(p => [...p, newLead])` just
 * upserts the new lead — doesn't re-upload all 6000.
 *
 * Migration is automatic on first mount when:
 *   • Supabase `leads` table is empty for this user
 *   • IDB key 'leads' (legacy blob) has data
 * → upload IDB leads to Supabase in chunks, set a "migrated" flag in IDB.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase, isCloudEnabled } from './supabase';

const IDB_KEY = 'leads';
const IDB_MIGRATED_FLAG = 'leads_migrated_to_table_v3';
const CHUNK_SIZE = 500;
const SAVE_DEBOUNCE_MS = 400;

// ── Auth tracking ─────────────────────────────────────────────────────────
let currentUserId = null;
if (isCloudEnabled) {
  supabase.auth.getUser().then(({ data }) => {
    const id = data?.user?.id || null;
    if (id !== currentUserId) {
      currentUserId = id;
      store.handleAuthChange();
    }
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    const id = session?.user?.id || null;
    if (id !== currentUserId) {
      currentUserId = id;
      store.handleAuthChange();
    }
  });
}

// ── IndexedDB helpers ─────────────────────────────────────────────────────
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
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = (e) => resolve(e.target.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function idbSet(key, value) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch {}
}

// ── Row <-> Lead shape conversion ─────────────────────────────────────────
const COLUMN_FIELDS = ['id','name','email','phone','type','status','budget','area','notes','source','address'];

function leadToRow(lead, userId) {
  const row = { user_id: userId };
  COLUMN_FIELDS.forEach((f) => {
    if (lead[f] !== undefined) row[f] = String(lead[f] ?? '');
  });
  if (lead.fubId !== undefined) row.fub_id = lead.fubId;
  if (lead.tags !== undefined) row.tags = Array.isArray(lead.tags) ? lead.tags : [];
  if (lead.followUp !== undefined) row.follow_up = lead.followUp || null;
  const meta = {};
  Object.keys(lead).forEach((k) => {
    if (
      !COLUMN_FIELDS.includes(k) &&
      !['fubId','tags','followUp','createdAt','user_id','updated_at'].includes(k)
    ) {
      meta[k] = lead[k];
    }
  });
  if (Object.keys(meta).length) row.meta = meta;
  if (lead.createdAt) row.created_at = lead.createdAt;
  if (!row.id) row.id = `lead_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  return row;
}

function rowToLead(row) {
  const lead = {
    id: row.id,
    name: row.name || '',
    email: row.email || '',
    phone: row.phone || '',
    type: row.type || 'Buyer',
    status: row.status || 'warm',
    budget: row.budget || '',
    area: row.area || '',
    notes: row.notes || '',
    source: row.source || '',
    address: row.address || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    followUp: row.follow_up || '',
    createdAt: row.created_at || new Date().toISOString(),
  };
  if (row.fub_id) lead.fubId = row.fub_id;
  if (row.meta && typeof row.meta === 'object') {
    // Strip any column/reserved keys from meta before merging — earlier code
    // accidentally wrote `status` (and other column fields) into the JSONB
    // meta blob. Without this, stale meta.status overrode the real column on
    // every read, so a user's status edit would visually revert. Columns win.
    const cleanMeta = { ...row.meta };
    COLUMN_FIELDS.forEach((k) => delete cleanMeta[k]);
    ['fubId', 'tags', 'followUp', 'follow_up', 'createdAt', 'created_at', 'updated_at', 'user_id'].forEach((k) => delete cleanMeta[k]);
    Object.assign(lead, cleanMeta);
  }
  return lead;
}

// ── Cloud ops ─────────────────────────────────────────────────────────────
async function cloudFetchAll(userId) {
  const PAGE = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) { console.warn('[cloudFetchAll]', error.message); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all.map(rowToLead);
}

async function cloudUpsertBatch(leads, userId) {
  if (!leads.length) return { ok: 0, fail: 0 };
  const rows = leads.map((l) => leadToRow(l, userId));
  let ok = 0, fail = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    try {
      const { error } = await supabase
        .from('leads')
        .upsert(chunk, { onConflict: 'id' });
      if (error) { console.warn('[cloudUpsertBatch]', error.message); fail += chunk.length; }
      else ok += chunk.length;
    } catch (e) {
      console.warn('[cloudUpsertBatch exception]', e.message);
      fail += chunk.length;
    }
  }
  return { ok, fail };
}

async function cloudDeleteBatch(ids) {
  if (!ids.length) return;
  try {
    const { error } = await supabase.from('leads').delete().in('id', ids);
    if (error) console.warn('[cloudDeleteBatch]', error.message);
  } catch (e) {
    console.warn('[cloudDeleteBatch exception]', e.message);
  }
}

// ── Module-level shared store ─────────────────────────────────────────────
// Single source of truth for leads across the whole app.
const store = {
  leads: [],
  loaded: false,
  byId: new Map(),
  subscribers: new Set(),
  initStarted: false,
  channel: null,
  flushTimer: null,
  pending: { upserts: new Map(), deletes: new Set() },

  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  },

  notify() {
    this.subscribers.forEach((fn) => fn(this.leads, this.loaded));
  },

  setLeads(next) {
    const arr = Array.isArray(next) ? next : [];
    // Diff vs previous snapshot, queue cloud writes
    const newMap = new Map();
    arr.forEach((l) => {
      if (!l || !l.id) return;
      newMap.set(l.id, l);
      const old = this.byId.get(l.id);
      if (!old) {
        this.pending.upserts.set(l.id, l);
      } else if (old !== l) {
        // Quick field-level check (avoid full stringify)
        if (old.name !== l.name || old.email !== l.email || old.phone !== l.phone ||
            old.status !== l.status || old.type !== l.type || old.notes !== l.notes ||
            old.area !== l.area || old.budget !== l.budget || old.followUp !== l.followUp ||
            old.address !== l.address || old.source !== l.source ||
            JSON.stringify(old.tags||[]) !== JSON.stringify(l.tags||[])) {
          this.pending.upserts.set(l.id, l);
        }
      }
    });
    this.byId.forEach((_, id) => {
      if (!newMap.has(id)) this.pending.deletes.add(id);
    });
    this.byId = newMap;
    this.leads = arr;
    idbSet(IDB_KEY, arr).catch(() => {});
    this.scheduleFlush();
    this.notify();
  },

  scheduleFlush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), SAVE_DEBOUNCE_MS);
  },

  async flush() {
    if (!isCloudEnabled || !currentUserId) return;
    const upserts = Array.from(this.pending.upserts.values());
    const deletes = Array.from(this.pending.deletes);
    this.pending.upserts.clear();
    this.pending.deletes.clear();
    if (upserts.length) await cloudUpsertBatch(upserts, currentUserId);
    if (deletes.length) await cloudDeleteBatch(deletes);
  },

  async init() {
    if (this.initStarted) return;
    this.initStarted = true;

    // 1. Load IDB instantly so UI renders fast
    const local = await idbGet(IDB_KEY);
    const localLeads = Array.isArray(local) ? local : [];
    if (localLeads.length) {
      this.leads = localLeads;
      this.byId = new Map(localLeads.map((l) => [l.id, l]));
    }
    this.loaded = true;
    this.notify();

    if (!isCloudEnabled) return;

    // 2. Wait for auth if not yet set
    if (!currentUserId) {
      const start = Date.now();
      while (!currentUserId && Date.now() - start < 5000) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!currentUserId) return;
    }

    // 3. Fetch from cloud
    const cloud = await cloudFetchAll(currentUserId);

    if (cloud.length === 0 && localLeads.length > 0) {
      const flag = await idbGet(IDB_MIGRATED_FLAG);
      if (!flag) {
        console.log(`[useLeadsCloud] Migrating ${localLeads.length} leads from IDB → Supabase...`);
        const { ok, fail } = await cloudUpsertBatch(localLeads, currentUserId);
        console.log(`[useLeadsCloud] Migration complete: ${ok} ok, ${fail} fail`);
        await idbSet(IDB_MIGRATED_FLAG, { at: new Date().toISOString(), uploaded: ok, failed: fail });
      }
      // Keep local as truth, don't re-fetch
    } else if (cloud.length > 0) {
      // Cloud is truth
      this.leads = cloud;
      this.byId = new Map(cloud.map((l) => [l.id, l]));
      idbSet(IDB_KEY, cloud).catch(() => {});
      this.notify();
    }

    // 4. Realtime subscription
    this.subscribeRealtime();
  },

  subscribeRealtime() {
    if (!isCloudEnabled || !currentUserId || this.channel) return;
    const ch = supabase
      .channel('leads_store_' + currentUserId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'leads',
        filter: `user_id=eq.${currentUserId}`,
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = payload.old?.id;
          if (!id || !this.byId.has(id)) return;
          this.byId.delete(id);
          this.leads = this.leads.filter((l) => l.id !== id);
          idbSet(IDB_KEY, this.leads).catch(() => {});
          this.notify();
        } else {
          const lead = rowToLead(payload.new);
          const idx = this.leads.findIndex((l) => l.id === lead.id);
          if (idx === -1) {
            this.leads = [lead, ...this.leads];
          } else {
            this.leads = this.leads.map((l) => (l.id === lead.id ? lead : l));
          }
          this.byId.set(lead.id, lead);
          idbSet(IDB_KEY, this.leads).catch(() => {});
          this.notify();
        }
      })
      .subscribe();
    this.channel = ch;
  },

  handleAuthChange() {
    // Reset and re-init on auth change
    if (this.channel) {
      try { supabase.removeChannel(this.channel); } catch {}
      this.channel = null;
    }
    this.initStarted = false;
    this.init();
  },
};

// Kick off init on module load
if (typeof window !== 'undefined') {
  store.init();
}

// ── The hook ──────────────────────────────────────────────────────────────
export function useLeadsCloud() {
  const [, force] = useState(0);

  useEffect(() => {
    const unsub = store.subscribe(() => force((n) => n + 1));
    // Ensure init runs (idempotent)
    store.init();
    return unsub;
  }, []);

  const setLeads = useCallback((valOrFn) => {
    const next = typeof valOrFn === 'function' ? valOrFn(store.leads) : valOrFn;
    store.setLeads(next);
  }, []);

  return [store.leads, setLeads, store.loaded];
}
