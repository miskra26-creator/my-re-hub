/**
 * serverData.js — read/write Monica's `user_data` rows from a server.
 *
 * The browser talks to Supabase with the anon key, and row-level security ties
 * every row to the signed-in user. That is correct for the app and useless for
 * a scheduled job, which has no session. Cron jobs therefore use the
 * service-role key, which bypasses RLS.
 *
 * SECURITY: SUPABASE_SERVICE_ROLE_KEY must exist ONLY as a Vercel environment
 * variable. It must never be named REACT_APP_* — Create React App inlines every
 * REACT_APP_* var into the public JS bundle, which would hand full read/write
 * access to her whole database to anyone who views source.
 */

const URL_BASE = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function serverDataConfigured() {
  return Boolean(URL_BASE && SERVICE_KEY);
}

const headers = () => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
});

/**
 * This is a single-operator CRM: one real user. Rather than making her hunt
 * down a UUID in the Supabase dashboard, resolve it once from the admin API.
 * OWNER_USER_ID overrides it if a second account ever exists.
 */
let cachedOwner = null;
export async function ownerUserId() {
  if (process.env.OWNER_USER_ID) return process.env.OWNER_USER_ID;
  if (cachedOwner) return cachedOwner;
  const res = await fetch(`${URL_BASE}/auth/v1/admin/users?per_page=2`, { headers: headers() });
  if (!res.ok) throw new Error(`could not list users: HTTP ${res.status}`);
  const json = await res.json();
  const users = json.users || [];
  if (!users.length) throw new Error('no Supabase user found');
  // More than one account means "the owner" is a guess, and a wrong guess here
  // sends real email to real clients from the wrong dataset. Refuse instead.
  if (users.length > 1) {
    throw new Error('multiple users exist — set OWNER_USER_ID explicitly');
  }
  cachedOwner = users[0].id;
  return cachedOwner;
}

/** Read one key. Returns `fallback` when the row is missing. */
export async function getKey(key, fallback = null) {
  const uid = await ownerUserId();
  const url = `${URL_BASE}/rest/v1/user_data?user_id=eq.${uid}&key=eq.${encodeURIComponent(key)}&select=value`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`read ${key}: HTTP ${res.status}`);
  const rows = await res.json();
  return rows.length ? rows[0].value : fallback;
}

/** Upsert one key. */
export async function setKey(key, value) {
  const uid = await ownerUserId();
  const res = await fetch(`${URL_BASE}/rest/v1/user_data?on_conflict=user_id,key`, {
    method: 'POST',
    headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ user_id: uid, key, value, updated_at: new Date().toISOString() }]),
  });
  if (!res.ok) throw new Error(`write ${key}: HTTP ${res.status} ${await res.text()}`);
  return true;
}
