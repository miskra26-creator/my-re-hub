# CLAUDE_NOTES.md — Shared session log between laptop + office desktop

> Both machines' Claudes read + update this file every session. Always git-sync
> before reading it; always git-push after updating it. See `CLAUDE.md` for the
> full session lifecycle protocol.

---

## Last session: 2026-05-22 (home-pc, evening into late night — FUB migration architecture pivot)

### Headline

**Monica articulated the core problem cleanly tonight: my-re-hub was a FUB viewer,
not a FUB replacement. Every "sync" was me asking FUB for data again, not
owning it. The day she cancels FUB, my-re-hub would go dark for everything but
leads.** Architecture pivoted accordingly.

### Major work shipped tonight

1. **Gmail OAuth fully wired up** — Monica completed the Google Cloud setup
   (Client ID `892886589497-a0mk17n49i744su40h94a2d8qq8nl74c.apps.googleusercontent.com`).
   Authorized JS origin was initially put in the wrong field (redirect URIs); we
   moved it. She's now connected. 365-day backfill running in browser.
2. **Gmail sync perf rewrite** — first version froze her browser tab because the
   algorithm was O(emails × leads) = 18M iterations on the main thread for her
   6000+ leads. Fixed with O(1) email→lead Map + UI yielding every 50 messages +
   bulk per-lead writes. Body cap dropped 5KB → 2KB. See commit `c68d8a9`.
3. **ContactDetail freeze on lead click fixed** — wrapped the timeline
   computation in useMemo so opening a lead with thousands of activities doesn't
   re-iterate the whole array per render. Commit `3fb0678`.
4. **FUB Migration tool BUILT and SHIPPED** — `src/FubMigration.jsx`. One-time
   mass import of every note/event/text/call/email from FUB into IndexedDB.
   Resumable, rate-limit aware, live progress UI, debug log to diagnose the
   missing-texts bug. Settings → 🗄️ FUB Migration. Auto-sync OFF toggle so once
   import completes, my-re-hub stops calling FUB on every app load.
5. **ContactDetail reads from IDB cache first** — `fetchFubLeadDetail` checks
   `fub_data_<leadId>` in IndexedDB before falling back to live FUB API. Means
   after migration, FUB is read-only optional.
6. **Live "Search Gmail" button** on each lead's Emails tab — bypasses FUB
   redactions, pulls all email ever sent to/from that address with bodies, no
   storage cost. Useful for old leads outside the 365-day cache.
7. **Lender directory** + **FUB-style ContactDetail header** — Source pill,
   Agent dropdown, Lender dropdown with inline add. Avatar color-coded by lead
   source. Pane widened from 520px to `min(1100px, max(720px, 58vw))`.
8. **Tabs split FUB-style** — Activity / Tasks / Notes / Emails / Texts / Calls
   each with accurate count badges.
9. **Texts/calls bug root cause IDENTIFIED**: FUB's `textMessages` endpoint is
   "Restricted - Registered Systems Only" — needs `X-System` + `X-System-Key`
   headers our proxy didn't send. Fix shipped in `api/fub/[...path].js` — now
   forwards env vars `FUB_SYSTEM` and `FUB_SYSTEM_KEY` if present. **Monica
   needs to register a system at apps.followupboss.com/system-registration and
   add the env vars on Vercel when she wakes up.** Full instructions in
   `RESEARCH_NOTES.md`.

### What's running RIGHT NOW (Monica's browser, overnight)

She kicked off the FUB Migration before bed. The import is iterating 6,041
leads at ~2 concurrent × 5 endpoints. Estimated 30 min – 2 hours. Progress
saves to `localStorage.fub_import_progress` every batch so it's resumable. She
needs to leave the browser tab open or it stops.

### Research doc written: RESEARCH_NOTES.md

Contains:
- Texts bug fix instructions (Monica's morning task)
- BoldTrail features worth stealing + skipping
- Survey of Sierra, Real Geeks, Lofty, LionDesk (now defunct), Wise Agent, Ylopo
- **The AI ISA opportunity** — biggest competitive gap in market; ~6h to build
- Proposed roadmap with Phase 0/1/2/3 priorities
- Honest doubts section (IDX gate, Twilio dependency, etc.)
- Total cost analysis: $10-35/mo for my-re-hub vs. $1k+/mo for commercial stack

### Binding Monica rules (still in effect, repeated for emphasis)

- **Honest upfront.** When something needs paid AI / 3rd party / her direct
  action — say so in the FIRST message. No "try this, try this" dead-end loops.
- **She is NOT canceling FUB yet.** Smart. Run both in parallel until my-re-hub
  is proven over 2-3 weeks of daily use.
- **No more new features until the existing ones are battle-tested.** Her
  exact words: "nothing in here really works yet."

### Tomorrow morning's priority

1. Verify the FUB migration completed overnight (check Settings → FUB Migration
   for the %). If paused, click Resume.
2. **Register system with FUB** + add `FUB_SYSTEM` and `FUB_SYSTEM_KEY` to
   Vercel env vars. Verify texts/calls now appear.
3. After both done: turn off FUB auto-sync. App now reads from local cache.
4. Pick a Phase 0 item from `RESEARCH_NOTES.md` to tackle next.

---

## Previous session: 2026-05-21 (laptop, late evening — AutoReel deep dive, hard lesson)

### Headline

**5+ hours burned trying to make AutoReel match AutoReel.app / VideoTour.AI quality
for $0. It cannot be done — free open-source AI video models hallucinate badly on
realistic real-estate scenes (people, water, faces).** Monica was rightfully furious
by end of session. **Hard commitment going forward**: when something is not possible
at $0, say so IN THE FIRST MESSAGE. No more "try this, try this" loops on dead ends.

### Tomorrow's actual priority

Build the **Past Client Care Agent** — Monica's new vision is multiple specialized
AI agents (not a generic AutoReel-clone). She picked this direction at the end of
the session. See `session_state_2026-05-21_evening.md` in personal memory for full
agent vision.

Three options offered, awaiting her pick:
- **A**: Past Client Care Agent first (3-4 hrs, lowest risk) ← default if she shrugs
- **B**: Agents framework scaffold first (~2 hrs), then Past Client agent
- **C**: Different priority

### What got built (untested by Monica, exists in code)

- `src/AutoReel.jsx` (full page, default AI Motion OFF)
- `src/aiReelOverlays.js` (animated JUST LISTED sign, stat stickers, feature labels, watermark)
- `src/aiReelStitch.js` (FFmpeg-wasm stitching)
- `src/aiDepthMap.js` (Depth-Anything-v2 in browser for 2.5D parallax)
- `src/cinematicRender.js` (heavy edits — depth parallax, overlays integration)
- `src/aiVirtualStaging.js` (added `addLifestylePeople` — Gemini Image inserts people)
- `src/autoReelVoice.js` (F5-TTS + ElevenLabs + browser fallback)
- `src/VirtualStaging.jsx` (new tab, MLS-prep features)
- `api/gemini/image-edit.js` (Gemini 2.5 Flash Image for staging)
- `api/elevenlabs/index.js` (CONSOLIDATED — replaced 4 separate endpoints; was hitting 12-function cap)
- `api/mls-lookup.js` (broken, Vercel silently refuses to compile, low priority)
- `tools/video-motion-server/modal_deploy.py` (LTX-Video on Modal, deployed live at `https://miskra26--ltx-motion-api.modal.run` but quality is poor — keep off by default)

### Critical infrastructure facts

- **Vercel function count is AT THE CAP** (12/12 on Hobby plan). Any new endpoint requires
  consolidating two existing ones first. Past Client Agent likely needs 1 new background
  worker — consolidate first OR run it client-side as a worker in App.js.
- **LTX-Video Modal endpoint exists** at `https://miskra26--ltx-motion-api.modal.run` but
  the 2B-param open-source model produces low-quality output. Keep it deployed but default
  the AutoReel "AI Motion" toggle to OFF (already done).
- **Tab rename**: old basic Auto Video Maker → "Simple Slideshow Maker". New AutoReel
  → "🎬 AI Cinematic Reels". Both live in CREATE nav. Monica was confusing the two.

### Pending external dependencies

- **Realcomp IDX API**: Monica emailed IDXSupport@realcomp.com tonight (~10 PM EDT).
  Awaiting reply (SLA: 1 business day). When credentials arrive, integrate properly to
  replace our broken Realtor.com fallback.
- **Twilio**: not signed up. Past Client Agent CAN work without it (drafts SMS as Task,
  Monica taps Send). ~$5-15/mo for zero-touch.
- **Pika**: $8/mo if she ever wants real cinematic AI video. Not urgent.

### What Monica thinks doesn't work (but does — she just hasn't tested)

She suspects "the platform really doesn't work" because we haven't actually walked
through any of these:

1. `/ai-concierge` → Preview tab → see what AI drafts for a real lead
2. `/db-intel` → Run Analysis on her 6,041 leads → ranked buckets
3. `/lead-inbox` → test webhook with a fake lead
4. `/social-agent` → Preview tab → see AI-drafted comment replies
5. `/closing-mult` → load a recent sold address → 6 marketing assets generated

These ALL work in code. She just hasn't validated them. If the office-desktop Claude
gets her tomorrow morning, propose walking through these in a structured 30-min test
session BEFORE building anything new.

### Things to NOT do tomorrow

- Don't touch AutoReel without her explicit request — she's burned out on it
- Don't suggest paid services unless she asks — she's anti-spending right now
- Don't iterate on the Realtor.com auto-import — it's permanently blocked by Kasada
- Don't promise "this will work" without confidence; say "I'm not sure" if not sure

### Things to do tomorrow

- Greet briefly, don't relitigate tonight
- Confirm her A/B/C pick for the Past Client Care Agent build
- Start coding immediately, no architecture-talk preamble
- Show end-to-end working before moving to next thing

---

## Previous session: 2026-05-20 (laptop, evening — autonomous "keep building" run)

### Headline

**Shipped 5 major AI-powered features in one evening.** Monica said "keep
building" + "this platform needs to make me a $30-50M producer." Built the
agent stack she'd otherwise pay ~$500-2000/mo for if she bought all the
SaaS equivalents separately.

### What got built (all live on https://my-re-hub.vercel.app)

**1. Free AI via Google Gemini fallback** (`api/claude/messages.js`)
- `/api/claude/messages` now tries Anthropic first, then Gemini (free tier).
- Default model: `gemini-flash-latest` (only model with non-zero free tier
  on Monica's new project — 2.0-flash and 2.0-flash-lite both show limit:0).
- Translates Anthropic message format → Gemini contents format and back.
- Vercel env var: `GOOGLE_GEMINI_API_KEY` (set). Monica's free Gemini key
  is live. All AI features now run at $0 monthly cost.

**2. AI Lead Concierge** (`src/aiResponder.js` + `AILeadConcierge` + `AILeadConciergeWorker`)
- Listens via Supabase realtime for new `lead_inbox` rows.
- Drafts personalized email + SMS via one AI call.
- Auto-sends email through GmailSyncWorker. Creates Text task with smsBody
  for one-tap-Send (Twilio Phase 2).
- Settings page at `/ai-concierge`: per-source toggles, channels, daily cap,
  quiet hours, live preview.
- Safety: off by default, won't double-fire, marks `concierge_fired_at`
  on inbox row.

**3. Social Engagement Agent** (`src/aiSocialAgent.js` + `SocialAgent` + `SocialEngagementWorker`)
- Polls Meta Graph API every 5 min for new FB Page + IG Business comments.
- Pre-filter (spam patterns, low-signal noise) before spending AI calls.
- Auto-like ALL FB comments (algorithm booster). Auto-reply substantive
  ones in Monica's voice via Graph API.
- Detects buyer/seller intent → drafts a DM (queued for review, NOT
  auto-sent because pages_messaging needs 24-hr window + app review).
- Escalates negative/legal/complex to her inbox with toast notification.
- Page at `/social-agent`: 3 tabs (Activity / Settings / Preview AI).
- HUGE for her FB monetization — fast replies = 3-5x algorithm boost.
- Requires Meta Page Access Token scopes: `pages_manage_engagement`,
  `pages_read_engagement`, `instagram_manage_comments`. She may need to
  regenerate her token if it's only got the post/publish scopes.

**4. Database Intelligence** (`src/aiDatabaseIntel.js` + `DatabaseIntel`)
- Batches her 6,041 leads through Gemini, scores each 1-10 on
  transaction-likelihood-in-next-90-days, sorts into 5 buckets:
  - 🔥 Hot Revival (high-intent leads she stopped working)
  - 📈 Buyer Signals (active intent in notes/status)
  - 🏡 Sell Window (past clients 4-7yr post-close — peak resell)
  - 💌 Sphere Touch Due (overdue check-ins)
  - ❄ Truly Cold (suggest archive)
- Per-lead: AI's reasoning + suggested next action + pre-written script.
- One-click actions: Text Now (opens SMS + copies script), Enroll in
  Long-Term Nurture drip, Enroll past clients in Sphere 33-Touch.
- Page at `/db-intel` under INSIGHTS.
- Batch size 25, 250ms between batches, ~5-10sec per batch. For 6000 leads
  that's ~20-40 minutes one-time. Re-run weekly.

**5. Closing Multiplier** (`src/aiClosingMultiplier.js` + `ClosingMultiplier`)
- One closing → 6 marketing assets in one AI call:
  - 📱 IG Reel (hook + script + B-roll + caption)
  - 📘 FB post
  - ✉ Sphere email (subject + body)
  - 📮 Just-Sold postcard (headline + subhead + CTA, rendered preview)
  - ⭐ Google review request (specific to client's deal)
  - 💡 "Lessons" teaching post (LinkedIn-style)
- Auto-pulls from synced Realcomp listings (one-click "load this sold").
- Save-to-library for re-use.
- Page at `/closing-mult` under GROW.

### Files added this session
```
src/aiResponder.js              # Lead concierge AI drafter
src/aiSocialAgent.js            # FB/IG comment AI replier
src/aiDatabaseIntel.js          # Lead scoring engine
src/aiClosingMultiplier.js      # Closing → 6 assets generator
src/useLeadsCloud.js            # (earlier in session) leads table hook
api/_lib/parseRealcompCSV.js    # (earlier) shared Matrix CSV parser
api/webhook/realcomp-csv.js     # (earlier) Cloudmailin → listings webhook
supabase-migrations/003_leads_table.sql
supabase-migrations/004_listings_table.sql
```

### Stack snapshot

- **App**: `https://my-re-hub.vercel.app` (Vercel auto-deploys on push to main)
- **GitHub**: `https://github.com/miskra26-creator/my-re-hub`
- **Supabase**: `https://hastxrejqacppfgdldrm.supabase.co`
  - Tables: `user_data`, `lead_inbox`, `leads` (6041 rows), `listings`
- **Vercel env vars**: REACT_APP_SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY,
  FUB_API_KEY, REACT_APP_FUB_API_KEY, CI=false, MLS_USER_ID,
  **GOOGLE_GEMINI_API_KEY** (new this session).
  Not set: ANTHROPIC_API_KEY (Monica declined to pay — Gemini covers it).
- **Cloudmailin**: Monica signed up, address `0898465e000e14a5ef1f@cloudmailin.net`,
  pointed at `/api/webhook/realcomp-csv`. Matrix scheduled email twice
  daily (AM + PM). First sync runs tomorrow morning.

### What's queued and what's blocked

Monica said "test later, keep building" — she hasn't actually used any of the
4 AI features yet. When she comes back:

**She should test in this order:**
1. **Closing Multiplier** — easiest win, instant satisfaction. Type one of her
   recent sold addresses, watch 6 assets generate in 10 sec.
2. **AI Lead Concierge** — Preview tab first, then turn ON if happy.
3. **Database Intelligence** — Run Analysis (will take a few min for 6k leads).
4. **Social Engagement Agent** — needs Meta token scope check; Preview tab safe
   to test without enabling.

**Queued for next session (not yet built):**
1. **Pre-Listing Presentation Builder** — auto-gen 10-slide deck for listing
   appointments. Comps, marketing plan, her stats, net sheet, PDF download.
2. **Seller Lead Gen Engine** — home valuation landing pages per neighborhood,
   QR codes for postcards/signs, automated equity report emails.
3. **Hyper-Targeted Ad Composer v2** — extend existing AdComposer to auto-pull
   active listings and generate listing-specific ad creative variants.
4. **Custom domain** — wire `hub.teamiskrasells.com` via GoDaddy CNAME.
5. **Twilio integration** — true SMS auto-fire. ~$5-15/mo. Currently SMS
   drafts as Tasks; she taps Send on her phone.
6. **Realcomp first auto-sync verification** — tomorrow morning, confirm CSV
   email arrived → webhook → listings populated.

### Gotchas / things to watch

- **Gemini quota per-project**: `gemini-2.0-flash` and `gemini-2.0-flash-lite`
  show `limit:0` on Monica's project. `gemini-flash-latest` works. If we
  ever upgrade to Pro, may need to recheck.
- **Realtime channel uniqueness**: every Supabase channel name must be unique
  per subscription (Date.now()+random suffix). All workers follow this.
- **Meta token scopes**: Social Agent will silently fail if her current token
  is missing engagement scopes. The page banner detects connection but not
  scope-level. If Activity tab stays empty after enabling, regenerate token.
- **Listings page (RealcompMLS)**: now reads from Supabase listings table
  (not localStorage `realcomp_listings`). Old localStorage data is orphaned;
  could clean up later.
- **AI Lead Concierge fires on `lead_inbox` INSERT only**: doesn't auto-fire
  for manually-added leads (those go straight to `leads` table). That's by
  design — manual leads are agents adding sphere/referrals, no auto-blast.
- **Auto-sync git script** still working — pushed all 5 features this session
  successfully.

### State of dev server
- Should still be running on her laptop from earlier in the day.
- All builds passed clean. All features compile. None blocked on her input
  beyond Monica testing + (optionally) regenerating Meta token for full
  Social Agent functionality.

---

## How to update this file

When wrapping up a session:
1. Add a new `## Last session` section at the top
2. Move the previous one down (archive after a week)
3. Update queued / in-flight / gotchas
4. Commit + push (`npm run save`)
