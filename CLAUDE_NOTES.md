# CLAUDE_NOTES.md — Shared session log between laptop + office desktop

> Both machines' Claudes read + update this file every session. Always git-sync
> before reading it; always git-push after updating it. See `CLAUDE.md` for the
> full session lifecycle protocol.

---

## Last session: 2026-05-20 (laptop)

### What got done

- **Finances page shipped** (`src/Finances.jsx`) — Dashboard / Income / Expenses
  (with Schedule C categories + receipt photos + mileage tracker) / Goals.
  Shares storage keys with the existing CommissionTracker.
- **FUB sync crisis fixed:**
  - `.env.local` was missing; recreated with FUB key + Supabase keys
  - Auto-sync git script had been failing 2 days (git config user.name/email
    weren't set) — fixed globally with `Monica Iskra` / `monica@teamiskrasells.com`
  - `syncFUB` now sends key as `x-fub-key` header from localStorage `integrations.fub.apiKey`
  - **Auto-sync added to LeadTracker** — runs on mount + every 10 min + on
    window focus, 60s debounce
- **Lead Tracker visual redesign** (light/warm theme, scoped to `.lead-tracker-v2`
  wrapper class — rest of app stays dark). Cabinet Grotesk + Inter fonts.
  Monica paused mid-iteration ("save for now") — this is a checkpoint, not final.
- **CLOUD DEPLOY LIVE**: 🎉
  - Supabase: `https://hastxrejqacppfgdldrm.supabase.co` (schema ran, RLS active)
  - Vercel: `https://my-re-hub.vercel.app` (auto-deploys on push to main)
  - `src/supabase.js` real client + `src/cloudHooks.js` Supabase-sync rewrite
  - Verified cross-device sync works: laptop signed in → office computer signed
    in with same email → same data visible on both.
- **Desktop Claude separately added** (`npm run sync` + `npm run save` scripts,
  fixed vercel.json rewrites so `/api/*` routes hit serverless functions instead
  of being eaten by the SPA catch-all).

### App user login (same on every device)

Monica signed up via the LoginScreen with a real email (she controls it).
**Use the SAME email + password on every device** — Supabase RLS = per-user, so
different emails = different accounts = data won't sync.

### Currently in-flight (mid-iteration, not finished)

- **Lead Tracker polish** — only the top-level page got the light theme. Still
  dark / needs work:
  - `ContactDetail` lead drawer
  - Add Lead form
  - Bulk action bar
  - Filter dropdowns (status / type / tag)

### Queued for next (priority order)

1. **Finish Lead Tracker visual polish** (above bullets)
2. **Roll light theme to other pages** — Dashboard, Pipeline, Finances,
   Commission Tracker. Reuse `.lead-tracker-v2` wrapper-class pattern.
3. **Custom domain** — Monica owns `teamiskrasells.com` on GoDaddy. Wire
   `hub.teamiskrasells.com` (or her chosen subdomain) to Vercel. ~10 min.
4. **Add `ANTHROPIC_API_KEY` to Vercel** — for AI features in production
   (script writing, ad composer, market reports). Get key from console.anthropic.com.
5. **Drop FUB ultimately** — original stated goal. Highest-ROI next step is
   **lead parsing** — server-side parser for Zillow / Realtor.com / IDX
   notification emails (so leads come into my-re-hub directly, FUB cut from
   the pipeline). Run parallel with FUB for 60 days first.
6. **Meta Ads Phase 2** — image upload for creative, LEAD_GENERATION objective
   with Lead Form, auto status-sync (Phase 1 launch flow shipped 2026-05-20).
7. **Auto-respond toggle for AI Lead Responder** — auto-fire AI replies for hot
   Zillow leads with confidence threshold + opt-out + daily cap.
8. **Smart caption animation** — Submagic-style word-pop + auto-emoji on burned
   captions (VideoAuto.jsx has karaoke baseline).
9. **AVM consolidation** — cross-link Viral Studio / Voice Clone / Smart Clips /
   Influencer Watch → Auto Video Maker pre-fill via localStorage handoff.
10. **Bank/CC CSV import for Finances**
11. **Video bg replace integration with AVM**

### Gotchas (things to watch out for)

- **Don't run both Claudes simultaneously.** That's how the desktop and laptop
  Claudes started forking — desktop made commits while laptop was making
  different ones. We resolved it via fast-forward pull, but next time it could
  be a real merge conflict.
- **`.env.local` per machine.** If you add a new env var on one machine, you
  must also add it on the OTHER machine AND in Vercel (via `vercel env add NAME production`).
- **CRA env vars require dev-server restart** — they're inlined at compile time.
  Hot reload doesn't pick them up.
- **Supabase realtime channel names need uniqueness** — `cloudHooks.js` suffixes
  channel names with `Date.now()` + random slug so React StrictMode double-mount
  doesn't crash. Don't simplify this back.
- **Lead Tracker uses CSS `!important` heavily** in the scoped `.lead-tracker-v2`
  block. That's intentional — overrides the inline `style={{}}` colors that
  React renders. Same pattern when extending the light theme to other pages.

---

## How to update this file (for future Claude sessions)

When you're wrapping up a session:

1. Add a new `## Last session: YYYY-MM-DD (laptop|desktop)` section at the top
   (above this current one — newest first).
2. Move the previous "Last session" section down or archive it after a week.
3. Update **Currently in-flight** and **Queued** based on what you did.
4. Add anything to **Gotchas** that the other Claude needs to know.
5. Commit + push (`npm run save` or just `git add CLAUDE_NOTES.md && git commit && git push`).
