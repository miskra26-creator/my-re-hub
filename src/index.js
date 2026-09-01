import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Unregister any old service workers to prevent caching issues
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister());
  });
}

// ─── ASK THE BROWSER NOT TO DELETE OUR DATA ──────────────────────────────────
// This was missing, and it cost us the entire FUB history.
//
// The FUB Mass Import writes every note/call/text/email to IndexedDB via
// idbSet(), which is LOCAL ONLY — it never syncs to Supabase. Leads survive a
// wipe because they live in the cloud `leads` table; the FUB history does not.
//
// By default IndexedDB is "best-effort" storage: browsers are free to evict it
// whenever they want disk space back, with no warning and no user action. The
// May 2026 import completed 100%, was verified, and was silently gone by
// September. Marking storage as persistent tells the browser this data is not
// a disposable cache.
//
// Fires on every load (cheap, idempotent) so a future wipe of site permissions
// doesn't quietly leave us unprotected again. Logs the outcome so the FUB
// Migration screen's numbers can be trusted rather than taken on faith.
if (navigator.storage?.persist) {
  navigator.storage.persisted()
    .then((already) => (already ? true : navigator.storage.persist()))
    .then((granted) => {
      console.log(
        granted
          ? '[storage] Persistent storage GRANTED — imported FUB history is safe from browser eviction.'
          : '[storage] Persistent storage DENIED — the browser may delete imported FUB data. Back it up.'
      );
    })
    .catch(() => {});
}
