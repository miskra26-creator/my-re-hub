import { supabase } from './supabase';

/**
 * Send an SMS through the server-side Twilio function (/api/twilio).
 * Attaches the signed-in user's Supabase token so only Monica can send.
 * Throws on failure; err.notConfigured === true means Twilio creds aren't
 * set yet, so callers should fall back to drafting a manual Text task.
 */
export async function sendSms({ to, body }) {
  let token;
  try {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token;
  } catch { /* no session */ }

  const r = await fetch('/api/twilio', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ to, body }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) {
    const err = new Error(data.error || `SMS failed (${r.status})`);
    err.notConfigured = data.configured === false || r.status === 503;
    err.code = data.code;
    throw err;
  }
  return data; // { ok, sid, status, to }
}

/** Whether the user has turned on automatic SMS sending. */
export function smsAutoSendEnabled() {
  try { return localStorage.getItem('sms_autosend') === 'on'; } catch { return false; }
}
