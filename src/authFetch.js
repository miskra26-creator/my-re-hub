/**
 * authFetch.js — attach the signed-in user's Supabase token to our own /api calls.
 *
 * WHY: as of 2026-09-10 the serverless routes (api/fub, api/claude/messages,
 * api/elevenlabs, api/gemini/image-edit) require a real login, because they
 * spend Monica's credentials — her FUB key, her Gemini quota, her ElevenLabs
 * credits. See api/_lib/requireAuth.js for the server half and the incident it
 * came from.
 *
 * HOW: those endpoints are called from ~40 places across App.js and the feature
 * modules. Editing each call site would be churn and the next new call site
 * would silently forget. Instead we wrap window.fetch once, here, and add the
 * header centrally. Import this for its side effect before the app renders.
 *
 * SAFETY RULES baked in below — all three matter:
 *   1. SAME-ORIGIN ONLY. Never attach the token to a cross-origin request, or
 *      we'd hand the user's session to Pixabay/FUB/Google/whoever.
 *   2. /api/ PATHS ONLY. Static assets don't need it, and supabase-js has its
 *      own auth (it also calls fetch, and is cross-origin anyway).
 *   3. NEVER OVERWRITE an Authorization header the caller already set —
 *      src/twilioSms.js sets its own.
 *
 * Signed out, or Supabase not configured? We simply send no header, and the
 * endpoint answers 401. That is the intended behavior, not a bug.
 */

import { supabase, isCloudEnabled } from './supabase';

// Cached so we don't await a session lookup on every single request.
// Kept fresh by onAuthStateChange, which also fires on token refresh.
let cachedToken = null;

// Reading the session from storage is async. Without this, requests fired
// during the first moments after load would race it, go out with no header and
// come back 401 — the app appearing broken to a user who IS signed in. The
// wrapper awaits this once; afterwards the cached token answers immediately.
let sessionReady = Promise.resolve();

if (isCloudEnabled) {
  sessionReady = supabase.auth
    .getSession()
    .then(({ data }) => { cachedToken = data?.session?.access_token || null; })
    .catch(() => {});

  supabase.auth.onAuthStateChange((_event, session) => {
    cachedToken = session?.access_token || null;
  });
}

/** Resolve the request URL to a pathname, or null if it isn't same-origin. */
function sameOriginApiPath(input) {
  try {
    const raw =
      typeof input === 'string' ? input
      : input instanceof URL ? input.href
      : input && typeof input.url === 'string' ? input.url
      : null;
    if (raw == null) return null;

    // Relative URLs resolve against our own origin, which is what we want.
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return null;      // rule 1
    if (!u.pathname.startsWith('/api/')) return null;           // rule 2
    return u.pathname;
  } catch {
    return null;
  }
}

function hasAuthHeader(init, input) {
  const fromInit = init?.headers;
  if (fromInit) {
    const h = fromInit instanceof Headers ? fromInit : new Headers(fromInit);
    if (h.has('authorization')) return true;
  }
  // A Request object can carry headers too.
  if (input && typeof input === 'object' && input.headers instanceof Headers) {
    if (input.headers.has('authorization')) return true;
  }
  return false;
}

export function installAuthFetch() {
  if (typeof window === 'undefined' || !window.fetch) return;
  if (window.__authFetchInstalled) return;   // hot reload / double import
  window.__authFetchInstalled = true;

  const original = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const path = sameOriginApiPath(input);
    if (!path) return original(input, init);
    if (hasAuthHeader(init, input)) return original(input, init);   // rule 3

    // Only pay the wait once, and only for our own /api calls.
    if (!cachedToken) await sessionReady;
    if (!cachedToken) return original(input, init);   // genuinely signed out

    // Merge rather than replace, so callers keep Content-Type, x-fub-key, etc.
    const headers = new Headers(
      (init && init.headers) ||
      (input && typeof input === 'object' && input.headers) ||
      undefined
    );
    headers.set('Authorization', `Bearer ${cachedToken}`);

    // When called as fetch(Request), options must still be passed separately;
    // spreading the Request itself would drop its body.
    if (typeof input === 'string' || input instanceof URL) {
      return original(input, { ...(init || {}), headers });
    }
    return original(new Request(input, { headers }), init);
  };
}

installAuthFetch();
