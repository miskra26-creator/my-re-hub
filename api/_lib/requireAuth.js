/**
 * requireAuth.js — gate browser-facing API routes behind a real Supabase login.
 *
 * WHY THIS EXISTS (2026-09-10): the serverless routes under /api forward
 * requests using Monica's own server-side credentials — her FUB key, her Gemini
 * key, her Twilio account. None of them checked WHO was asking. Verified against
 * production: an anonymous `curl https://my-re-hub.vercel.app/api/fub/people`
 * with no login, no cookie and no key returned all 6,046 CRM contacts with
 * names, emails and phone numbers. /api/claude/messages answered anonymously
 * too, so anyone could burn her free Gemini quota, and /api/twilio could have
 * sent SMS billed to her.
 *
 * Removing the leaked key from the JS bundle closed one door; this closes the
 * other. The browser already holds a Supabase session, so we require its access
 * token and verify it with Supabase before doing anything expensive or private.
 *
 * DO NOT apply this to:
 *   - api/webhook/*     — Zillow/Realtor/Cloudmailin post here with no session.
 *   - api/cron/*        — scheduled jobs authenticate with CRON_SECRET instead.
 *
 * Fails CLOSED. If Supabase env vars are missing the route returns 503 rather
 * than silently serving everyone, because "auth is misconfigured" and "auth is
 * disabled" must never look the same to a caller.
 */

const URL_BASE = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON_KEY =
  process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

function bearer(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization || '';
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^Bearer\s+/i.test(value)) return null;
  const token = value.replace(/^Bearer\s+/i, '').trim();
  return token || null;
}

/**
 * Verify the caller is a signed-in user.
 *
 * Returns the Supabase user object on success. On failure it has ALREADY sent
 * the response, and returns null — so callers must simply `return` when null:
 *
 *   const user = await requireAuth(req, res);
 *   if (!user) return;
 */
export async function requireAuth(req, res) {
  if (!URL_BASE || !ANON_KEY) {
    res.status(503).json({
      error: 'auth not configured',
      hint: 'Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY in the Vercel project env.',
    });
    return null;
  }

  const token = bearer(req);
  if (!token) {
    res.status(401).json({ error: 'unauthorized', hint: 'Sign in to the Hub first.' });
    return null;
  }

  try {
    // Ask Supabase whether this token is real and unexpired. Cheap, and it means
    // we never have to hold a JWT signing secret in this codebase.
    const r = await fetch(`${URL_BASE}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      res.status(401).json({ error: 'unauthorized' });
      return null;
    }
    const user = await r.json();
    if (!user?.id) {
      res.status(401).json({ error: 'unauthorized' });
      return null;
    }
    return user;
  } catch (err) {
    // A network blip talking to Supabase must not become an open door.
    res.status(503).json({ error: 'auth check failed', detail: err.message });
    return null;
  }
}

export default requireAuth;
