/**
 * Daily birthday email — the first thing this platform does without Monica.
 *
 * REPLACES: Follow Up Boss action plan 38, "Birthday Email on Day of Birthday",
 * running since October 2020. It has quietly sent one email a year to 54 people
 * (template 153, "Happy Birthday, %contact_first_name%!") and would have died
 * silently the day the FUB account was cancelled. Those birthdays were not in
 * the 289MB history backup — they live in a FUB custom field — so they were
 * rescued separately by scripts/fub-pull-custom.js.
 *
 * SAFETY, because this sends real mail to real past clients with no human in
 * the loop:
 *   - Every send is recorded, and a person can only be mailed once per calendar
 *     year. Vercel's free cron fires within a ±59 minute window and can retry,
 *     so "did I already send this?" is answered from stored state, never from
 *     the clock.
 *   - "Today" is computed in Michigan time, not UTC. A job running at 12:00 UTC
 *     is 8am in Detroit, but on the UTC calendar it can already be tomorrow —
 *     which would mail people a day early, every time.
 *   - ?dryRun=1 returns exactly who WOULD be mailed and sends nothing.
 *   - Anything over the daily cap is deferred rather than blasted.
 */
import { sendMail, authorizeCron, mailerConfigured, DAILY_SEND_CAP } from '../_lib/mailer.js';
import { getKey, setKey, serverDataConfigured } from '../_lib/serverData.js';

const TZ = 'America/Detroit';

/** Today's {year, mm, dd} in Monica's timezone. */
function todayLocal() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return { year: get('year'), mm: get('month'), dd: get('day') };
}

/** Accepts "1981-09-27", "9/27/1981", or "09-27". Returns "MM-DD" or null. */
export function monthDayOf(raw) {
  const s = String(raw || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(s);
  if (m) return `${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  return null;
}

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

/**
 * Deliberately close to what FUB sent for six years — subject, one warm line,
 * her sign-off. Changing the wording is a decision for Monica, not for me.
 */
function buildEmail(person, agentName) {
  const first = String(person.firstName || person.name || '').trim().split(/\s+/)[0] || 'there';
  return {
    subject: `Happy Birthday, ${first}!`,
    text: `Happy birthday, ${first}!\n\nI hope you have a great day.\n\n-${agentName}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222">
<p>Happy birthday, ${esc(first)}!</p>
<p>I hope you have a great day.</p>
<p>-${esc(agentName)}</p>
</div>`,
  };
}

export default async function handler(req, res) {
  const dryRun = String(req.query?.dryRun || '') === '1';

  // A dry run is read-only, so it stays reachable for a signed-in human to
  // click. An actual send must prove it came from the scheduler.
  if (!dryRun) {
    const auth = authorizeCron(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  }

  if (!serverDataConfigured()) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });
  }
  if (!dryRun && !mailerConfigured()) {
    return res.status(500).json({ error: 'RESEND_API_KEY / MAIL_FROM not configured' });
  }

  // ARMING SWITCH. Having the keys in place must not be the same decision as
  // "start emailing my past clients". Without BIRTHDAY_AUTOSEND=on this
  // endpoint degrades to a preview no matter who calls it or how, so the
  // schedule can be tested end-to-end — real data, real recipients listed,
  // real timing — with zero chance of a message reaching anyone.
  const armed = String(process.env.BIRTHDAY_AUTOSEND || '').toLowerCase() === 'on';
  const previewOnly = dryRun || !armed;

  const { year, mm, dd } = todayLocal();
  const today = `${mm}-${dd}`;

  try {
    const people = (await getKey('birthdays', [])) || [];
    const log = (await getKey('birthday_log', {})) || {};
    const agentName = (await getKey('agent_name', 'Monica Iskra')) || 'Monica Iskra';

    const due = people.filter((p) => {
      if (!p || !p.email) return false;
      if (monthDayOf(p.birthday) !== today) return false;
      // One per person per year. Keyed on email because the FUB export contains
      // genuine duplicates — "Pete Butler" and "Pete Butler - SELLER" share an
      // address and were getting two birthday emails every year.
      return !log[`${year}:${String(p.email).toLowerCase()}`];
    });

    // Collapse duplicate addresses within a single run for the same reason.
    const seen = new Set();
    const unique = due.filter((p) => {
      const k = String(p.email).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const batch = unique.slice(0, DAILY_SEND_CAP);
    const deferred = unique.length - batch.length;

    if (previewOnly) {
      return res.status(200).json({
        sent: false,
        reason: dryRun ? 'dryRun=1' : 'BIRTHDAY_AUTOSEND is not "on" — preview only',
        date: `${year}-${today}`, timezone: TZ,
        wouldSend: batch.map((p) => ({ name: p.name, email: p.email })),
        deferred, totalOnFile: people.length,
      });
    }

    const sent = [];
    const failed = [];
    for (const p of batch) {
      const { subject, html, text } = buildEmail(p, agentName);
      const r = await sendMail({
        to: p.email, subject, html, text,
        replyTo: process.env.MAIL_REPLY_TO, tag: 'birthday',
      });
      if (r.ok) {
        // Record immediately, per person. If the function times out halfway
        // through, the people already mailed stay mailed — a crash must never
        // turn into a second email tomorrow.
        log[`${year}:${String(p.email).toLowerCase()}`] = new Date().toISOString();
        await setKey('birthday_log', log);
        sent.push({ name: p.name, email: p.email, id: r.id });
      } else {
        failed.push({ name: p.name, email: p.email, error: r.error });
      }
    }

    return res.status(200).json({
      date: `${year}-${today}`, timezone: TZ,
      sentCount: sent.length, failedCount: failed.length, deferred,
      sent, failed,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
