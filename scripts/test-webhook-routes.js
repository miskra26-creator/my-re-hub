// Guards the webhook consolidation (api/webhook/[source].js).
//
// Seven separate webhook files were merged into one dynamic route to get under
// Vercel's 12-function limit. These are LIVE lead intake URLs configured inside
// third-party dashboards (Zillow, Realtor.com, BoldTrail, Cloudmailin) that we
// cannot see and she would not know had broken — a lead would simply never
// arrive. So: every old path must still resolve, and an unknown one must fail
// loudly rather than silently swallow a lead.
//
// Run: node scripts/test-webhook-routes.js
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const mod = await import(
    pathToFileURL(path.join(__dirname, '..', 'api', 'webhook', '[source].js')).href
  );
  const handler = mod.default;

  let pass = 0, fail = 0;
  const check = (label, ok) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    ok ? pass++ : fail++;
  };

  // Minimal res double: records what the handler did.
  const call = async (source, method = 'POST') => {
    const out = { code: null, body: null };
    const res = {
      status(c) { out.code = c; return this; },
      json(b) { out.body = b; return this; },
      send(b) { out.body = b; return this; },
      end() { return this; },
      setHeader() { return this; },
    };
    await handler({ method, query: { source }, headers: {}, body: {} }, res);
    return out;
  };

  // The seven original paths, exactly as they were before the merge.
  for (const s of ['boldtrail', 'email', 'facebook-lead', 'lead', 'realcomp-csv', 'realtor', 'zillow']) {
    const r = await call(s);
    // Anything except "unknown source" means it reached the real handler.
    const routed = !(r.code === 404 && r.body && /Unknown webhook source/.test(r.body.error || ''));
    check(`/api/webhook/${s} still routes`, routed);
  }

  // Case shouldn't matter — some dashboards uppercase path segments.
  check('uppercase source routes', !(await call('ZILLOW')).body?.error?.includes?.('Unknown'));

  // Aliases for the rename kvCORE -> BoldTrail.
  for (const s of ['kvcore', 'fb', 'realcomp']) {
    const r = await call(s);
    check(`alias "${s}" routes`, !(r.body?.error || '').includes('Unknown'));
  }

  // An unknown source must 404 with the list, not pretend success.
  const bad = await call('not-a-real-source');
  check('unknown source returns 404', bad.code === 404);
  check('unknown source lists valid ones', Array.isArray(bad.body?.known) && bad.body.known.length >= 7);

  // Missing segment must not throw.
  let threw = false;
  try { await call(undefined); } catch { threw = true; }
  check('missing source does not throw', !threw);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
