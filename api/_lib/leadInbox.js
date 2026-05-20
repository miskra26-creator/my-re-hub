/**
 * Server-side helper for writing leads to the Supabase lead_inbox table.
 *
 * We use the anon key — the RLS policy on lead_inbox explicitly allows
 * anon INSERTs (any webhook can deliver), but only authenticated users
 * (Monica) can SELECT/DELETE. So leaking the URL doesn't let an attacker
 * read or modify the inbox; the worst they can do is spam fake leads,
 * which is easy to clean up.
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.REACT_APP_SUPABASE_URL ||
  '';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  '';

export async function pushToInbox(lead, rawPayload = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase env vars not set on this deployment');
  }
  const row = {
    source:  lead.source || 'Web',
    name:    (lead.name || '').slice(0, 80),
    email:   (lead.email || '').slice(0, 100),
    phone:   (lead.phone || '').slice(0, 30),
    notes:   (lead.notes || '').slice(0, 800),
    area:    (lead.area || '').slice(0, 60),
    budget:  (lead.budget || '').toString().slice(0, 30),
    address: (lead.address || '').slice(0, 150),
    status:  lead.status || 'Hot Prospect',
    type:    lead.type || 'Buyer',
    raw:     rawPayload,
  };
  // Note: we do NOT use `Prefer: return=representation` because that triggers
  // a follow-up SELECT, which is blocked by the auth-only SELECT policy for
  // the anon role. The webhook doesn't need the returned row anyway.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/lead_inbox`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase insert failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  return row;
}
