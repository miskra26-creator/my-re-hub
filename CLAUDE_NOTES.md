# CLAUDE_NOTES.md — Shared session log between laptop + office desktop

> Both machines' Claudes read + update this file every session. Always git-sync
> before reading it; always git-push after updating it. See `CLAUDE.md` for the
> full session lifecycle protocol.

---

## Last session: 2026-05-20 (laptop) — Cloud lead-parsing infrastructure SHIPPED

### What got done

**Cloud Lead Inbox — end-to-end working.** Monica wants to drop FUB and route her own leads. The full pipeline is now live:

- **Supabase `lead_inbox` table** created with RLS:
  - `INSERT` open to anon role (webhooks deliver leads with the public anon key)
  - `SELECT`/`DELETE` only for authenticated users (Monica)
  - Migration committed: `supabase-migrations/002_lead_inbox.sql`
  - Schema ran via Supabase Management API (using her personal access token `sbp_d7574208ad...` — token still active, can revoke at supabase.com/dashboard/account/tokens)
  - Also granted base table privileges (`grant insert on lead_inbox to anon, authenticated; grant select, delete to authenticated; grant select to anon`) — needed in addition to RLS policies, otherwise PostgREST returns 401
- **Vercel serverless webhook functions** at:
  - `api/_lib/parseLead.js` — shared parsers + source detection (added BoldTrail/kvCORE, Sierra Interactive, Chime, IDX Broker)
  - `api/_lib/leadInbox.js` — Supabase REST insert helper. **Important: does NOT use `Prefer: return=representation`** — that header makes PostgREST try a follow-up SELECT, blocked by RLS for anon
  - `api/webhook/lead.js` — generic structured JSON (Zapier/Make)
  - `api/webhook/email.js` — email forwarder (Cloudmailin/SendGrid Inbound Parse/Zapier Email Parser)
  - `api/webhook/zillow.js`, `api/webhook/realtor.js`, `api/webhook/boldtrail.js`, `api/webhook/facebook-lead.js`
- **LeadInbox React component** rewritten to use Supabase instead of localhost:3001:
  - Reads via `supabase.from('lead_inbox').select(...)` ordered by `received_at desc`
  - Realtime subscription on `lead_inbox` table — new leads appear instantly, no polling
  - Import: writes to her local `leads` via useIDB + deletes from inbox (Supabase DELETE)
  - Dismiss: just deletes from inbox
  - SETUP tab shows live Vercel webhook URLs (uses `window.location.origin`)
  - "Server not running" warning removed (no longer relevant — fully cloud)
  - TestLeadForm POSTs to relative `/api/webhook/lead`
- **App-level inbox-count watcher** also migrated from localhost polling to Supabase realtime subscription — toast + browser notification fire when new leads arrive
- **Verified end-to-end**: curl POST → webhook → Supabase row → UI display. Monica confirmed she saw the test lead in the Lead Inbox UI

**Live webhook URLs** (also visible in app at Lead Inbox → Source Setup tab):
- `https://my-re-hub.vercel.app/api/webhook/lead` — generic / Zapier
- `https://my-re-hub.vercel.app/api/webhook/email` — any email forwarder
- `https://my-re-hub.vercel.app/api/webhook/boldtrail` — BoldTrail / kvCORE
- `https://my-re-hub.vercel.app/api/webhook/zillow` — Zillow
- `https://my-re-hub.vercel.app/api/webhook/realtor` — Realtor.com
- `https://my-re-hub.vercel.app/api/webhook/facebook-lead` — FB Lead Ads (GET verifies, POST delivers)

### Earlier in session (still relevant — don't redo)

- **Finances page** (`src/Finances.jsx`) — Dashboard / Income / Expenses with Schedule C / Goals
- **FUB sync fix** — `.env.local` recreated, key reads from localStorage first, auto-sync on LeadTracker mount + every 10 min + on focus
- **Lead Tracker visual redesign** (scoped `.lead-tracker-v2` class, Cabinet Grotesk + Inter fonts, cream/charcoal theme — Monica paused mid-iteration, will return)
- **Cloud deploy infrastructure** (Supabase + Vercel + cross-device sync) — `https://my-re-hub.vercel.app` is the URL she uses on every device
- **CLAUDE.md + CLAUDE_NOTES.md** added as multi-machine coordination protocol
- **Git config fixed** globally (`Monica Iskra` / `monica@teamiskrasells.com`) — auto-sync script works again
- **Desktop Claude separately added** `npm run sync` + `npm run save` scripts + fixed `vercel.json` rewrites to exclude `/api/` from SPA catch-all

### Stack snapshot

- **App**: `https://my-re-hub.vercel.app` (auto-deploys on push to GitHub `main`)
- **GitHub**: `https://github.com/miskra26-creator/my-re-hub`
- **Supabase**: `https://hastxrejqacppfgdldrm.supabase.co`
  - Project ref: `hastxrejqacppfgdldrm`
  - Tables: `user_data` (key-value per-user, RLS) + `lead_inbox` (shared inbox, RLS)
  - PAT for Management API: stored locally only (Monica generated `sbp_...` at supabase.com/dashboard/account/tokens — ask her to regenerate if needed)
- **Vercel env vars** (production): `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, `FUB_API_KEY`, `REACT_APP_FUB_API_KEY`, `CI=false`. Not yet set: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`
- **Local `.env.local`** (gitignored, per-machine) has same Supabase + FUB keys

### Currently in-flight

- **Lead Tracker visual polish** — only top-level page got light theme. Still dark/unfinished:
  - `ContactDetail` lead drawer
  - Add Lead form
  - Bulk action bar
  - Filter dropdowns (status / type / tag)

### Queued for next (priority order)

1. **Set up actual email forwarding** so Zillow/BoldTrail/Realtor.com emails reach the webhooks automatically. Two paths:
   - **Cloudmailin** (recommended for fast setup) — sign up for free account, get a `*@cloudmailin.net` address, POSTs forwarded emails to her webhook URL. Free tier: 100 emails/mo (might be tight). Pro: $10/mo for 1500.
   - **SendGrid Inbound Parse** with her own domain — uses `leads.teamiskrasells.com` subdomain with MX records pointing to SendGrid. Free, unlimited. Requires DNS work in GoDaddy.
   - Then Gmail filters: any email from Zillow/BoldTrail/Realtor.com/Sierra IDX → forward to the parse address
2. **BoldTrail API integration** (if her brokerage gives her API access) — pull leads directly instead of email forwarding
3. **Custom domain** — wire `hub.teamiskrasells.com` to Vercel. ~10 min in GoDaddy DNS
4. **Add `ANTHROPIC_API_KEY` to Vercel** — for AI features in prod (script writing, ad composer, market reports)
5. **Finish Lead Tracker polish** (in-flight bullets above)
6. **Roll light theme to other pages** — Dashboard, Pipeline, Finances, Commission Tracker
7. **Meta Ads Phase 2** — image upload + LEAD_GENERATION objective + auto status-sync
8. **Auto-respond toggle for AI Lead Responder** — auto-fire AI replies for hot Zillow leads with confidence threshold + opt-out + daily cap
9. **Smart caption animation** — Submagic-style word-pop + auto-emoji on burned captions
10. **AVM consolidation** — cross-link tools → Auto Video Maker pre-fill via localStorage handoff
11. **Bank/CC CSV import for Finances**
12. **Video bg replace integration with AVM**
13. **Eventually drop FUB** entirely once email forwarding + her lead sources are routing through my-re-hub for 30-60 days reliably

### Gotchas (lessons learned)

- **Don't run both Claudes simultaneously.** Laptop + desktop both editing GitHub at once = merge fork. Resolved this session via fast-forward pull
- **`.env.local` per machine** (gitignored). Update on BOTH machines AND in Vercel when adding env vars
- **CRA env vars need full dev-server restart** to load (hot reload won't pick them up)
- **Supabase realtime channel names need uniqueness** — `cloudHooks.js` suffixes with `Date.now()` + random slug so React StrictMode double-mount doesn't crash. Don't simplify
- **Lead Tracker uses `!important` heavily** — intentional, overrides inline `style={{}}` colors React renders. Same pattern when extending light theme
- **Supabase anon role needs BOTH RLS policy AND base table grants** for INSERT — discovered when the table existed but inserts returned 401. RLS alone isn't enough; PostgreSQL's underlying `GRANT INSERT ON ... TO anon` is also required. Same for SELECT (even with auth-only RLS, anon needs base SELECT grant or PostgREST chokes on `return=representation`)
- **Webhook responses to anon role**: don't use `Prefer: return=representation` header on inserts unless you ALSO grant the role read on the table — PostgREST does an implicit SELECT after INSERT and it gets RLS-blocked
- **Monica's personal access token + database password** — both pasted in chat this session. She declined to rotate previously (FUB key). Treat as already-compromised; rotate if anything weird happens

---

## How to update this file (for future Claude sessions)

When wrapping up a session:

1. Add a new `## Last session: YYYY-MM-DD (laptop|desktop)` section at the top
2. Move the previous "Last session" section down (or archive it after a week)
3. Update **Currently in-flight** and **Queued** based on what you did
4. Add anything to **Gotchas** that the other Claude needs to know
5. Commit + push (`npm run save` or just `git add CLAUDE_NOTES.md && git commit && git push`)
