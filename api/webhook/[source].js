/**
 * One route for every lead webhook.
 *
 * WHY: Vercel's Hobby plan allows 12 serverless functions per deployment, and
 * seven of them were individual webhook files. Adding the birthday cron made 13
 * and every production deploy started failing — the build compiled fine, then
 * died at "Deploying outputs" with no error message, which is a miserable thing
 * to debug. Consolidating here takes the count from 13 to 7 and leaves room for
 * the rest of the automation.
 *
 * The handlers themselves were MOVED, not rewritten, into api/_lib/webhooks/.
 * Files under _lib are plain imports rather than routes, so they don't count
 * against the limit. Their logic is untouched.
 *
 * URLS ARE UNCHANGED. /api/webhook/zillow still resolves here, because this is
 * a dynamic segment. Nothing configured on Zillow's, Realtor.com's, BoldTrail's
 * or Cloudmailin's side needs to be touched — which matters, since some of
 * those are set up inside third-party dashboards.
 */
import boldtrail from '../_lib/webhooks/boldtrail.js';
import email from '../_lib/webhooks/email.js';
import facebookLead from '../_lib/webhooks/facebook-lead.js';
import lead from '../_lib/webhooks/lead.js';
import realcompCsv from '../_lib/webhooks/realcomp-csv.js';
import realtor from '../_lib/webhooks/realtor.js';
import zillow from '../_lib/webhooks/zillow.js';

const ROUTES = {
  boldtrail,
  email,
  'facebook-lead': facebookLead,
  lead,
  'realcomp-csv': realcompCsv,
  realtor,
  zillow,
  // Aliases, so a mistyped or rebranded path still lands a lead rather than
  // 404ing into a void. kvCORE is BoldTrail's former name and is still what
  // some integrations send.
  kvcore: boldtrail,
  'inside-real-estate': boldtrail,
  facebook: facebookLead,
  fb: facebookLead,
  realcomp: realcompCsv,
};

export default async function handler(req, res) {
  const raw = req.query?.source;
  const key = String(Array.isArray(raw) ? raw[0] : raw || '').toLowerCase();
  const route = ROUTES[key];
  if (!route) {
    return res.status(404).json({
      ok: false,
      error: `Unknown webhook source "${key}"`,
      known: Object.keys(ROUTES),
    });
  }
  return route(req, res);
}
