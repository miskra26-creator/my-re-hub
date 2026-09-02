// Tests the birthday cron's date parsing (api/cron/birthdays.js).
//
// This job mails real past clients with nobody watching, so the two ways it can
// embarrass her are: sending on the wrong day, and sending twice. Both come
// down to reading a date correctly.
//
// Run: node scripts/test-birthdays.js
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const m = await import(
    pathToFileURL(path.join(__dirname, '..', 'api', 'cron', 'birthdays.js')).href
  );
  const { monthDayOf } = m;

  let pass = 0, fail = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) console.log(`      got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
    ok ? pass++ : fail++;
  };

  // The exact shape FUB's customBirthday returns — verified against her account.
  check('FUB ISO birthday', monthDayOf('1981-09-27'), '09-27');
  check('FUB ISO, single-digit month', monthDayOf('1965-07-30'), '07-30');
  check('US slash format', monthDayOf('9/27/1981'), '09-27');
  check('US slash, padded', monthDayOf('09/27/1981'), '09-27');
  check('no year', monthDayOf('9/27'), '09-27');
  check('two-digit year', monthDayOf('9/27/81'), '09-27');

  // Year must never leak into the comparison — a birthday repeats annually.
  check('1946 and 1991 same day match', monthDayOf('1946-07-27'), monthDayOf('1991-07-27'));

  // Leap-day birthdays exist. Feb 29 must parse; on non-leap years it simply
  // never equals today, which is the correct no-send rather than a crash.
  check('leap day parses', monthDayOf('1988-02-29'), '02-29');

  check('empty is null', monthDayOf(''), null);
  check('null is null', monthDayOf(null), null);
  check('undefined is null', monthDayOf(undefined), null);
  check('garbage is null', monthDayOf('sometime in June'), null);
  check('partial is null', monthDayOf('1981'), null);

  // Michigan is UTC-4 in September. The cron runs at 12:00 UTC; if "today" were
  // read in UTC at, say, 8pm local, the date would already have rolled over and
  // everyone would get their email a day early. Assert the timezone conversion
  // the handler relies on actually behaves.
  const at = (iso) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
  check('noon UTC is still the same day in Detroit', at('2026-09-13T12:00:00Z'), '2026-09-13');
  check('8pm Detroit has not rolled over', at('2026-09-14T00:30:00Z'), '2026-09-13');
  check('winter offset (EST) also correct', at('2026-01-26T12:00:00Z'), '2026-01-26');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
