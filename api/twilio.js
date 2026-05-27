/**
 * Twilio SMS sender (server-side).
 *
 * POST { to, body } with the signed-in user's Supabase access token as a
 * Bearer header. Sends via Twilio's REST API using server-only credentials so
 * the auth token is never exposed to the browser.
 *
 * Env vars (set in Vercel):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 *   (uses existing SUPABASE url/anon key to confirm the caller is signed in)
 *
 * Stays inert until the Twilio vars are set — returns { configured:false } so
 * the app falls back to drafting a manual Text task (its old behavior).
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }

  const SID = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const FROM = process.env.TWILIO_PHONE_NUMBER;
  if (!SID || !TOKEN || !FROM) {
    return res.status(503).json({
      ok: false,
      configured: false,
      error: 'Twilio not configured yet — add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER in Vercel.',
    });
  }

  // Only a signed-in user (Monica) may send — stops anyone hitting this public
  // endpoint and spending your Twilio balance.
  const accessToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const SUPA_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPA_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!accessToken || !SUPA_URL || !SUPA_ANON) {
    return res.status(401).json({ ok: false, error: 'Not authorized' });
  }
  try {
    const who = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPA_ANON },
    });
    if (!who.ok) return res.status(401).json({ ok: false, error: 'Not authorized' });
  } catch {
    return res.status(401).json({ ok: false, error: 'Auth check failed' });
  }

  const { to, body } = req.body || {};
  if (!to || !body) return res.status(400).json({ ok: false, error: 'Missing "to" or "body"' });

  // Normalize destination to E.164 (US default).
  let dest = String(to).replace(/[^\d+]/g, '');
  if (!dest.startsWith('+')) {
    if (dest.length === 10) dest = '+1' + dest;
    else if (dest.length === 11 && dest.startsWith('1')) dest = '+' + dest;
    else dest = '+' + dest;
  }

  try {
    const params = new URLSearchParams({ To: dest, From: FROM, Body: String(body).slice(0, 1500) });
    const tw = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = await tw.json();
    if (!tw.ok) {
      // Surface Twilio's own message (e.g. unverified number, A2P not registered).
      return res.status(tw.status).json({ ok: false, error: data?.message || 'Twilio error', code: data?.code });
    }
    return res.status(200).json({ ok: true, sid: data.sid, status: data.status, to: dest });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Twilio send failed: ' + e.message });
  }
}
