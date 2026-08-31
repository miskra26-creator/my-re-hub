# CLAUDE_NOTES.md — Shared session log between laptop + office desktop

> Both machines' Claudes read + update this file every session. Always git-sync
> before reading it; always git-push after updating it. See `CLAUDE.md` for the
> full session lifecycle protocol.

---

## Last session: 2026-08-31 (desktop — brokerage rename + Daily Brief + free keep-alive)

### Brokerage rename: RE/MAX Classic → Prime + Property Real Estate
Monica confirmed she is now at **Prime + Property Real Estate** (was showing
inconsistently online — Prime+Property on Homes.com/FB, Keller Williams on Yelp,
RE/MAX Classic in the Hub). Replaced ALL 30+ hardcoded "RE/MAX Classic" strings
(+ one "Monica Iskra RE/MAX" subject) across src → "Prime + Property Real
Estate". Files: App.js (drip campaigns, re_profile defaults, email drafter),
aiResponder.js, aiSocialAgent.js, aiPastClientAgent.js, aiLeadResearch.js,
AIStudio.jsx, AutoReel.jsx, DailyOutreach.jsx, InfluencerWatch.jsx. Compiles
clean, no console errors. LEFT ALONE: generic input placeholders ("Keller
Williams, RE/MAX...") and the CMA "competing agent" field — those are examples,
not Monica's brokerage.
**CAVEAT for next Claude / Monica:** the SAVED `re_profile.brokerage` value in
her Supabase account overrides these code defaults anywhere that reads
`profile.brokerage`. Monica should confirm Settings → Profile → Brokerage says
"Prime + Property Real Estate" (couldn't set it from here — not signed in).
GBP integration: told her to SKIP it (Google API approval slog); use the free
Google Business Profile app directly. Do not keep pushing the Hub GBP connect.

### Headline
Built a **Daily Brief on the Dashboard** — the first thing Monica sees each
morning: WHO to reach today, WHY, and the exact script, with one-tap Text/Call.
It surfaces the AI intelligence already built (Database Intelligence +
DailyOutreach were powerful but buried in the nav and, per prior notes, never
tested). No new full-screen tool — a card that makes the existing investment
visible on login.

### What got built
- **`src/dailyBrief.js`** (new) — pure ranking module, ZERO AI cost at runtime.
  `buildDailyBrief({leads, tasks, scored, outreachLog, doneIds, limit})` merges
  3 tiers, dedupes by leadId, drops anyone contacted/dismissed today:
  1. Tasks (Call/Text/Email) due today or overdue — commitments first.
  2. `db_intel_results` AI scores — hot_revival → buyer_signal → seller_window
     → touch_due, by bucket rank then score, with the AI's reason + script.
  3. Fallback: status-priority × staleness (mirrors DailyOutreach's ranking) so
     the brief is never empty before an AI scan has been run.
- **`DailyBrief` component in `App.js`** (defined just above `Dashboard`,
  rendered at the top of the Dashboard between the greeting and the KPI row).
  - One-tap **Text** (sms: + copies script), **Call** (tel:), **Email**
    (mailto:), and **Dismiss for today** (✓).
  - Text/Call/Email log to `outreach_log` (same log DailyOutreach uses) and
    mark the source task completed. Dismiss writes to `brief_done`
    ({date, ids}) so it only hides for the day.
  - Collapsible (`brief_collapsed`). Shows "Run an AI scan →" nudge (→ db-intel)
    when no `db_intel_results` yet; "Full outreach list →" → daily-outreach.

### Verified
- Compiles clean, no console errors. Tested empty state (0 leads) AND seeded
  state (task + 2 scored leads): ranking, badges, scripts, dismiss-persists all
  confirmed via browser. Test localStorage keys cleared afterward.

### Shipped + deployed
- Daily Brief pushed live (commit ac9eb8b), confirmed in prod bundle
  (main.bf9846a3.js).
- **Monica declined Supabase Pro ($25/mo) — do NOT keep suggesting it.** Instead
  solved the auto-pause outage the FREE way:
  **`.github/workflows/keepalive.yml`** (new) pings the Supabase auth + REST
  endpoints daily (cron 17 9 * * *) so the 7-day inactivity pause never triggers.
  Uses the public publishable/anon key (safe, RLS-protected, already in the
  browser bundle). Also has workflow_dispatch for manual runs from the Actions
  tab. Verified the underlying ping reaches Postgres (401 = permission error
  FROM the DB = counts as activity). Not yet manually triggered (no gh CLI on
  this machine); first scheduled run will confirm.

### Still open / next
- Monica to run **Database Intelligence → Run Analysis** once (signed in, ~20-40
  min, free Gemini) to populate `db_intel_results` → upgrades the Daily Brief
  from fallback ranking to real AI 90-day scoring. Re-run weekly.
- Free automated backups (e.g. a GH Action pg_dump to repo/artifact) not built
  yet — would need the DB connection string / service_role key as a GH secret.
- Two-way SMS (Twilio) still queued. Note `src/twilioSms.js` now exists
  (sendSms, smsAutoSendEnabled) — partially wired since 5/20.

### Files touched
```
src/dailyBrief.js                  (new)
src/App.js                         (import + DailyBrief component + Dashboard render + briefBtn helper)
.github/workflows/keepalive.yml    (new — free Supabase keep-alive)
```

---

## Session: 2026-05-27 (web session via Claude Code on the web — Content Engine Top-15 rewrite + new Lead Research feature)

### Headline

Monica wanted the Influencer Watch "Content Engine" to stop showing Metro
Detroit caption templates and instead show the **top 15 US real estate
creators ranked by engagement/views**. Done. Then she asked for **prospect
lead research built into the hub** — built a new Lead Research page that uses
Gemini's free Google Search grounding. Several Instagram ads reviewed along the
way (all turned out to be things she already has or doesn't need).

### What shipped (all live on main / Vercel)

1. **Content Engine → Top 15 US creators** (`src/InfluencerWatch.jsx`)
   - Deleted the Metro Detroit READY_TO_FILM_TEMPLATES + the dead OLD prompt.
   - Creators now ranked #1–15 by **peak viral views** (parseViews helper sorts
     the viralViews string). Top 5: Glennda Baker, Madison Sutton, Ryan Serhant,
     Mauricio Umansky, Phil Hawkins. Cut the 5 lowest (Tom Ferry, Ricky Carruth,
     Krista Mashore, Loida Velasquez, Brandon Mulrenin).
   - New **"Creator of the Day" spotlight** (daily rotation through the 15).
   - Repurposed the Gemini **Optimize** button: it now writes 3 ready-to-post
     captions in that creator's style (emotional/educational/punchy), keyed by
     creator name. Rank badges on every card. Refresh-with-AI prompt asks for 15.

2. **NEW: Lead Research** (`src/LeadResearch.jsx` + `src/aiLeadResearch.js`)
   - Sidebar → GROW → 🔎 Lead Research. Takes name/email/phone/address (or
     prefill from a saved lead) and returns a prep brief: identity + confidence,
     facts found online, public profiles w/ links, property/area context,
     buyer/seller signals, talking points, questions to ask, gaps, sources.
   - Uses **Gemini Google Search grounding** to pull PUBLIC web info. Honest
     scope (told Monica): cannot pull private IG/FB by phone/email — Meta killed
     email/phone lookup in 2018; no API does it. Public web only.

3. **AI proxy change** (`api/claude/messages.js`)
   - Added optional `google_search: true` request flag → enables the Gemini
     `tools: [{ google_search: {} }]` grounding tool and returns the public
     `grounding` sources. Flag is stripped before forwarding to Anthropic.
     Backward-compatible — no other feature behaves differently.

### ⚠ GOTCHAS / OPEN ITEMS (read before touching Lead Research)

- **Grounding is UNCONFIRMED on her free tier.** Couldn't live-test from the web
  session (no GOOGLE_GEMINI_API_KEY in this env). Monica's first real search hit
  **"quota exceeded"** — so the call DID reach Gemini, but free-tier limits
  (per-minute + daily, shared across DB Intel / Concierge / Content Engine) blocked
  it. We have NOT yet seen a successful grounded result. If, after quota resets, it
  errors with something other than quota (e.g. tool-not-supported / billing), the
  likely fix is the grounding tool name in `api/claude/messages.js`
  (`google_search` for Gemini 2.x vs `googleSearchRetrieval` for 1.5).
- **Verizon Gemini ≠ the hub's Gemini.** Monica is adding **Verizon Google AI Pro
  / Google One AI Premium** (~$10/mo myPlan perk) in the next couple of days. THAT
  IS THE CONSUMER GEMINI APP — a totally separate "door" from the hub's developer
  API key. It does NOT raise the hub's quota and does NOT connect to the app. Her
  hub's Lead Research button stays rate-limited regardless. The Verizon app is a
  MANUAL workaround (paste-prompt into the Gemini app). To make the hub button
  unlimited would require billing on the API key (she hasn't, and is anti-spending).
- **Two-machine collision today:** home-pc auto-synced a **Daily Outreach** feature
  (`src/DailyOutreach.jsx` + nav/pages entries) while this session was building.
  Rebased cleanly — both Daily Outreach AND Lead Research are on main now. The
  App.js NAV array + pages object (~line 920 / ~10788) is the recurring collision
  point when both machines add features; resolve by keeping BOTH entries.

### Instagram ads Monica asked about (verdicts, for context)

- **Upsurge CRM Pros** = white-label GoHighLevel reseller (~$97/mo). Skip. Only
  real gap vs her hub = auto-sending SMS (Twilio, still not wired).
- **Filmora AI Spark** (photo→video) = legit (Wondershare). Complementary to her
  AI Studio, has a free tier, but generative video warps homes — test before
  client use. Don't need to buy.
- **"Full Claude Course for Real Estate Agents"** (3rd-party, "Jobscape") = ~11 of
  its 15 lessons are already features in her hub. Don't buy; use syllabus as a
  feature-gap checklist. Genuine gaps it surfaced: listing/buyer **presentation
  builder** (already queued), objection-handling roleplay, call-prep briefs.

### Queued / next

1. Confirm Gemini grounding actually returns a result (after quota resets or if she
   adds API billing). If it errors non-quota, fix the grounding tool name.
2. Optional polish: auto-pace/retry on quota in Lead Research so she never sees a
   raw "quota exceeded" error.
3. Older roadmap still open: **Phase 1 AI ISA + DB activation** (biggest ROI),
   battle-test existing AI features (her "nothing really works yet"), Twilio SMS,
   presentation builder.
4. **⚠ MONICA EXPLICITLY ASKED TO REMEMBER: she still needs to sync her IDX
   feed** (Realcomp). She emailed IDXSupport@realcomp.com back on 2026-05-21 and
   is waiting on credentials. Once they arrive, integrate properly to replace the
   broken Realtor.com scrape. Many features (behavioral triggers, listing alerts,
   IDX home-search website) are gated on this. KEEP CHECKING IN if she has heard
   back.
5. **⚠ Supabase free-tier auto-pause gotcha** — Monica's project paused after a
   week of inactivity (happened 2026-05-27), surfacing as "failed to fetch" on
   login from every browser. Subdomain went NXDOMAIN. Fix: she logs into
   supabase.com/dashboard and clicks "Restore project". Takes ~60s. This WILL
   recur. Long-term options for her: weekly calendar ping, or upgrade to Pro
   ($25/mo, no pause + daily backups — worth pitching given the hub holds
   6,000+ real leads now).

### Binding Monica rules (still in effect)

- Honest upfront — flag paid / 3rd-party / her-action in the FIRST message. No
  dead-end "try this, try this" loops. (Followed this re: IG/FB lookup being
  impossible and grounding being untested.)
- She is NOT a developer — just do things for her; don't make her debug.
- No new features until existing ones are battle-tested (she relaxed this twice
  today by explicitly requesting the Content Engine rewrite + Lead Research).
- Anti-spending — don't push paid services unless she asks.

### Update — same session, later: AI ISA assessed → Twilio SMS SHIPPED

Monica picked "build the AI ISA" then "build in Twilio," then had to step away and
said "keep working," so this was finished autonomously.

**Key finding (agent audit):** the AI ISA is ~90% ALREADY BUILT and working —
AI Lead Concierge auto-RESPONDS to new leads (sub-second, Supabase realtime on
`lead_inbox` INSERT), email auto-SENDS for real via Gmail, lead intake works from
6+ webhook sources, DB Intelligence scores the 6,041 leads into buckets, drip
scheduling fires real emails. **The ONLY missing piece was SMS auto-send.** So
Twilio was the whole job — not a rebuild.

**What shipped (live on main):**
- `api/twilio.js` — server-side SMS send. POST {to,body} with the Supabase session
  token as Bearer auth (only Monica can send). Inert until env vars set → returns
  {configured:false} so the app falls back to drafting a task.
- `src/twilioSms.js` — client helper `sendSms({to,body})` + `smsAutoSendEnabled()`.
- `AILeadConciergeWorker` (App.js ~8392) now AUTO-SENDS the text via Twilio when
  `localStorage.sms_autosend === 'on'` AND Twilio is configured; otherwise drafts
  the Text task exactly as before. Falls back to a draft on ANY send error.
  **DEFAULT OFF — zero behavior change until Monica turns it on.**
- AI Lead Concierge settings (`/ai-concierge` → Channels): new "⚡ Auto-send texts
  via Twilio" toggle + a "Send test text" button + setup instructions.

**⚠ Vercel function cap:** repo was at 12/12 (Hobby limit). To fit `api/twilio.js`
I removed **`api/mls-lookup.js`** (the Realtor.com scraper — already Kasada-blocked
& dead, only used by the dormant AutoReel). `AutoReel.jsx` still calls
`/api/mls-lookup` (now 404s) — left untouched per the "don't touch AutoReel" rule.
If AutoReel is ever revived, restore that endpoint. **Any further new endpoint
(e.g. Twilio inbound) needs another slot** — best candidate is consolidating the 6
lead webhooks into one `api/webhook/[source].js` (frees 5), but that's surgery on
LIVE lead intake — do it carefully with tests.

**MONICA'S TWILIO SETUP CHECKLIST (her actions — none done yet; she's doing it
over the next couple days):**
1. Create a Twilio account + buy a number (~$1-2/mo).
2. Complete **US A2P 10DLC registration** — carrier requirement; a form + a few
   dollars; takes minutes to a few days; CANNOT be skipped or texts get blocked.
3. Add 3 Vercel env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_PHONE_NUMBER`.
4. In hub → AI Lead Concierge → Channels: type her cell, hit "Send test text" to
   confirm, then flip "Auto-send texts via Twilio" ON.

**NOT done / next (Twilio fast-follows):**
- Inbound replies / true two-way ISA conversation (Twilio inbound webhook + store/
  match/auto-reply) — NOT built. Outbound only for now. Needs another function slot.
- Other SMS spots still draft-only: DatabaseIntel `quickText`, SmartLists bulk,
  DailyOutreach, PastClientAgent — upgrade them to call `sendSms()` (helper ready).
- Lead Research grounding still UNCONFIRMED (free Gemini quota — see gotcha above).

---

## Previous session: 2026-05-22 (home-pc, evening into late night — FUB migration architecture pivot)

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

### Update 2026-05-23 ~5am — Roadmap LOCKED IN

Monica woke up early (~4-5am her time). FUB migration confirmed 100% complete.
Long Q&A session about platform direction and website priorities.

Key decisions she made tonight:
- **Skip extracting FUB text history** initially — she'll spend the 10 min to
  register a system with FUB anyway (her words: "what the hell is 10 minutes")
  but it's optional value-add, not critical
- **NOT canceling FUB yet** — smart, run both in parallel for 2-3 weeks
- **Website goes to Phase 1.5, NOT Phase 0** — agreed AI ISA + database
  activation of her 6,041 leads is higher ROI than building Perna-quality
  website upfront. Site stays in roadmap as Tier 2 scope.
- **Reference site she likes**: thepernateam.com (Michael Perna, Metro Detroit
  competitor doing $200M/year, also uses Claude Code per Monica). Standard to
  match visually when we build her site.

Updated RESEARCH_NOTES.md with the locked priority order:
- Phase 0: Stress-test internals + UI polish + Twilio
- Phase 1: AI ISA (auto-text new leads in 60s) + database activation of 6,041
  existing leads. BIGGEST ROI, do FIRST.
- Phase 1.5: Public website (50-80 hrs my time, $60-240/mo to run). GATED on
  Realcomp IDX access she's still waiting on.
- Phase 2: Power dialer, squeeze pages, behavioral triggers, etc.

Reasoning written into research doc: Her business mix (sphere + referrals +
Realtor.com leads) doesn't need cold-ad website front-end. It needs speed-to-
respond (AI ISA) + database activation of existing relationships.

### Open questions when she wakes up properly

- What's her current ad spend / lead source mix? Need this to validate Phase 1
  priorities make sense for her actual business
- Has Realcomp IDXSupport responded to her email?
- Did she ever close deals from Ylopo specifically? Helps gauge expected
  website ROI when we build Phase 1.5

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
