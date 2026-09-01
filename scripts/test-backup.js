// Tests idbExportByPrefix() / idbImportBackup() — the FUB history backup.
//
// These two functions are the last line of defence for data that exists in
// exactly one place (this browser's IndexedDB) and that a browser already
// deleted once. A backup that silently truncates is worse than no backup,
// because it looks like it worked. So the tests below check the ROUND TRIP:
// export -> parse -> import -> byte-identical records.
//
// The real functions are extracted from src/cloudHooks.js rather than copied,
// so this can't drift out of sync with what actually ships. IndexedDB is
// replaced with an in-memory shim that mimics the parts we use, including
// cursor semantics.
//
// Run: node scripts/test-backup.js
const fs = require('fs');
const path = require('path');

// ── Fake IndexedDB ───────────────────────────────────────────────────────────
function makeFakeIDB(initial = {}) {
  const data = new Map(Object.entries(initial));
  const later = (fn) => setTimeout(fn, 0);

  const makeStore = () => ({
    openCursor() {
      const req = {};
      const keys = [...data.keys()];
      let i = 0;
      const step = () => {
        if (i >= keys.length) { later(() => req.onsuccess({ target: { result: null } })); return; }
        const key = keys[i++];
        const cursor = { key, value: data.get(key), continue: step };
        later(() => req.onsuccess({ target: { result: cursor } }));
      };
      later(step);
      return req;
    },
    put(value, key) { data.set(key, value); },
    get(key) {
      const req = {};
      later(() => req.onsuccess({ target: { result: data.get(key) } }));
      return req;
    },
  });

  global.indexedDB = {
    open() {
      const req = {};
      later(() => {
        const db = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => {},
          transaction() {
            const tx = { objectStore: makeStore };
            later(() => tx.oncomplete && tx.oncomplete());
            return tx;
          },
        };
        req.onsuccess({ target: { result: db } });
      });
      return req;
    },
  };
  return data;
}

// ── Extract the real functions from cloudHooks.js ────────────────────────────
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'cloudHooks.js'), 'utf8');
const grab = (name, kind) => {
  const re = new RegExp(`(?:export )?${kind} ${name}\\s*\\([\\s\\S]*?\\n\\}`, 'm');
  const m = src.match(re);
  if (!m) throw new Error(`could not extract ${name} from cloudHooks.js`);
  return m[0].replace(/^export /, '');
};
const consts = "const DB_NAME='re-hub-db';const DB_VERSION=1;const STORE='keyval';";
// eslint-disable-next-line no-eval
const { idbExportByPrefix, idbImportBackup } = eval(
  `(() => { ${consts}
     ${grab('openDB', 'function')}
     ${grab('idbExportByPrefix', 'async function')}
     ${grab('idbImportBackup', 'async function')}
     return { idbExportByPrefix, idbImportBackup };
   })()`
);

(async () => {
  let pass = 0, fail = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) console.log(`      got=${JSON.stringify(actual)}\n      want=${JSON.stringify(expected)}`);
    ok ? pass++ : fail++;
  };

  // A realistic slice of what the migration writes.
  const lead = (n) => ({
    fubId: 1000 + n,
    importedAt: '2026-09-01T19:00:00.000Z',
    notes: [{ id: n, body: `Talked with lead ${n} about the Novi listing` }],
    textMessages: [{ id: n, isIncoming: true, message: 'Is it still available?' }],
    calls: [], emails: [], events: [],
  });

  const store = {
    fub_data_1: lead(1),
    fub_data_2: lead(2),
    leads: [{ id: 1, name: 'not fub data' }],   // must NOT be exported
    ai_scores_cache: { junk: true },            // must NOT be exported
  };
  makeFakeIDB(store);

  // 1. Export picks up only the prefixed keys.
  const res = await idbExportByPrefix('fub_data_');
  check('export: counted both leads', res.count, 2);
  check('export: nothing skipped', res.skipped, 0);
  check('export: reports byte size', res.bytes > 0, true);

  // 2. The file is valid JSON with the expected envelope.
  const text = await res.blob.text();
  let parsed = null, parseErr = null;
  try { parsed = JSON.parse(text); } catch (e) { parseErr = e.message; }
  check('export: valid JSON', parseErr, null);
  check('export: format tag', parsed.format, 'my-re-hub-backup');
  check('export: prefix recorded', parsed.prefix, 'fub_data_');
  check('export: exportedAt is a real date', Number.isNaN(Date.parse(parsed.exportedAt)), false);

  // 3. Unrelated keys stayed out — a backup that hoovers up everything would
  //    balloon to gigabytes and is not what the restore path expects.
  check('export: only fub_data_ keys', Object.keys(parsed.records).sort(), ['fub_data_1', 'fub_data_2']);

  // 4. THE POINT: content survives the round trip intact.
  check('export: lead 2 note preserved',
    parsed.records.fub_data_2.notes[0].body,
    'Talked with lead 2 about the Novi listing');
  check('export: inbound text preserved',
    parsed.records.fub_data_1.textMessages[0].message, 'Is it still available?');

  // 5. Restore into an EMPTY database — the wiped-browser scenario.
  const wiped = makeFakeIDB({});
  const restored = await idbImportBackup(text);
  check('restore: wrote every record', restored.written, 2);
  check('restore: reports backup date', restored.exportedAt, parsed.exportedAt);
  check('restore: db now holds both leads', [...wiped.keys()].sort(), ['fub_data_1', 'fub_data_2']);
  check('restore: deep content identical',
    JSON.stringify(wiped.get('fub_data_1')), JSON.stringify(store.fub_data_1));

  // 6. Batching must not drop records at the boundary (BATCH = 200).
  const big = {};
  for (let i = 0; i < 501; i++) big[`fub_data_b${i}`] = { fubId: i, notes: [] };
  makeFakeIDB(big);
  const bigRes = await idbExportByPrefix('fub_data_');
  check('big: exported all 501', bigRes.count, 501);
  const bigWiped = makeFakeIDB({});
  const bigRestore = await idbImportBackup(await bigRes.blob.text());
  check('big: restored all 501 across batches', bigRestore.written, 501);
  check('big: db key count matches', bigWiped.size, 501);

  // 7. Empty database -> still valid JSON, count 0. The UI relies on count===0
  //    to say "nothing to back up" instead of writing a useless file.
  makeFakeIDB({ leads: [] });
  const empty = await idbExportByPrefix('fub_data_');
  check('empty: count 0', empty.count, 0);
  let emptyOk = true;
  try { JSON.parse(await empty.blob.text()); } catch { emptyOk = false; }
  check('empty: still valid JSON', emptyOk, true);

  // 8. Progress callback fires for long exports (she needs to see it moving).
  makeFakeIDB(big);
  const seen = [];
  await idbExportByPrefix('fub_data_', (n) => seen.push(n));
  check('progress: fired every 250', seen, [250, 500]);

  // 9. Bad input is rejected with a message she can act on, not a stack trace.
  const rejects = async (label, input, wantFragment) => {
    let msg = '';
    try { await idbImportBackup(input); } catch (e) { msg = e.message; }
    check(label, msg.includes(wantFragment), true);
  };
  await rejects('reject: not JSON', 'this is not json at all', 'not valid JSON');
  await rejects('reject: truncated file', '{"format":"my-re-hub-backup","records":{"a":', 'not valid JSON');
  await rejects('reject: wrong file type', '{"some":"other json"}', 'not a my-re-hub backup');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
