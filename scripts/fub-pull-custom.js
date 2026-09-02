// One-off rescue: pull the fields the FUB *history* export could not give us.
//
// The 2026-09-02 backup has every note and event, but FUB's API redacts message
// bodies, and the migration never captured FUB's custom person fields at all.
// Birthdays live in `customBirthday`, and there is a birthday email (action plan
// 38, template 153) that has been firing once a year since 2022. Cancelling the
// FUB account deletes that data permanently, so grab it while the key still works.
//
// Writes: Downloads/fub-people-custom.json
// Run: node scripts/fub-pull-custom.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const fs = require('fs');
const path = require('path');

const KEY = process.env.FUB_API_KEY || process.env.REACT_APP_FUB_API_KEY;
if (!KEY) { console.error('No FUB_API_KEY in .env.local'); process.exit(1); }

const H = {
  Authorization: 'Basic ' + Buffer.from(KEY + ':').toString('base64'),
  'Content-Type': 'application/json',
  // Unregistered systems get a lower rate limit and a nag in every response.
  'X-System': 'my-re-hub',
};

const FIELDS = [
  'id', 'name', 'firstName', 'lastName', 'emails', 'phones', 'stage', 'tags',
  'source', 'created', 'lastActivity',
  'customBirthday', 'customCloseDate', 'customSpouseName', 'customKidsName',
  'customPetName', 'customLeadSegment', 'customAvePricePoint', 'customTimeframe',
  'dealCloseDate', 'dealStatus', 'dealStage', 'dealPrice', 'addresses',
].join(',');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let url = `https://api.followupboss.com/v1/people?limit=100&fields=${FIELDS}`;
  const all = [];
  let pages = 0;

  while (url) {
    const res = await fetch(url, { headers: H });
    // FUB throttles hard on unregistered systems; back off rather than lose the run.
    if (res.status === 429) { await sleep(4000); continue; }
    if (!res.ok) { console.error(`HTTP ${res.status}`, (await res.text()).slice(0, 200)); break; }
    const json = await res.json();
    all.push(...(json.people || []));
    pages++;
    url = json._metadata && json._metadata.nextLink;
    if (pages % 10 === 0) console.log(`  ${all.length} people…`);
    await sleep(220);
  }

  const out = path.join(process.env.USERPROFILE || '', 'Downloads', 'fub-people-custom.json');
  fs.writeFileSync(out, JSON.stringify(all, null, 1));

  const has = (f) => all.filter((p) => p[f]).length;
  console.log(`\npulled ${all.length} people -> ${out}`);
  console.log(`  birthdays:  ${has('customBirthday')}`);
  console.log(`  spouse:     ${has('customSpouseName')}`);
  console.log(`  kids:       ${has('customKidsName')}`);
  console.log(`  pet:        ${has('customPetName')}`);
  console.log(`  closeDate:  ${all.filter((p) => p.customCloseDate || p.dealCloseDate).length}`);
})();
