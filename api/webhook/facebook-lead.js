/**
 * Facebook Lead Ads webhook.
 * GET handles verification challenge. POST receives lead.
 */
import { pushToInbox } from '../_lib/leadInbox.js';

const VERIFY_TOKEN = 're_hub_fb_verify';

export default async function handler(req, res) {
  // FB verification challenge
  if (req.method === 'GET') {
    if (
      req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === VERIFY_TOKEN
    ) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.status(403).send('Verification failed');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }

  try {
    const b = req.body || {};
    const entry = b?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    if (!change?.leadgen_id) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const fields = {};
    (change.field_data || []).forEach((f) => {
      fields[f.name] = f.values?.[0] || '';
    });

    const lead = {
      source: 'Facebook Lead Ads',
      name:
        fields.full_name ||
        `${fields.first_name || ''} ${fields.last_name || ''}`.trim() ||
        'Facebook Lead',
      email:   fields.email || '',
      phone:   fields.phone_number || fields.phone || '',
      notes:   `FB Lead Form: ${change.form_id || ''}`,
      area:    fields.city || fields.zip_code || '',
      budget:  fields.price_range || '',
      status:  'Hot Prospect',
      type:    'Buyer',
    };
    const saved = await pushToInbox(lead, b);
    return res.status(200).json({ ok: true, lead: saved?.[0] || lead });
  } catch (e) {
    console.error('[webhook/facebook-lead]', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
