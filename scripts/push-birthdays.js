/**
 * Load the birthdays rescued from Follow Up Boss into the platform.
 *
 * scripts/fub-pull-custom.js saves Downloads/fub-people-custom.json. This turns
 * that into the `birthdays` record the daily cron reads, and writes it to
 * Supabase with the service-role key.
 *
 * Dedupes by email: the FUB data contains genuine duplicate people (e.g. "Pete
 * Butler" and "Pete Butler - SELLER" share an address), which is why he has
 * been getting two birthday emails a year since 2022.
 *
 * Dry run (prints, writes nothing):  node scripts/push-birthdays.js
 * Commit:                            node scripts/push-birthdays.js --write
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const fs = require('fs');
const path = require('path');

const WRITE = process.argv.includes('--write');
const SRC = path.join(process.env.USERPROFILE || '', 'Downloads', 'fub-people-custom.json');

const monthDayOf = (raw) => {
  const s = String(raw || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(s);
  if (m) return `${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  return null;
};

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error(`Missing ${SRC}\nRun: node scripts/fub-pull-custom.js`);
    process.exit(1);
  }
  const people = JSON.parse(fs.readFileSync(SRC, 'utf8'));

  const byEmail = new Map();
  let noEmail = 0, unparsable = 0;
  for (const p of people) {
    if (!p.customBirthday) continue;
    if (!monthDayOf(p.customBirthday)) { unparsable++; continue; }
    const email = (p.emails || []).map((e) => e.value).find(Boolean);
    if (!email) { noEmail++; continue; }
    const key = email.toLowerCase();
    // Keep the record with the cleaner name — FUB duplicates often differ only
    // by a suffix like " - SELLER".
    const prev = byEmail.get(key);
    if (prev && prev.name.length <= String(p.name || '').length) continue;
    byEmail.set(key, {
      fubId: p.id,
      name: p.name || '',
      firstName: p.firstName || '',
      email,
      birthday: p.customBirthday,
    });
  }

  const rows = [...byEmail.values()].sort((a, b) => (
    monthDayOf(a.birthday) < monthDayOf(b.birthday) ? -1 : 1
  ));

  console.log(`people scanned:        ${people.length}`);
  console.log(`birthdays usable:      ${rows.length}`);
  console.log(`skipped (no email):    ${noEmail}`);
  console.log(`skipped (bad date):    ${unparsable}`);
  console.log(`duplicates collapsed:  ${people.filter((p) => p.customBirthday).length - rows.length - noEmail - unparsable}`);
  console.log('\nnext five:');
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit', month: '2-digit', day: '2-digit',
  }).format(new Date()).replace('-', '-');
  const ord = rows.filter((r) => monthDayOf(r.birthday) >= today)
    .concat(rows.filter((r) => monthDayOf(r.birthday) < today));
  ord.slice(0, 5).forEach((r) => console.log(`  ${monthDayOf(r.birthday)}  ${r.name}  <${r.email}>`));

  if (!WRITE) {
    console.log('\nDry run. Nothing written. Re-run with --write to commit.');
    return;
  }

  const URL_BASE = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_BASE || !KEY) {
    console.error('\nNeed REACT_APP_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

  const ures = await fetch(`${URL_BASE}/auth/v1/admin/users?per_page=2`, { headers: H });
  const users = (await ures.json()).users || [];
  if (users.length !== 1) {
    console.error(`expected exactly 1 Supabase user, found ${users.length}`);
    process.exit(1);
  }
  const uid = users[0].id;

  const res = await fetch(`${URL_BASE}/rest/v1/user_data?on_conflict=user_id,key`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{
      user_id: uid, key: 'birthdays', value: rows, updated_at: new Date().toISOString(),
    }]),
  });
  if (!res.ok) { console.error(`write failed: HTTP ${res.status}`, await res.text()); process.exit(1); }
  console.log(`\nwrote ${rows.length} birthdays for user ${uid}`);
})();
