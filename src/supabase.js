// Supabase is not configured for local use — all data stored in IndexedDB/localStorage
// Mock client so the app runs without cloud credentials

export const supabase = {
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: () => Promise.resolve({ data: {}, error: { message: 'Local mode — no login needed' } }),
    signUp: () => Promise.resolve({ data: {}, error: null }),
    signOut: () => Promise.resolve({}),
  },
  from: () => ({
    select: () => ({ data: [], error: null }),
    insert: () => ({ data: [], error: null }),
    update: () => ({ data: [], error: null }),
    delete: () => ({ data: [], error: null }),
  }),
};
