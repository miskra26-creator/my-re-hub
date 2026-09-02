/**
 * Zillow Premier Agent webhook.
 * Payload shape per Zillow's documented format.
 */
import { pushToInbox } from '../leadInbox.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }
  try {
    const b = req.body || {};
    const c = b.buyerAgent?.contact || b.contact || {};
    const prop = b.listingDetails || {};
    const lead = {
      source: 'Zillow',
      name:    c.name || c.displayName || 'Zillow Lead',
      email:   c.email || '',
      phone:   c.phone || '',
      notes:   b.buyerAgent?.message || b.message || '',
      address: prop.address || prop.streetAddress || '',
      area:    prop.city || '',
      budget:  (prop.price || '').toString(),
      status:  'Hot Prospect',
      type:    'Buyer',
    };
    const saved = await pushToInbox(lead, b);
    return res.status(200).json({ ok: true, lead: saved?.[0] || lead });
  } catch (e) {
    console.error('[webhook/zillow]', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
