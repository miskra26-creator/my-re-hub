# Claude — Project Instructions for my-re-hub

This file is read by Claude Code when this project is opened. Monica works on
this codebase from **two machines** (laptop + office desktop) and switches
between them frequently. You need to coordinate via the shared session log.

## CRITICAL — Session lifecycle (do this every time)

### At the START of every session:

1. **Pull the latest code first:**
   ```
   npm run sync
   ```
   (Equivalent to `git pull --rebase && npm install` — gets whatever the other
   machine's Claude pushed plus any new dependencies.)

2. **Read `CLAUDE_NOTES.md`** in this repo root. That file has:
   - What was last worked on
   - What's currently in-flight (mid-implementation)
   - What's queued for next
   - Any gotchas / context the other machine's Claude left behind

   Treat `CLAUDE_NOTES.md` as the source of truth for project state. It always
   reflects what the OTHER machine's Claude did most recently. If Monica says
   "back to work" without specifics, use `CLAUDE_NOTES.md` to figure out where
   to pick up.

### DURING the session:
- Work normally.
- If you make significant changes (new feature, refactor, bug fix), keep a
  rolling list of what you did so you can summarize it at the end.

### At the END of the session (or when Monica says "save" / "I'm switching machines"):

1. **Update `CLAUDE_NOTES.md`** with:
   - Date + machine you worked on (laptop vs desktop)
   - What you accomplished this session (concise bullets)
   - What's in-flight if anything stopped mid-stream
   - Updated queued list
   - Any new gotchas the other Claude should know about

2. **Commit + push everything:**
   ```
   npm run save
   ```
   (Equivalent to `git add -A && git commit && git push`. The auto-sync script
   on the laptop also runs this every 5 min, but explicit `npm run save` is
   safer when stepping away.)

3. Tell Monica it's saved + safe to switch machines.

## Stack & infrastructure (don't re-discover these every session)

- **App**: React (CRA + craco) frontend in `src/`. Express backend in `server.js`
  (local) + Vercel serverless in `api/` (prod).
- **Live URL**: `https://my-re-hub.vercel.app` — Vercel auto-deploys every push to `main`.
- **GitHub repo**: `https://github.com/miskra26-creator/my-re-hub`
- **Data storage**: `src/cloudHooks.js` exports `useLS` + `useIDB` — local-first
  with Supabase sync when signed in. Same API as before, drop-in.
- **Cloud DB**: Supabase project at `https://hastxrejqacppfgdldrm.supabase.co`.
  Schema: single `user_data` table (id, user_id, key, value jsonb, updated_at).
  RLS enforces per-user isolation. Schema is in `supabase-setup.sql`.
- **Secrets** in `.env.local` (gitignored — recreate on each machine if missing):
  - `FUB_API_KEY`, `REACT_APP_FUB_API_KEY` — Follow Up Boss
  - `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY` — Supabase
  - `ANTHROPIC_API_KEY` (optional, for AI features)
  - `ELEVENLABS_API_KEY` (optional, for AI voice)
- **Vercel env vars**: same as `.env.local` minus the dev-only ones. Set via
  `vercel env ls production` to verify. Vercel deploys from GitHub `main` branch.

## The north star — what she is actually building (stated 2026-09-01)

She asked, explicitly, that this be remembered. Read it before proposing work.

**The goal, in her words: lead generation, lead conversion, scrubbing,
automation.** Not a CRM that stores things. A machine that finds leads, weeds
out the junk, talks to the real ones, and moves them toward a closing — while
she is doing something else.

What "agents" means to her, concretely:
- Reply to her **Facebook posts and comments** automatically
- **Generate conversation** with a lead, not just fire a canned drip
- **Trigger words** — react to what a lead actually says
- **Scrub** incoming leads so she only spends time on real ones

Her reference product is **Ylopo** — she has used its AI tools and that is the
bar she is measuring against. When she describes something vaguely, Ylopo's
feature set is usually the thing to reason from.

**Sequencing, which she set herself and is right about:** foundation first, then
agents. Her estimate is agents are "a week or two out." Do not jump ahead. On
2026-09-01 she said, unprompted: *"nothing's actually working in here... I
haven't clicked on, like, any of the tabs."* Her nav had **50 items** at that
point, most never validated with her. The agreed next step is a **walkthrough**
where she says one of four words per tab — **keep / kill / broken / costs
money** — and broken things get fixed on the spot before moving on. Finish that
before building anything new.

**Two architecture facts worth keeping straight:**
- Lead *response speed* does not need cron. Vercel's free plan allows only one
  scheduled run per day, but the lead webhooks fire instantly on POST. The
  5-minute rule is achievable free because it is event-driven.
- Unattended *anything* needs the server-side pattern built on 2026-09-01:
  `api/_lib/mailer.js` + `api/_lib/serverData.js` + an arming env var + a
  per-action log so retries can't double-fire. Every future agent is that
  skeleton with different judgment in the middle. Reuse it.

## How to work with Monica (read this — it is not optional)

This section exists because Claude's own memory is **per-machine**. Anything
worth remembering about Monica has to live HERE, in the repo, or the other
machine's Claude will not know it. If you learn something durable about how she
wants to work, add it to this section and push.

- **Say "this can't be done for free" in the FIRST message.** Binding rule. On
  2026-05-21 Claude burned 5+ hours iterating AutoReel trying to match
  AutoReel.app quality with free open-source video models. It was never
  achievable. She lost an entire evening and asked for this promise explicitly.
  Lead with the constraint, then give honest options with real prices. Same
  applies to being wrong: correct it immediately and plainly.
- **She has declined these. Do not re-pitch them:** Supabase Pro ($25/mo),
  a paid `ANTHROPIC_API_KEY`, Pika ($8/mo). Solve it the free way or say it
  can't be solved. Free Gemini is the only AI backend — its rate limits are a
  hard reality, not a bug to engineer around.
- **The business priority is the lead engine**, not video polish. The concrete
  target is replicating Reminder Media's ~$500/mo Facebook-ad service herself
  (Metro Detroit, I-275 corridor, $350K+). Ad Composer shipped; Meta Ads API
  is the next real step.
- **Show her ONE thing at a time and make her confirm it works** before moving
  on. A long list of shipped features reads as noise to her — she has said the
  platform "doesn't work" mainly because most of it was never walked through
  with her. Validate, then advance.
- **Don't leave her with homework.** If it can be done from the terminal, do it.

## Working principles for this project

- **Monica is NOT a developer.** Don't ask her to run terminal commands unless
  you must. Don't make her debug. When you can do something for her with
  Bash/edits, just do it.
- **Solo-user CRM ambition.** The goal is to replace Follow Up Boss ($69/mo).
  Prioritize features that move toward that — lead capture, drip campaigns,
  pipeline, tasks, reliability across devices.
- **Don't break what works.** If you touch `cloudHooks.js`, `App.js`, or
  `supabase.js`, test thoroughly. These power everything.
- **Keep the auto-sync working.** The git config is `Monica Iskra <monica@teamiskrasells.com>`
  globally. If commits start failing again, check `git config --global --list`.

## Two-machine workflow gotchas (lessons learned the hard way)

- **Don't run both Claudes simultaneously** on the same codebase. They'll
  fight over the same files and you get merge headaches. One brain at a time.
- **`.env.local` does NOT sync** (gitignored). Each machine has its own copy.
  If a new env var is added, update both `.env.local` files AND Vercel env vars.
- **Memory across Claudes**: each Claude has local memory at `~/.claude/`. That
  doesn't sync between machines. `CLAUDE_NOTES.md` (in this repo) is the
  manually-maintained bridge. Keep it current.
- **Vercel auto-deploys** within ~2 min of any push to `main`. So a `npm run save`
  on one machine puts the new code on the live URL automatically — you don't
  need to redeploy manually.
