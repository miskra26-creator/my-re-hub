/**
 * Shared lead-parsing helpers used by all webhook serverless functions.
 * Logic ported from server.js so dev (local) + prod (Vercel) behave identically.
 */

export const extractPhone = (t) =>
  (t || '').match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0] || '';

export const extractEmail = (t) =>
  (t || '').match(/[\w.+%-]+@[\w-]+\.[a-z]{2,}/i)?.[0] || '';

export const extractName = (t) => {
  const m = (t || '').match(/(?:name|contact|from)[:\s]+([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)/i);
  return m?.[1] || '';
};

/** Sniff the lead source from subject + From header. Expanded with BoldTrail/kvCORE. */
export const detectSource = (subject = '', from = '') => {
  const s = (subject + ' ' + from).toLowerCase();
  if (s.includes('boldtrail') || s.includes('kvcore') || s.includes('insiderealestate')) return 'BoldTrail';
  if (s.includes('homes.com'))     return 'Homes.com';
  if (s.includes('zillow'))        return 'Zillow';
  if (s.includes('realtor.com'))   return 'Realtor.com';
  if (s.includes('trulia'))        return 'Trulia';
  if (s.includes('redfin'))        return 'Redfin';
  if (s.includes('movoto'))        return 'Movoto';
  if (s.includes('opcity'))        return 'OpCity';
  if (s.includes('boldleads'))     return 'BoldLeads';
  if (s.includes('ylopo'))         return 'Ylopo';
  if (s.includes('sierra'))        return 'Sierra Interactive';
  if (s.includes('chime'))         return 'Chime';
  if (s.includes('idx broker'))    return 'IDX Broker';
  if (s.includes('facebook') || s.includes('meta')) return 'Facebook';
  if (s.includes('instagram'))     return 'Instagram';
  return 'Web';
};

/**
 * Parse a forwarded lead email. Handles the common shapes from
 * Zillow, Realtor.com, BoldTrail, Homes.com, etc. Falls back to
 * generic extraction when format isn't recognized.
 */
export function parseLeadEmail({ from, subject, text, html }) {
  const body = text || html || '';
  const source = detectSource(subject, from);

  let name = extractName(body) || extractName(subject || '');
  let email = extractEmail(body);
  if (email && (email.includes('noreply') || email.includes('notification') || email.includes('mailer-daemon'))) {
    email = '';
  }
  let phone = extractPhone(body);
  let address = '';
  let area = '';

  // Property address — common patterns
  const addrM = body.match(/(?:property|address|listing|home)[:\s]+([^\n\r]{5,100})/i);
  if (addrM) address = addrM[1].trim();

  // City/area
  const cityM = body.match(/(?:city|location|in)[:\s]+([A-Z][a-zA-Z\s]{2,40}?)(?:,|\.|\n|$)/);
  if (cityM) area = cityM[1].trim();

  // Fallback name from From header: "John Smith <john@email.com>"
  if (!name && from) {
    const m = from.match(/^([^<@"]+?)\s*(?:<|$)/);
    if (m && !/(noreply|notification|leads?|info|alerts?)/i.test(m[1])) {
      name = m[1].trim();
    }
  }

  // BoldTrail-specific patterns (their lead emails often have "Lead: <name>")
  if (source === 'BoldTrail') {
    const btName = body.match(/(?:lead|name|contact)[:\s]+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)+)/i);
    if (btName && !name) name = btName[1].trim();
    const btPhone = body.match(/phone[:\s]+([\d().\s-]{10,20})/i);
    if (btPhone) phone = extractPhone(btPhone[1]) || phone;
  }

  return {
    source,
    name:    (name || `${source} Lead`).slice(0, 80),
    email:   (email || '').slice(0, 100),
    phone:   (phone || '').slice(0, 30),
    notes:   `Subject: ${subject || ''}\n\n${body.slice(0, 600)}`.slice(0, 800),
    address: address.slice(0, 120),
    area:    area.slice(0, 60),
    budget:  '',
    status:  'Hot Prospect',
    type:    'Buyer',
  };
}
