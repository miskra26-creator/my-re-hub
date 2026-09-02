/**
 * Generic structured-payload webhook (Zapier, Make.com, custom integrations).
 * Tolerant to many field name variations.
 *
 * POST /api/webhook/lead?source=BoldTrail
 * Body: { name, email, phone, message, address, city, budget, ... }
 */
import { pushToInbox } from '../leadInbox.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }
  try {
    const b = req.body || {};
    const source =
      (req.query && req.query.source) ||
      b.source || b.platform || b.lead_source || 'Webhook';

    const lead = {
      source,
      name:
        b.name || b.contact_name || b.full_name ||
        `${b.first_name || ''} ${b.last_name || ''}`.trim() ||
        '',
      email:   b.email || b.contact_email || b.email_address || '',
      phone:   b.phone || b.phone_number || b.contact_phone || b.mobile || '',
      notes:   b.message || b.comments || b.note || b.body || '',
      area:    b.city || b.area || b.location || b.zip || '',
      budget: (b.price || b.budget || b.listing_price || '').toString(),
      address: b.address || b.property_address || b.listing_address || '',
      status:  b.status || 'Hot Prospect',
      type:    b.type || 'Buyer',
    };

    const saved = await pushToInbox(lead, b);
    return res.status(200).json({ ok: true, lead: saved?.[0] || lead });
  } catch (e) {
    console.error('[webhook/lead]', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
