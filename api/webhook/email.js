/**
 * Universal email-to-lead webhook.
 * Point email-forwarding services (Cloudmailin, SendGrid Inbound Parse,
 * Mailgun, Zapier Email Parser, etc.) at this URL.
 *
 * Expected body shape: { from, subject, text, html } — common across all
 * email parser services. We're tolerant to capitalization variations.
 */
import { parseLeadEmail } from '../_lib/parseLead.js';
import { pushToInbox } from '../_lib/leadInbox.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }
  try {
    const b = req.body || {};
    const lead = parseLeadEmail({
      from:    b.from || b.From || b.sender || '',
      subject: b.subject || b.Subject || '',
      text:    b['stripped-text'] || b.text || b.plain || b.body || b.Body || '',
      html:    b.html || b.Html || '',
    });
    const saved = await pushToInbox(lead, b);
    return res.status(200).json({ ok: true, lead: saved?.[0] || lead });
  } catch (e) {
    console.error('[webhook/email]', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
