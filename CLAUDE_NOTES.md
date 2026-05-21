# CLAUDE_NOTES.md — Shared session log between laptop + office desktop

> Both machines' Claudes read + update this file every session. Always git-sync
> before reading it; always git-push after updating it. See `CLAUDE.md` for the
> full session lifecycle protocol.

---

## Last session: 2026-05-20 (laptop, autonomous 3-hour run while Monica was away)

### Headline

**Cloud sync was secretly broken; leads now scale to 6000+ without freezing.**

When Monica reported the Add Lead form freezing with her 6,000-lead FUB sync,
digging in revealed two compounding bugs + a real architectural limit:

1. **`user_data` table had no base-table grants** — only the RLS policy.
   PostgREST silently 401'd on every cloud write. Result: nothing she'd
   done on the laptop EVER synced to Supabase. Both devices ran their own
   local copies. Fixed via SQL: `grant select, insert, update, delete on
   public.user_data to authenticated`. Also added to `supabase-setup.sql`.
2. **`cloudHooks` did O(n) JSON.stringify on read** to detect changes —
   200-400ms per useIDB key per load with her 2MB lead blob. Removed the
   comparison (trust cloud, accept the extra re-render).
3. **Architectural limit** — storing all 6000 leads as one giant JSON
   blob in `user_data.value` was always going to fight against itself.
   So we moved leads to a dedicated table with one row per lead.

### What got built (all committed + pushed, all deployed to Vercel)

**Dedicated `leads` table** (`supabase-migrations/003_leads_table.sql`):
- One row per lead, indexed on `(user_id, status)`, `(user_id, updated_at desc)`,
  `(user_id, fub_id)` for fast queries
- RLS scoped per-user + base table grants for authenticated role
- Auto-bumping `updated_at` trigger
- Already run against her live project via Supabase Management API

**`src/useLeadsCloud.js`** — purpose-built hook with module-level shared
store:
- All hook callsites (10 across the app) share one fetch + one realtime
  subscription. Avoids 10x redundant downloads of the lead array.
- Returns `[leads, setLeads, loaded]` — same API as `useIDB('leads', [])`
  so all consumers work unchanged.
- `setLeads(arrayOrFn)` does a smart field-level diff and only sends
  changed rows to Supabase. FUB sync's
  `setLeads(p => [...fubLeads, ...p.filter(l => !l.fubId)])` correctly
  upserts new fub leads + deletes removed ones, without re-uploading
  the whole array.
- Auto-migration: on first mount, if Supabase `leads` is empty AND IDB
  has the legacy blob, uploads in 500-row chunks and sets a
  `leads_migrated_to_table_v3` flag. Idempotent and safe to re-run.
- Realtime subscription on `leads` table for the current user — edits
  on one device propagate to the other within ~100ms.
- IndexedDB stays as offline cache; loads instantly while cloud fetch
  runs in parallel.

**App.js refactor** — all 10 `useIDB("leads", [])` → `useLeadsCloud()`.
Same return signature, so LeadTracker, ContactDetail, LeadInbox,
SOIManager, Tasks, Campaigns, Dashboard, etc. all worked without
further changes.

**Light theme extraction** — moved the cream/Cabinet Grotesk/Inter
aesthetic from `.lead-tracker-v2` into a reusable `.theme-light` class
in GlobalStyles. Applied to:
- Dashboard (page-content + theme-light)
- Finances
- Commission Tracker

Skipped Pipeline because its custom flex/kanban layout would fight
with `.theme-light`'s margin/padding. Needs a partial theme variant.

Also earlier in the same session before the autonomous push:
- Researched + shipped **9 lead-source drip campaigns** with proper
  email/text/call multi-channel cadence (Tom Ferry / Sierra 8x8 /
  Zillow 10-Day plan / Buffini 33-touch / FUB text-first / NAR data).
  See `BUILT_IN_CAMPAIGNS` in App.js.
- Added **Enroll in Drip Campaign** UI to ContactDetail with smart
  picker showing email/text/call breakdown per campaign.
- Added **📱 Send button** on text-type tasks (opens phone SMS app
  pre-filled, copies to clipboard fallback on desktop).
- Multiple LeadTracker perf fixes (memoized counts/filters/tags,
  100-lead pagination cap).

### How the migration plays out for Monica

On next load on each device (laptop + office), the new code:
1. Reads the legacy IDB leads blob instantly (instant UI)
2. Checks Supabase `leads` table → it's empty for her user
3. Sees the IDB has 6000+ leads + no migration flag → uploads in
   500-row chunks (~12 round trips, maybe 30-60 sec the first time)
4. Sets the migration flag in IDB so it doesn't re-run
5. From then on, every lead edit is a single-row UPSERT (cheap)
6. Other device next time it loads: cloud has leads, downloads them,
   replaces local IDB, shows the synced data

She should see this once, then the app should feel snappy.

### Stack snapshot (unchanged but for the new leads table)

- **App**: `https://my-re-hub.vercel.app` (auto-deploys on push to main)
- **GitHub**: `https://github.com/miskra26-creator/my-re-hub`
- **Supabase**: `https://hastxrejqacppfgdldrm.supabase.co`
  - Tables: `user_data` (key/value per-user), `lead_inbox` (incoming
    webhooks), `leads` (NEW — proper per-row storage)
  - PAT for Management API: ask Monica to regenerate at
    supabase.com/dashboard/account/tokens (the previous token she shared
    is still active; she's chosen not to rotate)
- **Vercel env vars**: `REACT_APP_SUPABASE_URL`,
  `REACT_APP_SUPABASE_ANON_KEY`, `FUB_API_KEY`, `REACT_APP_FUB_API_KEY`,
  `CI=false`. Not yet: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`.

### Currently in-flight

- **Pipeline theme rollout** — paused. Pipeline uses a custom flex
  layout for its kanban columns; `.theme-light`'s margin/padding would
  break it. Needs a `.theme-light-noframe` variant OR explicit override
  in `.theme-light` when paired with another class.
- **Custom domain** — Monica owns `teamiskrasells.com` on GoDaddy.
  Wire `hub.teamiskrasells.com` to Vercel via DNS CNAME. ~10 min.
  Vercel side: `vercel domains add hub.teamiskrasells.com`.
- **ANTHROPIC_API_KEY** for production AI features. Add to Vercel env.

### Queued for next session (priority order)

1. **Verify the leads migration ran for Monica** on her next session.
   Check Supabase `leads` table row count. If she has 6000 leads
   locally and the cloud is still empty, something failed in the
   migration — diagnose.
2. **Pipeline light theme** — needs the no-frame variant.
3. **Custom domain** — wire `hub.teamiskrasells.com`.
4. **Lead parsing email forwarding** — set up Cloudmailin or
   SendGrid Inbound Parse so Zillow/BoldTrail/Realtor.com emails flow
   into the existing webhook endpoints automatically.
5. **BoldTrail API integration** (if she has access through her office).
6. **Add ANTHROPIC_API_KEY to Vercel** for production AI features.
7. **Meta Ads Phase 2** — image upload + LEAD_GENERATION objective +
   auto status-sync.
8. **Auto-respond toggle for AI Lead Responder.**
9. **Smart caption animation** for VideoAuto.
10. **AVM consolidation** — cross-link other tools.
11. **Bank/CC CSV import for Finances**.
12. **Eventually drop FUB** entirely (~60 days of parallel running
    with lead parsing in place).

### Gotchas (lessons learned this session)

- **Supabase RLS without base grants = silent failure.** Discovered
  twice this session (lead_inbox + user_data). When creating any new
  Supabase table, the migration SQL must include both `alter table ...
  enable row level security` AND `grant select, insert, update, delete
  on <table> to authenticated`. Otherwise PostgREST will 401 even
  though the RLS policy would technically allow the action.
- **Don't `Prefer: return=representation` from anon-role inserts**
  unless the role also has SELECT — PostgREST runs an implicit SELECT
  to return the row.
- **Storing arrays in JSONB doesn't scale.** A 2MB blob in user_data
  was always going to be slow once leads got into the thousands.
  Anything that grows over 100 items + needs cross-device sync should
  go into its own table (with proper indexes + RLS) from day one.
- **`JSON.stringify(big)` is O(n) and expensive** — don't use it as a
  comparison primitive in hot React effect paths.
- **React StrictMode double-mounts effects in dev** — Supabase channel
  names must be unique per subscription (timestamp + random suffix) or
  the second `.subscribe()` errors with "cannot add postgres_changes
  callbacks after subscribe()".
- **CRA env vars require a full dev-server restart** to load. Hot
  reload doesn't pick them up.
- **Don't run both Claudes simultaneously.** Last week's lesson; still
  true. One brain at a time on the codebase or merge conflicts.

### State of the dev server

The dev server on Monica's laptop should still be running from earlier
in the session. The leads-refactor code changes will hot-reload through
HMR — she shouldn't need to restart. If anything looks weird, killing +
restarting `npm start` is always safe.

### How to apply if she says "back to work"

Surface the top 3 from the queue:
1. Verify her leads migration worked (check Supabase row count after
   she's loaded the app post-deploy)
2. Pipeline theme rollout
3. Wire her teamiskrasells.com custom domain

If she's reporting a problem instead, check:
- Browser console for `[useLeadsCloud]` migration log lines
- Supabase `leads` table row count for her user_id
- Whether the cloud sync is actually firing (Network tab should show
  PATCH/POST to `/rest/v1/leads`)

---

## How to update this file (for future Claude sessions)

When wrapping up a session:

1. Add a new `## Last session: YYYY-MM-DD (laptop|desktop)` section at the top
2. Move the previous "Last session" section down (or archive it after a week)
3. Update **Currently in-flight** and **Queued** based on what you did
4. Add anything to **Gotchas** that the other Claude needs to know
5. Commit + push (`npm run save` or just `git add CLAUDE_NOTES.md && git commit && git push`)
