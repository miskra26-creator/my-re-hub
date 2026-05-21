/**
 * Realcomp Matrix CSV → Listings inbox webhook.
 *
 * Wired to a Cloudmailin (or SendGrid Inbound Parse) endpoint. Matrix sends a
 * scheduled-email export of a saved search ("My Listings"). Cloudmailin parses
 * the email and POSTs to this URL with the CSV either as a body attachment
 * or pasted inline.
 *
 * The webhook then:
 *   1. Extracts CSV text from body.attachments[0].content (base64) or body.plain
 *   2. Parses it via shared parseRealcompCSV()
 *   3. Upserts rows to public.listings, scoped to the static MLS_USER_ID env var
 *      (Monica is the sole user; for multi-user, route by inbox-token in path)
 *
 * Required Vercel env vars:
 *   - MLS_USER_ID         — Monica's Supabase user_id (the listings target)
 *   - SUPABASE_URL        — same as REACT_APP_SUPABASE_URL
 *   - SUPABASE_ANON_KEY   — same as REACT_APP_SUPABASE_ANON_KEY
 */
import { parseRealcompCSV, toDbRow } from '../_lib/parseRealcompCSV.js';

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.REACT_APP_SUPABASE_URL ||
  '';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  '';
const MLS_USER_ID = process.env.MLS_USER_ID || '';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ ok: false, error: 'Supabase env vars not set' });
  }
  // user_id can come from env (default), query, or body for flexibility
  const userId =
    (req.query && req.query.user) ||
    (req.body && req.body.user_id) ||
    MLS_USER_ID;
  if (!userId) {
    return res.status(500).json({ ok: false, error: 'No MLS_USER_ID configured' });
  }

  try {
    const b = req.body || {};

    // 1. Extract CSV text — try common places Cloudmailin / SendGrid put it
    let csvText = null;

    // Cloudmailin "json_normalized" format
    if (Array.isArray(b.attachments) && b.attachments.length) {
      // Prefer the .csv attachment
      const csvAtt = b.attachments.find((a) =>
        (a.file_name || a.filename || '').toLowerCase().endsWith('.csv')
      ) || b.attachments[0];
      if (csvAtt) {
        if (csvAtt.content) {
          // base64-encoded
          csvText = Buffer.from(csvAtt.content, 'base64').toString('utf8');
        } else if (csvAtt.url) {
          // Cloudmailin can also pass a URL pointing to the attachment
          const r = await fetch(csvAtt.url);
          csvText = await r.text();
        }
      }
    }

    // Fall back to plain body (Matrix sometimes puts CSV inline)
    if (!csvText && b.plain && b.plain.includes(',')) csvText = b.plain;
    if (!csvText && b['stripped-text'] && b['stripped-text'].includes(',')) {
      csvText = b['stripped-text'];
    }

    if (!csvText) {
      return res.status(400).json({
        ok: false,
        error: 'No CSV found in email. Expected a .csv attachment or CSV in the plain body.',
      });
    }

    // 2. Parse
    const parsed = parseRealcompCSV(csvText);
    if (!parsed.length) {
      return res.status(400).json({
        ok: false,
        error: 'CSV parsed to 0 rows — header detection failed or empty file.',
      });
    }

    // 3. Upsert to Supabase
    const rows = parsed.map((p) => toDbRow(p, userId));
    const CHUNK = 200;
    let ok = 0, fail = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/listings?on_conflict=user_id,mls_num`,
        {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify(chunk),
        }
      );
      if (!r.ok) {
        const txt = await r.text();
        console.warn(`[realcomp-csv chunk ${i}]`, r.status, txt.slice(0, 300));
        fail += chunk.length;
      } else {
        ok += chunk.length;
      }
    }

    return res.status(200).json({
      ok: true,
      received: parsed.length,
      upserted: ok,
      failed: fail,
    });
  } catch (e) {
    console.error('[webhook/realcomp-csv]', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
