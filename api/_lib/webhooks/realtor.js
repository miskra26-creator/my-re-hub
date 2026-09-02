/**
 * Realtor.com webhook.
 */
import { pushToInbox } from '../leadInbox.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }
  try {
    const b = req.body || {};
    const c = b.contact || b.lead || b;
    const lead = {
      source: 'Realtor.com',
      name:
        c.name || c.full_name ||
        `${c.first_name || ''} ${c.last_name || ''}`.trim() ||
        'Realtor.com Lead',
      email:   c.email || '',
      phone:   c.phone || c.phone_number || '',
      notes:   c.message || b.message || '',
      address: b.property?.address || b.listing_address || '',
      area:    b.property?.city || c.city || '',
      budget:  (b.property?.list_price || '').toString(),
      status:  'Hot Prospect',
      type:    'Buyer',
    };
    const saved = await pushToInbox(lead, b);
    return res.status(200).json({ ok: true, lead: saved?.[0] || lead });
  } catch (e) {
    console.error('[webhook/realtor]', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
