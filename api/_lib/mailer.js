/**
 * mailer.js — the one place the platform sends email from a SERVER.
 *
 * WHY THIS EXISTS
 * Until now every automated email went out through the Gmail API from inside
 * Monica's browser tab (App.js `autoSendDrips`). That works only while the app
 * is open, which is why Follow Up Boss could not be cancelled: FUB sends from
 * its own machines at 8am whether she's awake or not.
 *
 * Gmail can't replace that for free. `gmail.send` is a Google "restricted"
 * scope: an unverified app gets refresh tokens that die after 7 days, so the
 * automation would break every week, and getting permanent credentials means
 * paying for a third-party security audit. So server-side sending goes through
 * a transactional provider instead, keyed by an API key that never expires.
 *
 * Everything automated should funnel through here — birthdays today, drips and
 * agent-driven follow-up later — so there is exactly one thing to watch, one
 * place that enforces the daily cap, and one log.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Resend's free tier is 3,000/month and 100/day. Monica's real volume is ~54
// birthdays a year plus drips, nowhere near either number — but an accidental
// loop that mails 6,000 leads would burn the allowance AND her domain
// reputation in one morning. The cap is the seatbelt for that, not a quota.
export const DAILY_SEND_CAP = 80;

export function mailerConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

/**
 * Send one email. Returns { ok, id, error }.
 *
 * `replyTo` defaults to her Gmail so a client hitting Reply lands in the inbox
 * she actually reads, even though the message is sent from the domain.
 */
export async function sendMail({ to, subject, html, text, replyTo, tag }) {
  if (!mailerConfigured()) {
    return { ok: false, error: 'RESEND_API_KEY / MAIL_FROM not configured' };
  }
  if (!to || !subject) return { ok: false, error: 'missing to/subject' };

  const body = {
    from: process.env.MAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    reply_to: replyTo || process.env.MAIL_REPLY_TO || undefined,
  };
  if (html) body.html = html;
  if (text) body.text = text;
  // Tags make it possible to answer "what did the birthday job send?" later
  // without correlating by subject line.
  if (tag) body.tags = [{ name: 'source', value: String(tag).slice(0, 40) }];

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: json.message || `HTTP ${res.status}` };
    }
    return { ok: true, id: json.id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Guard for every cron entry point.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on scheduled invocations.
 * Without this check the endpoint is a public URL that anyone could hit to make
 * the platform send mail as Monica — so if CRON_SECRET is unset we refuse
 * rather than fall open.
 */
export function authorizeCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 500, error: 'CRON_SECRET not set' };
  const got = req.headers?.authorization || req.headers?.Authorization || '';
  if (got !== `Bearer ${secret}`) return { ok: false, status: 401, error: 'unauthorized' };
  return { ok: true };
}
