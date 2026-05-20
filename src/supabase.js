// Real Supabase client when env vars are present, mock when not.
// This lets the app run in pure-local mode if Supabase isn't configured.

import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL;
const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// True when Supabase is fully configured. cloudHooks reads this to decide
// whether to attempt cloud sync or stay purely local.
export const isCloudEnabled = Boolean(
  url && anonKey &&
  !url.includes('YOUR-PROJECT-ID') &&
  !anonKey.includes('YOUR-ANON-KEY')
);

let client;
if (isCloudEnabled) {
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });
  if (typeof window !== 'undefined') {
    // Helpful in DevTools — `window.supabase` lets you poke around live
    window.supabase = client;
  }
  console.log('[supabase] Cloud sync ENABLED →', url);
} else {
  console.log('[supabase] Cloud sync DISABLED — running in local-only mode');
  // Mock so the rest of the app doesn't crash on supabase.auth.* calls
  client = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: () => Promise.resolve({ data: {}, error: { message: 'Cloud sync not configured' } }),
      signUp: () => Promise.resolve({ data: {}, error: { message: 'Cloud sync not configured' } }),
      signOut: () => Promise.resolve({}),
    },
    from: () => ({
      select: () => ({ data: [], error: null, eq: () => ({ data: [], error: null, maybeSingle: () => ({ data: null, error: null }) }) }),
      insert: () => ({ data: [], error: null }),
      update: () => ({ data: [], error: null }),
      delete: () => ({ data: [], error: null }),
      upsert: () => ({ data: [], error: null }),
    }),
    channel: () => ({
      on: function() { return this; },
      subscribe: function() { return this; },
    }),
    removeChannel: () => {},
  };
}

export const supabase = client;
