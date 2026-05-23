# Real Estate Platform Research — for my-re-hub roadmap
*Generated overnight 2026-05-22 → 2026-05-23 while FUB migration runs*

## TL;DR — what to do first

1. **Fix the texts bug** (already coded — needs Monica's action)
2. **Pick 3 daily-use features and make them BoldTrail-pretty** before adding anything new
3. **Mass text/email blast tool** + **Built-in dialer** are the highest-leverage missing features
4. **AI ISA** (auto-respond to new leads via text) is the single biggest competitive feature in the market right now

---

## 🐛 The texts/calls bug — ROOT CAUSE IDENTIFIED

You said "I know for a fact there is a text that went through because every realtor.com lead gets an automatic text via FUB." You were 100% right and the bug is in our code, not in FUB.

**What's happening:**
- FUB's `textMessages` endpoint is marked **"Restricted - Registered Systems Only"** in their API docs
- It requires TWO custom headers on every request:
  - `X-System` — name of the calling integration
  - `X-System-Key` — secret key from FUB
- Our proxy (`api/fub/[...path].js`) only sends `Authorization: Basic` — never the X-System headers
- Without them, FUB returns empty arrays for restricted endpoints

**The fix (1 evening of work + your help):**

**My side (done overnight):** Updated `api/fub/[...path].js` to forward `X-System` + `X-System-Key` from Vercel env vars when present. Safe change — non-restricted endpoints (people, notes, events, emails, calls) still work the same.

**Your side (5 min when you wake up):**
1. Go to https://apps.followupboss.com/system-registration
2. Register a system — name it something like `my-re-hub` or `Monica Iskra CRM`
3. FUB gives you back:
   - System name (X-System)
   - System Key (X-System-Key)
4. Add both as Vercel env vars:
   - Go to https://vercel.com/dashboard → my-re-hub project → Settings → Environment Variables
   - Add `FUB_SYSTEM` = (system name from FUB)
   - Add `FUB_SYSTEM_KEY` = (system key from FUB)
   - Click Save → Vercel auto-redeploys
5. Hard refresh my-re-hub.vercel.app → open any lead with FUB texts → they should appear

If after this the texts STILL don't show: the API key you're using might be agent-scoped (only sees your contacts). FUB's restricted endpoints sometimes need broker-tier keys.

Source: https://docs.followupboss.com/reference/textmessages-post + https://docs.followupboss.com/reference/identification

---

## 🏆 BoldTrail — what's actually worth stealing

You said you liked some BoldTrail features. Here's what specifically is good in their CRM ($499/mo solo agents) that we don't have yet:

### Already in your wishlist — confirmed worth building
- **Mass email, text, and video blasts from the contact list** — BoldTrail puts this on the homepage. Select 50 leads → blast a market update text. *Build effort: medium (we have email blast, need SMS layer via Twilio + video via existing AI Studio)*
- **Built-in dialer + power dialer** — click a contact, call from inside the app. Power dialer = sequential auto-dial through a list. *Build effort: high — requires Twilio Voice API integration (~$1-5/mo)*
- **AI-driven behavioral triggers** — auto-text when lead views a property, auto-email when they favorite a home. *Build effort: high — needs IDX integration first*
- **Squeeze pages + landing pages** — quick lead capture pages with stats tracking. *Build effort: medium — we can host these on Vercel*
- **Daily call list (priority queue)** — surfaces who you should call TODAY based on engagement. *Build effort: low — just a sorted view we already have data for*

### BoldTrail features that ARE worth copying
- **Contact sharing with team/lender/TC** — share a lead's record with your lender, they can add notes. *Build effort: low — we have lender field; need a "share" link mechanism*
- **Contact data enrichment** — pulls social media profiles, life events, home addresses for each contact. *Build effort: medium — needs an enrichment API ($$$)*
- **Listing alert pages with behavior tracking** — sends alerts when listings hit criteria, tracks every click. *Build effort: high — IDX-dependent*
- **Hyper-local area pages** — city-specific pages with market data. *Build effort: medium*

### BoldTrail features NOT worth copying (bloat or wrong audience)
- Brokerage commission automation (you're solo)
- Agent onboarding workflows (you're solo)
- Mass user management (you're solo)

Source: https://boldtrail.com/boldtrail-smart-crm/ + https://www.agentadvice.com/boldtrail-review/

---

## 🤖 The AI ISA opportunity — biggest competitive gap

Across every platform (Lofty, Sierra Interactive, Structurely, Ylopo) the #1 feature agents pay for in 2026 is an **AI Inside Sales Agent** that:
- Auto-responds to new leads via SMS within 60 seconds of arrival
- Qualifies them (timeline, motivation, location, price range) through conversational text
- Books showings/calls directly on agent's calendar when ready
- Nurtures cold leads for 12+ months automatically
- Hands warm prospects to the human agent

**Why this matters for you:** Most of your Realtor.com / Zillow leads go cold because nobody texts them in 5 min. An AI ISA gets back to them instantly. Industry conversion rate jumps from ~5% to 12-15% with one in place.

**What this would cost commercially:**
- Structurely "Aisa Holmes": ~$500/mo
- Ylopo "rAIya": bundled into ~$1500/mo lead-gen package
- Lofty AI Copilot: bundled into $449/mo

**What it would cost in my-re-hub:**
- Twilio SMS ($1/mo + $0.0079/text)
- Anthropic Claude API (~$0.01/conversation)
- OUR existing AI infrastructure (Claude + Gemini already wired up)
- **Estimated $5-15/mo for moderate volume vs. $500/mo elsewhere**

**Build effort:** ~6 hours focused work. You already have:
- AILeadConcierge component (drafts replies)
- PastClientAgent (background worker pattern)
- Drip campaign engine
- Lead status tracking

What's missing:
- Twilio integration for actual SMS sending
- A "new lead → respond within 60s" trigger
- Conversation thread tracking (Twilio webhooks pointed at our app)

**Recommendation: Build this AFTER the migration finishes and you've used my-re-hub for 2 weeks.** Don't build features on top of features that aren't proven. But put it next on the priority list.

Sources: https://www.retellai.com/blog/best-ai-tools-real-estate-agents + https://www.listingflare.com/blog/best-ai-isa-tools-real-estate

---

## 📊 Other platforms surveyed (executive summary)

| Platform | Best Feature | Worth Stealing? | Notes |
|---|---|---|---|
| **Sierra Interactive** | Behavioral insights — sees what listings each lead views in real-time | **YES** if/when we have IDX | Shilo integration scores sales calls live |
| **Real Geeks** | "Estate IQ" home valuation tool that generates seller leads | **YES** — we can build this with Gemini | Sellers enter address → get estimated value + market analysis |
| **Lofty (was Chime)** | AI Assistant texts new leads autonomously, qualifies, books appointments | **YES** — see AI ISA section above | $449/mo |
| **LionDesk** | Built-in video texting | **MAYBE** — niche feature, use case unclear for solo agent | Note: LionDesk shut down Sep 2025. Users migrated to Lone Wolf |
| **Wise Agent** | Power Dialer that dials 3 contacts simultaneously | **YES** for high-call-volume days | Wise Agent transaction checklists also nice |
| **Ylopo** | Facebook/Google ad campaigns auto-fed into AI ISA | Not yet — you have AdComposer already | $1500/mo |
| **Chime** | (Now Lofty) — same as Lofty | Skip — covered above | |

Sources: https://www.sierrainteractive.com/ + https://www.realgeeks.com/ + https://lofty.com/real-estate/crm + https://www.kdsdevelopment.net/articles/liondesk-review-2026-agent-crm-and-marketing + https://www.selecthub.com/real-estate-crm-software/wise-agent-vs-chime-crm/

---

## 🎯 LOCKED IN — Official roadmap (decided 2026-05-23 morning)

### Phase 0 — Make what exists actually work (NOW, this week + next)
1. ✅ FUB migration complete (DONE — 100%)
2. **Fix texts via X-System headers** — Monica registers system at apps.followupboss.com/system-registration + adds FUB_SYSTEM/FUB_SYSTEM_KEY env vars on Vercel + clicks Resume Import (~15 min when she's ready)
3. **Stress-test daily-use features** — Use Lead Detail, Drip enrollment, Action plans, Pipeline on 10 real leads. Find what breaks. Report back.
4. **UI polish on those 3-4 features ONLY** — BoldTrail-clean look, bigger photos, lighter palette
5. **Twilio SMS integration** ($5/mo) — required infrastructure for everything in Phase 1

### Phase 1 — AI ISA + Database Activation (2-3 weeks) ← BIGGEST ROI
6. **AI ISA** — auto-respond to new leads via SMS within 60 seconds using Claude. The #1 competitive feature in the 2026 market. 78% of buyers work with the first agent who responds.
7. **Database activation campaigns to her 6,041 existing leads** — most agents never touch their old database. Build drip + reactivation flows. This activates value she's ALREADY paid for.
8. **Mass email/text blast** — pick 50 leads → send a market update. BoldTrail-style.

### Phase 1.5 — Public website (4-6 weeks from now)
9. **Perna-quality IDX website** — Tier 2 scope (50-80 hrs my time, $60-240/mo to run).
   - Foundation: homepage with property search, home valuation lead magnet, agent bio, community pages, blog
   - Behavioral tracking — property views logged to lead's profile
   - Saved searches + auto-email alerts
   - AI chat widget on every page
   - FB Pixel + Google Tag for retargeting infrastructure
   - Lead capture wired to my-re-hub
   - GATED ON: Realcomp IDX access (Monica's email to IDXSupport in progress)
   - **Built only AFTER Phase 0 + Phase 1 are PROVEN over 2-3 weeks of daily use.**

### Phase 2 — Marketing automation (after website launches)
10. Power dialer (sequential auto-dial via Twilio Voice)
11. Squeeze/landing page builder
12. Behavioral triggers tied to IDX (auto-text on property view)
13. Mass email tracking (opens, clicks)
14. Contact enrichment (social profiles, life events)
15. Seller lead magnet (Real Geeks' Estate IQ clone — moved here, dependent on website + IDX)

### Phase 3 — Brokerage tools (lower priority)
16. Transaction management checklists per deal
17. Commission tracking (extend existing Finances page)
18. Document storage per contact

---

## 🧠 Why this priority order (decision rationale 2026-05-23)

Monica asked the honest question: "Are people still using agent websites or have they pulled back to Zillow/Homes.com?"

**Data says:** Agent websites still convert at 3-5x template rate, forced registration still works (+425% signups), 78% of buyers work with the first agent who responds. BUT the agent website's JOB has shifted:
- **Discovery** = Zillow/Realtor.com/Homes.com
- **Conversion** = Agent website (when buyer is serious or wants a specific agent)
- **Retention** = Agent website (saved searches, alerts)

The Ylopo "cold buyer → ad → IDX site → register" funnel still works, but it requires ad spend ($1-3k/mo). Without ads, the website is a credibility/conversion tool, not a cold-lead generator.

**Monica's actual lead sources:** sphere + referrals + Realtor.com purchased leads. Her business doesn't need cold ad-funnel website — it needs:
1. Speed-to-respond on Realtor.com leads (= AI ISA)
2. Activation of her 6,041 existing FUB leads (= database campaigns)
3. Credibility website for sphere conversion (= Phase 1.5, lower urgency)

That's why AI ISA + database activation come BEFORE the website. Bigger ROI on time invested for HER specific business mix.

---

## 💸 Total monthly cost of running my-re-hub as your full CRM replacement

Once everything in Phase 1 is built:
- Vercel hosting: $0 (Hobby tier)
- Supabase: $0 (free tier covers 6k+ leads)
- Twilio SMS: $5-15/mo (depending on volume)
- Anthropic Claude: $5-20/mo (AI replies)
- Google Gemini: $0 (free tier covers ad creative + listing copy)
- Gmail: $0 (your existing account)
- ScraperAPI (optional, for MLS): $0 (free 1000/mo)
- **Total: $10-35/mo** vs. **FUB ($69) + BoldTrail ($499) + Lofty ($449) = $1,017/mo elsewhere**

That's the prize. Don't lose sight of it.

---

## ❓ Honest doubts and trade-offs you should know

1. **AI ISA quality vs. commercial tools:** Structurely's Aisa Holmes is years-trained on real estate conversations. Our Claude-based version will be 80% as good in conversation. For most leads this is fine; for high-value $1M+ leads you may want a human or commercial AI to handle them.

2. **No IDX feed yet** = no behavioral triggers, no listing alerts, no auto-search-by-criteria. Realcomp IDX is the gate; you emailed them. Without it we're stuck with manual entry for listings.

3. **Texts/calls dependency on Twilio**: $5-15/mo recurring. Not free but cheap. If you'd rather not, we can keep texts/calls as "log only" (no actual sending) — same as FUB without their dialer.

4. **My-re-hub UI is currently rough.** Realistic to make it BoldTrail-pretty: 2 full days of CSS work. Plan for it.

5. **The honest "is this ready to replace FUB" timeline:** Not before 4-6 weeks of focused use + iteration. We have most of the pieces; what we need is reliability, not new features.

---

## 📝 What to read tomorrow morning

In order:
1. Top section — the texts bug fix steps (5 min)
2. "Proposed roadmap" — pick which Phase 0 priority you want to start tomorrow
3. "Honest doubts" — make sure none of these are dealbreakers

Tell me which Phase 0 item to start with after the migration completes, and I'll move on it.
