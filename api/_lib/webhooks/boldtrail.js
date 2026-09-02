/**
 * BoldTrail (formerly kvCORE / Inside Real Estate) webhook.
 *
 * BoldTrail's lead payloads vary by integration tier, so we accept both
 * structured JSON and forwarded-email shapes. If the body looks like an
 * email (has subject/from/text), we route through the email parser.
 * Otherwise we extract from the structured JSON shape.
 */
import { parseLeadEmail } from '../parseLead.js';
import { pushToInbox } from '../leadInbox.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }
  try {
    const b = req.body || {};

    let lead;
    if (b.subject || b.from || b.text || b.html) {
      // Forwarded-email format
      lead = parseLeadEmail({
        from:    b.from || b.From || '',
        subject: b.subject || b.Subject || '',
        text:    b.text || b['stripped-text'] || b.body || '',
        html:    b.html || '',
      });
      lead.source = 'BoldTrail';
    } else {
      // Structured BoldTrail / kvCORE JSON
      const c = b.contact || b.lead || b;
      lead = {
        source: 'BoldTrail',
        name:
          c.name || c.full_name ||
          `${c.first_name || c.firstName || ''} ${c.last_name || c.lastName || ''}`.trim() ||
          'BoldTrail Lead',
        email:   c.email || c.email_address || '',
        phone:   c.phone || c.phone_number || c.cell_phone || '',
        notes:   c.message || c.comments || b.message || b.note || '',
        address: c.property_address || b.address || '',
        area:    c.city || b.city || '',
        budget:  (c.price_range || c.budget || b.price || '').toString(),
        status:  'Hot Prospect',
        type:    c.lead_type || b.type || 'Buyer',
      };
    }

    const saved = await pushToInbox(lead, b);
    return res.status(200).json({ ok: true, lead: saved?.[0] || lead });
  } catch (e) {
    console.error('[webhook/boldtrail]', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
