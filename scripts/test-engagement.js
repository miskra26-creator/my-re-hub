// Tests summarizeEngagement() against the FUB record shapes actually produced
// by the migration tool (see src/FubMigration.jsx ENDPOINTS).
// Run: node scripts/test-engagement.js
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'aiDatabaseIntel.js')).href);
  const { summarizeEngagement } = mod;

  let pass = 0, fail = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n      got=${JSON.stringify(actual)}`);
    if (!ok) console.log(`      want=${JSON.stringify(expected)}`);
    ok ? pass++ : fail++;
  };

  const iso = (daysBack) => new Date(Date.now() - daysBack * 86400000).toISOString();

  // 1. The money case: a lead who replied, asking about a specific listing.
  const replied = summarizeEngagement({}, {
    textMessages: [
      { created: iso(400), isIncoming: false, message: 'Just checking in!' },
      { created: iso(62),  isIncoming: true,  message: 'Is the Novi house still available? We sold ours.' },
    ],
    emails: [{ created: iso(430), isIncoming: false, subject: 'Listings for you' }],
    calls: [], notes: [],
  });
  check('replied: days since reply', replied.daysSinceTheyReplied, 62);
  check('replied: their words captured',
    replied.theirLastMessage, 'Is the Novi house still available? We sold ours.');
  check('replied: reply count', replied.timesTheyReplied, 1);
  check('replied: outreach count', replied.timesYouReachedOut, 2);
  check('replied: not flagged neverReplied', replied.neverReplied, undefined);
  check('replied: last contact is the reply (62d)', replied.daysSinceAnyContact, 62);

  // 2. Chased hard, never responded — must NOT look busy/valuable.
  const ghost = summarizeEngagement({}, {
    emails: Array.from({ length: 9 }, (_, i) => ({ created: iso(300 - i * 20), isIncoming: false, subject: 'Hi' })),
    textMessages: [], calls: [], notes: [],
  });
  check('ghost: neverReplied flagged', ghost.neverReplied, true);
  check('ghost: no reply count', ghost.timesTheyReplied, undefined);
  check('ghost: outreach counted', ghost.timesYouReachedOut, 9);

  // 3. No imported blob — fall back to FUB summary timestamps.
  const fallback = summarizeEngagement(
    { meta: { fubLastActivity: iso(75), fubLastCommunication: iso(120) } }, null);
  check('fallback: activity days', fallback.daysSinceAnyContact, 75);
  check('fallback: communication days', fallback.daysSinceCommunication, 120);
  check('fallback: no invented reply data', fallback.theirLastMessage, undefined);

  // 4. Nothing at all -> empty object, so the field is omitted from the prompt
  //    rather than present-and-misleading.
  check('empty: returns {}', summarizeEngagement({}, null), {});
  check('empty: no meta, no blob', summarizeEngagement({ meta: {} }, undefined), {});

  // 5. Robustness — malformed/missing timestamps must not produce NaN or throw.
  const messy = summarizeEngagement({}, {
    textMessages: [{ isIncoming: true, message: 'no timestamp at all' }],
    calls: [{ created: 'not-a-date', isIncoming: false }],
    emails: [], notes: [],
  });
  check('messy: no NaN leaked', JSON.stringify(messy).includes('null') || JSON.stringify(messy).includes('NaN'), false);
  check('messy: still counts the reply', messy.timesTheyReplied, 1);

  // 6. Long inbound message is capped (it competes with notes for budget).
  const longMsg = summarizeEngagement({}, {
    textMessages: [{ created: iso(5), isIncoming: true, message: 'x'.repeat(900) }],
    calls: [], emails: [], notes: [],
  });
  check('long msg capped at 300', longMsg.theirLastMessage.length, 300);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
