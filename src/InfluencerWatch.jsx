// InfluencerWatch.jsx — Track top real estate creators for content inspiration.
//
// 3 tiers:
//   1. Curated Influencer Directory — 20+ documented viral creators with
//      one-click "Open in [platform]" links. No API needed.
//   2. YouTube Auto-Tracker — pulls recent videos from selected channels via
//      YouTube Data API v3. Free tier, 10K queries/day. Requires user's own
//      Google Cloud API key (stored in localStorage `youtube_api_key`).
//   3. Manual Inspiration Capture — paste a URL or describe a post you saw,
//      AI analyzes hook + format and adapts for Monica's market.
//
// Why no IG/TikTok auto-track: Meta Graph API only reads YOUR connected
// account; TikTok Research API requires academic credentials. Paid services
// (RivalIQ, Phlanx ~$50-100/mo) are the only general-monitoring path.

import React, { useState, useEffect, useCallback } from 'react';
import { useLS } from './cloudHooks';
import {
  Users, ExternalLink, Eye, Heart, Copy, Sparkles, RefreshCw, X,
  Search, Bookmark,
} from 'lucide-react';

// ── READY-TO-FILM TEMPLATES — Monica's dummy-proof plug-and-play library ────
// 15 complete Metro Detroit-specific posts. Each has: hook, full caption,
// shot list (literally what to film), hashtags, best posting time, and the
// creator style it copies. Just pick one and post — zero thinking required.
const READY_TO_FILM_TEMPLATES = [
  {
    id: 't1', inspiredBy: 'Glennda Baker', style: 'storytelling',
    platform: 'Instagram Reel', effort: '15min', bestTime: 'Tue/Thu 7-9pm EST',
    title: 'The "I saved my buyer $X" story',
    hook: '"I saved my Birmingham buyer $47,000 in 48 hours. Here\'s how."',
    caption: `I saved my Birmingham buyer $47,000 in 48 hours. Here's how 👇\n\nThey were ready to offer FULL ASKING on a Bloomfield Hills home they loved.\n\nBefore they did, I ran the numbers:\n• Days on market: 92\n• Two price drops already\n• Sewer scope needed (older home)\n• HVAC end-of-life\n\nI told them: offer $47K below ask + ask seller to credit inspection items.\n\nSeller countered $35K below. We took it.\n\nMy clients walked into the home of their dreams under budget — with money set aside for renovations.\n\nThis is what an agent who actually represents YOU looks like.\n\nNeed someone in your corner? My DMs are open.`,
    hashtags: ['#BirminghamMI', '#MetroDetroitRealEstate', '#BuyerAgent', '#NegotiationWin', '#MichiganRealtor'],
    shotList: [
      'OPEN: Talking head, sitting in car or at desk. Direct eye contact.',
      'Hold up phone/screenshot of original asking price vs. final price.',
      'Cut to drone exterior of the home (if you have permission to show)',
      'Back to talking head for the lesson + CTA',
    ],
    visual: 'Casual professional, soft natural light, captions on screen',
  },
  {
    id: 't2', inspiredBy: 'Madison Sutton', style: 'price-comparison',
    platform: 'Instagram Reel', effort: '20min', bestTime: 'Wed/Sat 12-2pm EST',
    title: '"What $500K gets you in [city A] vs [city B]"',
    hook: '"What $500,000 buys you in Birmingham vs Royal Oak"',
    caption: `What $500K gets you in Birmingham vs Royal Oak 👀\n\n📍 BIRMINGHAM ($500K)\n• 3 bed | 2 bath | 1,400 sqft\n• 1950s colonial\n• 0.18 acres\n• Walk to downtown ☑️\n\n📍 ROYAL OAK ($500K)\n• 4 bed | 3 bath | 2,100 sqft\n• 1980s ranch\n• 0.32 acres\n• Walk to downtown ☑️\n\nSame budget. Wildly different homes.\n\nWhich would YOU pick? Drop a 🏛️ for Birmingham or 🎨 for Royal Oak in the comments.`,
    hashtags: ['#BirminghamMI', '#RoyalOakMI', '#MetroDetroitHomes', '#HomeBuying', '#MichiganRealEstate'],
    shotList: [
      'OPEN: Split screen of both homes (use 2 photos from MLS — get listing agent permission)',
      'Quick zoom on each property — 3 seconds each',
      'On-screen text overlays with the price + stats',
      'CLOSE: Talking head with the question',
    ],
    visual: 'Side-by-side split screen, on-screen price labels, upbeat music',
  },
  {
    id: 't3', inspiredBy: 'Ryan Serhant', style: 'wow-feature-tour',
    platform: 'TikTok', effort: '30min', bestTime: 'Mon/Fri 6-9pm EST',
    title: 'Lead with the wildest feature, reveal price at end',
    hook: '"This Bloomfield Hills home has a HEATED outdoor walkway to the pool. Wait for the price."',
    caption: `When the homeowner says "comfort over everything." 🥶☀️\n\nThis Bloomfield Hills luxury home:\n✨ Heated outdoor walkway to the pool (yes, in Michigan winters)\n✨ Saltwater pool with underwater speakers\n✨ Outdoor kitchen with pizza oven\n✨ Wine cellar fits 800 bottles\n✨ 6-car heated garage\n\nGuess the asking price before you swipe through the listing 👇\n\nDM "TOUR" for the full walk-through video.`,
    hashtags: ['#BloomfieldHills', '#LuxuryRealEstate', '#MetroDetroitLuxury', '#LuxuryHomeTour', '#MichiganLuxury'],
    shotList: [
      'OPEN: Tight shot of the WILDEST feature (heated walkway, wine cellar, etc.) — 2 sec',
      'Quick gimbal tour: feature → another feature → another (5-7 sec each)',
      'Drone exterior reveal of the property',
      'Big text card with the price at the very end',
    ],
    visual: 'Gimbal/Osmo Pocket for smooth motion, drone for exterior, music swells at price reveal',
  },
  {
    id: 't4', inspiredBy: 'Loida Velasquez', style: 'day-in-life-prospecting',
    platform: 'Instagram Reel', effort: '2hrs', bestTime: 'Sun 7-9pm EST',
    title: 'A day in the life of a Metro Detroit luxury agent',
    hook: '"6am to 9pm: a real day as a Metro Detroit luxury agent"',
    caption: `Asked what a "normal" day looks like 👇\n\n☕ 6am — Coffee + email triage in Birmingham\n🚗 8am — Drive Bloomfield → preview new listing on the market\n📞 10am — Listing presentation in Novi (got the contract ✍️)\n🥗 12pm — Quick lunch + tour 2 homes for relocation buyers\n📋 2pm — Inspection meeting at a Pending in Northville\n🏡 4pm — Showing at a $1.2M West Bloomfield home\n🎉 6pm — Closing for past clients (their first home!)\n🍷 8pm — Glass of wine + planning tomorrow\n\nThis job is wild. And I love every minute.`,
    hashtags: ['#DayInTheLife', '#MichiganRealtor', '#MetroDetroitLuxury', '#WomenInRealEstate', '#RealtorLife'],
    shotList: [
      'OPEN: 6am coffee shot, soft morning light',
      'Quick clips throughout the day: driving, in homes, with clients (face away/blurred for privacy)',
      'Time-stamp text overlays on each clip',
      'CLOSE: Glass of wine + handwritten planner shot',
    ],
    visual: 'Multiple short clips, time-of-day text overlays, golden hour shots, upbeat music',
  },
  {
    id: 't5', inspiredBy: 'Tom Ferry', style: 'educational-questions',
    platform: 'Instagram Reel', effort: '15min', bestTime: 'Tue/Thu 8-10am EST',
    title: '5 questions to ask before hiring a luxury listing agent',
    hook: '"5 questions to ask BEFORE hiring a luxury listing agent in Metro Detroit"',
    caption: `Most sellers hire the first agent they meet. Don't.\n\nAsk these 5 questions instead:\n\n1️⃣ "How many homes did you sell in MY ZIP code last year?"\n→ Need actual numbers, not "lots"\n\n2️⃣ "What's your average days-on-market vs the MLS average?"\n→ Should beat the average by 30%+\n\n3️⃣ "Can I see your last 5 listings' marketing photos?"\n→ Quality predicts your home's outcome\n\n4️⃣ "What's your marketing budget for MY listing?"\n→ Twilight photos? Drone? Print? Social ads?\n\n5️⃣ "How will you negotiate against my buyer's agent?"\n→ Most agents fold under pressure\n\nIf they can't answer all 5 confidently — keep looking.\n\nSave this 📌 for when you're ready to sell.`,
    hashtags: ['#HomeSellingTips', '#ListingAgent', '#MetroDetroitRealEstate', '#MichiganHomeSelling', '#LuxuryRealEstate'],
    shotList: [
      'OPEN: Direct-to-camera talking head, clean professional background',
      'Each question = 5-7 sec clip, big text overlay with the question number',
      'CLOSE: Direct CTA "Save this for later"',
    ],
    visual: 'Talking head with bold text overlays for each question, calm music',
  },
  {
    id: 't6', inspiredBy: 'Hina Khan', style: 'shock-comparison',
    platform: 'TikTok', effort: '20min', bestTime: 'Wed/Sun 6-9pm EST',
    title: '"What $1M buys you in Metro Detroit vs Manhattan"',
    hook: '"What $1 MILLION buys you in Bloomfield Hills vs Manhattan"',
    caption: `Coastal buyers — wake up call 👇\n\n📍 MANHATTAN ($1M)\n• 600 sqft studio apartment\n• 1 bedroom (technically)\n• HOA $2,000/mo on top\n• View of the building next door\n\n📍 BLOOMFIELD HILLS ($1M)\n• 4,200 sqft luxury home\n• 4 beds | 3.5 baths\n• 0.8 acres of land\n• Pool, 3-car garage, top schools\n\nThis is why Metro Detroit relocation is HOT right now.\n\nWant the relocation guide? DM "MOVE" 📩`,
    hashtags: ['#MetroDetroit', '#RelocateToMichigan', '#BloomfieldHills', '#NYCvsDetroit', '#LuxuryRealEstate'],
    shotList: [
      'OPEN: Phone-shot of skyscrapers (NYC) — could be stock footage',
      'Split-screen with Bloomfield Hills home aerial',
      'Bullet-point text overlays for the comparison',
      'CLOSE: "Move home." + agent talking head CTA',
    ],
    visual: 'Split-screen contrast, dramatic music, on-screen stats',
  },
  {
    id: 't7', inspiredBy: 'Dean Adler', style: 'tease-the-wow',
    platform: 'YouTube Short', effort: '30min', bestTime: 'Fri 5-8pm EST',
    title: 'Inside a luxury home — wait until you see the closet',
    hook: '"Inside this $1.4M Birmingham home. Wait until you see the primary closet."',
    caption: `New listing in Birmingham — and YOU need to see this closet.\n\n5 beds | 4.5 baths | 4,800 sqft | $1.4M\n\nHighlights:\n✨ Updated kitchen w/ Wolf appliances\n✨ Heated 3-car garage\n✨ Walk-in primary closet bigger than most NYC apartments (you'll see)\n✨ Wine cellar in basement\n✨ Walk to downtown Birmingham\n\nShowings start Friday. DM for the link.`,
    hashtags: ['#BirminghamMI', '#LuxuryRealEstate', '#NewListing', '#WalkInCloset', '#MetroDetroitHomes'],
    shotList: [
      'OPEN: Front door shot, tease "wait until you see..." text',
      'Quick tour through ordinary rooms (kitchen, living, etc.) — 3 sec each',
      'Build anticipation toward the closet',
      'BIG REVEAL: slow gimbal pull-back as you walk into the closet',
      'CLOSE: Talking head with showings info',
    ],
    visual: 'Gimbal smooth movements, music builds to closet reveal, golden hour through windows',
  },
  {
    id: 't8', inspiredBy: 'Tatiana Londono', style: 'bold-opinion',
    platform: 'Instagram Reel', effort: '15min', bestTime: 'Mon/Thu 7-10am EST',
    title: 'Controversial take about Metro Detroit pricing',
    hook: '"Most Birmingham agents UNDERPRICE older homes by $50K. Here\'s why."',
    caption: `Hot take that's about to get me hate mail 🙃\n\nMost Birmingham agents underprice older Birmingham homes by $30-50K.\n\nWhy:\n\n❌ They use Zestimate (which can't see hidden value)\n❌ They look only at recent SOLDS (not active comps trending up)\n❌ They don't price for the BUYER POOL\n❌ They're scared sellers will fire them if home doesn't sell in 7 days\n\nThe truth:\nBirmingham buyers have $$$$. They'll PAY for the right home. Pricing $35K higher and getting 11 offers vs pricing safe and getting 1 — happens every week.\n\nIf you're selling in Birmingham this spring — get a SECOND opinion before you list.\n\nMy DMs are open. Free consult, no pressure.`,
    hashtags: ['#BirminghamMI', '#HomeSelling', '#ListingAgent', '#MichiganRealEstate', '#MetroDetroitLuxury'],
    shotList: [
      'OPEN: Direct eye contact, serious tone, controversial hook',
      'Talking head with text overlay showing the 4 reasons',
      'Close with strong CTA and confident smile',
    ],
    visual: 'Direct-to-camera, intense lighting, bold text overlays, serious tone',
  },
  {
    id: 't9', inspiredBy: 'Brittany Loeffler', style: 'lifestyle-aspiration',
    platform: 'Instagram Reel', effort: '30min', bestTime: 'Sat 11am-2pm EST',
    title: 'Aesthetic POV: luxury agent in Metro Detroit',
    hook: '"POV: you wake up as a Metro Detroit luxury agent"',
    caption: `Romanticizing the grind 💫\n\nThere's something special about pouring coffee at 6am, knowing you get to help people find their forever home today.\n\nThe early calls.\nThe drives through Birmingham at sunrise.\nThe excited "we got it!" texts from clients.\n\nThis isn't just a job. It's a craft.\n\nGrateful every day. 🙏\n\n📍 Metro Detroit luxury real estate`,
    hashtags: ['#LuxuryAgent', '#MichiganRealtor', '#WomenInRealEstate', '#MetroDetroit', '#RealEstateLifestyle'],
    shotList: [
      'OPEN: Coffee being poured slow-mo, soft morning light',
      'Aesthetic shots: planner open, keys on counter, well-dressed agent walking out',
      'Driving shot through Birmingham',
      'Quick clip in front of a beautiful home',
      'CLOSE: Smiling at camera with text overlay',
    ],
    visual: 'Cinematic, soft natural light, slow movements, dreamy music',
  },
  {
    id: 't10', inspiredBy: 'Ricky Carruth', style: 'free-value-giveaway',
    platform: 'Instagram Carousel', effort: '25min', bestTime: 'Wed 10am-12pm EST',
    title: 'Free seller prep checklist (carousel)',
    hook: '"Free: my seller prep checklist (the same one I give $1M+ clients)"',
    caption: `Selling your home in Metro Detroit?\n\nI'm giving you the same prep checklist I use with my $1M+ clients. Free. No catch.\n\nSwipe through ➡️\n\nSlide 1: 8 weeks out — declutter list\nSlide 2: 4 weeks out — pre-listing inspection\nSlide 3: 2 weeks out — staging refresh\nSlide 4: 1 week out — final touches\nSlide 5: Showing day — must-do list\nSlide 6: After offer — 11-day checklist\n\nSave this 📌\n\nNeed someone to walk you through it personally? My DMs are open. Free consult, no pressure.`,
    hashtags: ['#HomeSellingTips', '#SellerChecklist', '#MetroDetroitRealEstate', '#MichiganHomeSelling', '#ListingPrep'],
    shotList: [
      '6 slide carousel: simple branded background per slide',
      'Each slide = ONE timeframe with 4-6 checkbox items',
      'Use consistent fonts/colors throughout',
      'Final slide: branded "Save + Share" CTA',
    ],
    visual: 'Canva templates with your brand colors, clean professional look',
  },
  {
    id: 't11', inspiredBy: 'Phil Hawkins', style: 'fast-paced-day-montage',
    platform: 'TikTok', effort: '25min', bestTime: 'Sun 6-9pm EST',
    title: 'Closing 3 deals before noon — speed montage',
    hook: '"Watch me close 3 Metro Detroit deals before noon"',
    caption: `Productivity ≠ stress.\n\nIt's about systems.\n\nThis morning:\n✅ 8am — Closed buyer rep agreement (Birmingham)\n✅ 9:30am — Listing presentation signed (Novi)\n✅ 11am — Multiple offers reviewed + accepted (Bloomfield)\n\nDoesn't happen by accident.\n\nHappens because I have the right systems + the right team + Diet Coke ☕\n\nWhat are you closing today? 💪`,
    hashtags: ['#RealEstateHustle', '#MichiganRealtor', '#MetroDetroitClosings', '#WomenInRealEstate', '#RealtorLife'],
    shotList: [
      'OPEN: Fast clip of you typing/on phone at 7am',
      'Rapid cuts: 8am stamp + handshake clip, 9:30am stamp + presentation clip, 11am stamp + signing clip',
      'Music keeps tempo high — no breaks',
      'CLOSE: Coffee cup on dashboard with smile',
    ],
    visual: 'Time-stamp overlays, jump cuts, upbeat/intense music, no slow moments',
  },
  {
    id: 't12', inspiredBy: 'Jonathan Garbutt', style: 'script-teardown',
    platform: 'TikTok', effort: '15min', bestTime: 'Tue/Fri 8-10am EST',
    title: 'What to say when an agent pressures you',
    hook: '"What to say when an agent pressures you to make an offer"',
    caption: `Save this for your next showing 📌\n\nWhen an agent says:\n"You\'ll lose this home if you don't offer TODAY."\n\nSay this:\n"I appreciate the urgency, but I make decisions based on fit and value — not pressure. If this home is right for me, I'll act. If it's gone, the next one comes."\n\nReal agents respect your timeline.\n\nPressure tactics = look elsewhere.\n\nAlways representing you 💛`,
    hashtags: ['#HomeBuying', '#BuyerTips', '#RealEstateAdvice', '#MichiganRealEstate', '#MetroDetroit'],
    shotList: [
      'Talking head, casual setting (car or living room)',
      'Big text overlay with the EXACT script',
      'Pace matters — slow enough to read, urgent enough to feel important',
      'CLOSE: Strong personal CTA',
    ],
    visual: 'Bold text overlay with the script, calm professional delivery',
  },
  {
    id: 't13', inspiredBy: 'Sarah Knauer', style: 'personal-story',
    platform: 'Instagram Reel', effort: '25min', bestTime: 'Sun 7-9pm EST',
    title: 'Your real estate journey origin story',
    hook: '"Why I left [previous career] to become a Metro Detroit luxury agent"',
    caption: `Honest moment.\n\n[Insert your own story here — replace this part]\n\nThe real estate path isn\'t glamorous. There are no salaries. No vacation days. You eat what you kill.\n\nBut I wouldn\'t trade it for anything.\n\nEvery closing day, when someone gets the keys to a home they\'ll raise their family in — I remember why I do this.\n\nIf you\'re thinking about buying or selling in Metro Detroit, I\'d love to be on your team. 💛`,
    hashtags: ['#MichiganRealtor', '#WomenInRealEstate', '#WhyIDoThis', '#MetroDetroitLuxury', '#RealEstateJourney'],
    shotList: [
      'OPEN: Direct to camera, emotional but composed',
      'B-roll: throwback photos of you + present-day shots',
      'Talking head with personal story (your real one — replace the placeholder)',
      'CLOSE: Genuine smile + heart hand to camera',
    ],
    visual: 'Soft warm lighting, personal photos as B-roll, emotional music',
  },
  {
    id: 't14', inspiredBy: 'Brennan Adams', style: 'investor-numbers',
    platform: 'Instagram Reel', effort: '30min', bestTime: 'Mon/Wed 7-9pm EST',
    title: 'Metro Detroit duplex investment breakdown',
    hook: '"This Ferndale duplex pays its owner $1,800/mo. Here are the numbers."',
    caption: `Real numbers from a real Metro Detroit investment property 👇\n\n📍 Ferndale duplex\n💰 Purchase: $245,000 (Dec 2024)\n🔨 Reno: $18,000 (paint, flooring, kitchens)\n📈 Now appraised: $310,000\n\nMonthly:\n💵 Rent (upper): $1,500\n💵 Rent (lower): $1,400\n💸 Mortgage + tax + insurance: $1,100\n\n✅ Net cash flow: ~$1,800/mo\n\nThat's $21,600/year — PLUS $65K of equity gain in 18 months.\n\nMetro Detroit investing isn't dead. It just requires picking the RIGHT zips. Ferndale, Royal Oak, Hamtramck, parts of Detroit proper.\n\nWant me to find your next deal? DM 📩`,
    hashtags: ['#RealEstateInvesting', '#MetroDetroit', '#FerndaleMI', '#CashFlow', '#DuplexInvestor'],
    shotList: [
      'OPEN: Drone or street-level exterior shot of duplex (use stock if needed)',
      'On-screen text with each number as you say it',
      'B-roll of interior — kitchens, living rooms',
      'CLOSE: Talking head with CTA',
    ],
    visual: 'Numbers on screen at all times, clean P&L style, mix of property + agent shots',
  },
  {
    id: 't15', inspiredBy: 'Mauricio Umansky', style: 'aspirational-listing',
    platform: 'Instagram Reel', effort: '45min', bestTime: 'Fri 5-8pm EST',
    title: 'Premium listing announcement with subtle authority',
    hook: '"Just listed: $2.8M private estate in Bloomfield Hills"',
    caption: `Honored to represent this exclusive Bloomfield Hills estate. ✨\n\n5 bed | 5.5 bath | 6,800 sqft on 1.4 acres\n\nFeatures:\n• Gated entry + circular drive\n• Indoor saltwater pool\n• Home theater for 12\n• Wine cellar (1,200 bottles)\n• Heated 4-car garage\n• Private lake access\n\nFor serious inquiries only. DM to schedule a private showing.\n\n📍 Bloomfield Hills, MI\n📞 [Your phone]`,
    hashtags: ['#BloomfieldHills', '#LuxuryEstate', '#MetroDetroitLuxury', '#NewListing', '#PrivateShowingsOnly'],
    shotList: [
      'OPEN: Drone aerial of the property — wide establishing shot',
      'Cinematic gimbal walkthrough — slow, deliberate',
      'Lingering shots on each premium feature (5-6 sec each)',
      'CLOSE: Address card + your photo + phone number',
    ],
    visual: 'High-production, slow camera moves, classical or soft cinematic music, golden hour exterior',
  },
];

// ── CONTENT ENGINE — Top US RE creators + their viral content formulas ──────
// Monica's actual ask: she wants to see what TOP US agents are posting that's
// going viral, then click "Adapt for Me" to get HER version of that style.
// Not Metro-Detroit-specific captions — national inspiration.
//
// Each entry: real US creator with proven viral content + the formula behind
// why it worked + an adapt-this-for-Monica idea. "Refresh with AI" calls
// Gemini to find currently-trending creators (the seed gets stale every quarter).
const CONTENT_ENGINE_SEED = [
  {
    creator: 'Glennda Baker', handle: '@glennda_baker', platform: 'TikTok', followers: '850K',
    location: 'Atlanta, GA', niche: 'storytelling', effort: '30min', engagement: 'HIGH',
    hook: 'The "$137,000 commission" story', viralViews: '10M+ views',
    contentType: 'Talking-head storytelling reel',
    caption: 'Glennda\'s signature: real client story told with vulnerability, ending with a shocking number ($137K commission) and a soft market lesson. No selling — just teaching through story. Her account exploded in 2024 with this format.',
    hashtags: ['#storyselling', '#atlantarealestate', '#realestateagent', '#commissionstory', '#realtorlife'],
    visual: 'Direct-to-camera, agent at desk or in car. Minimal cuts. Strong eye contact. Captions on screen for accessibility.',
    formula: 'Personal anecdote → real numbers → broader lesson → CTA',
    adaptIdea: 'Tell YOUR biggest "I saved the buyer $X" story. Real numbers, real emotions. Soft lesson about why agent representation matters. Metro Detroit edition.',
  },
  {
    creator: 'Mike Sherrard', handle: '@mikesherrard', platform: 'YouTube Long-form', followers: '700K+',
    location: 'Toronto, ON', niche: 'agent-education', effort: '2hrs', engagement: 'HIGH',
    hook: '"I generated $1M in sales with ZERO ad spend"', viralViews: '500K+ per video',
    contentType: 'Long-form YouTube tutorial / breakdown',
    caption: 'Mike teaches agents how to actually do content marketing. His "no ad spend" content goes viral with other agents because it\'s contrarian + actionable. He doesn\'t target buyers — he targets agents (which converts to coaching $$$).',
    hashtags: ['#realestateeducation', '#agentmarketing', '#contentstrategy', '#realestatecoach'],
    visual: 'Talking-head with B-roll of his actual posts. Whiteboard explanations. Screen recordings of strategies.',
    formula: 'Contrarian claim → proof (real screenshots) → step-by-step breakdown → CTA',
    adaptIdea: 'Make YOUR version targeting buyers/sellers: "How I helped 47 Metro Detroit buyers find homes without a single Zillow lead" — contrarian, real proof, actionable for viewers.',
  },
  {
    creator: 'Ryan Serhant', handle: '@ryanserhant', platform: 'Instagram + TikTok', followers: '2M+',
    location: 'New York, NY', niche: 'luxury-tour', effort: '2hrs', engagement: 'HIGH',
    hook: '"This $50M penthouse has a private elevator to the rooftop pool"', viralViews: '5M+ per tour',
    contentType: 'High-production luxury walkthroughs with personality',
    caption: 'Serhant\'s formula: pick the most absurd feature first ("private elevator to rooftop pool"), tour it with energy, drop the price like a punchline. Million Dollar Listing pedigree gives him distribution, but the FORMAT works for any luxury home.',
    hashtags: ['#luxurytour', '#nyrealestate', '#milliondollarhome', '#luxuryrealestate'],
    visual: 'Professional gimbal, drone exterior, multiple angles. NEVER static. Always moving. Music swells at price reveal.',
    formula: 'Wild feature hook → personality-driven tour → price punchline at end',
    adaptIdea: 'Birmingham/Bloomfield luxury tours with YOUR personality. Find the wildest feature (heated driveway? 6-car garage? wine cellar?) and lead with it. Tour with energy. Price reveal at end.',
  },
  {
    creator: 'Loida Velasquez', handle: '@loidavelasquez', platform: 'YouTube + Instagram', followers: '500K+',
    location: 'Los Angeles, CA', niche: 'agent-education', effort: '45min', engagement: 'HIGH',
    hook: '"How I doored 300 doors and got 7 listings"', viralViews: '300K+ per video',
    contentType: 'Day-in-life door-knocking and prospecting vlogs',
    caption: 'Loida documents the unglamorous reality of prospecting (door knocking, cold calling) and shows the actual results. Hyper-relatable for agents who hate prospecting but need to do it. Her authenticity is the moat.',
    hashtags: ['#realestateprospecting', '#doorknocking', '#newagent', '#realestatehustle'],
    visual: 'Handheld phone POV. Real interactions (even the rude ones). End-of-day reflection at car.',
    formula: 'Set a goal → document the grind → show the result → reflection',
    adaptIdea: 'Document YOUR prospecting day in Bloomfield or Birmingham. Door knock 50 homes. Show real reactions. Share what worked. Authenticity wins.',
  },
  {
    creator: 'Tom Ferry', handle: '@tomferry', platform: 'Instagram + YouTube', followers: '1.5M+',
    location: 'Newport Beach, CA', niche: 'agent-education', effort: '30min', engagement: 'MED',
    hook: '"5 scripts that close listings in 2026"', viralViews: '200K+ per post',
    contentType: 'Script teardowns + role-play demos',
    caption: 'Tom Ferry is the agent coaching empire. His content gives away scripts and tactics agents can use TOMORROW. Generates inbound coaching leads. Best for: stealing his SCRIPT FORMAT for buyer/seller education content.',
    hashtags: ['#realestatecoach', '#listingscripts', '#agentcoaching', '#realestatetraining'],
    visual: 'Talking head with text overlay scripts. Sometimes role-play with another agent.',
    formula: 'Common agent problem → exact script → why it works → CTA',
    adaptIdea: 'Steal his FORMAT but make it for BUYERS/SELLERS not agents: "5 questions to ask before hiring a luxury listing agent in Metro Detroit." Same script format, different audience.',
  },
  {
    creator: 'Madison Sutton', handle: '@thenycagent', platform: 'TikTok + Instagram', followers: '650K+',
    location: 'New York, NY', niche: 'lifestyle', effort: '30min', engagement: 'HIGH',
    hook: '"$5,000 a month gets you THIS in NYC"', viralViews: '8M+ on best reels',
    contentType: 'Apartment tour reels with shocking price reveals',
    caption: 'Madison built her brand on rental tours that reveal how brutal NYC pricing is. Her "POV: you can afford $3K rent" content drives massive engagement because it taps into housing anxiety. The format works ANYWHERE with price scarcity.',
    hashtags: ['#nycapartments', '#nycrealestate', '#nycrentals', '#luxurynyc'],
    visual: 'POV walk-through. Price label visible from start (creates anticipation). Quick cuts.',
    formula: 'Shock price hook → POV tour → emotional reveal (good or bad) → CTA',
    adaptIdea: 'Metro Detroit version: "What $500K buys you in Birmingham vs Royal Oak vs Detroit." Same shock-price format, applied to YOUR market\'s price diversity.',
  },
  {
    creator: 'Ricky Carruth', handle: '@rickycarruth', platform: 'YouTube + Instagram', followers: '300K+',
    location: 'Orange Beach, AL', niche: 'agent-education', effort: '45min', engagement: 'MED',
    hook: '"How I doubled my income calling expired listings"', viralViews: '150K+ per post',
    contentType: 'Free coaching content + script breakdowns',
    caption: 'Ricky built his brand on giving away EVERYTHING for free (his book is free, his coaching is free). Reverse psychology — agents pay because he overdelivers. Best for: how to give away value to build trust.',
    hashtags: ['#expiredlistings', '#realestatecoaching', '#freecontent'],
    visual: 'Plain background, talking head, sometimes whiteboard. Production value is low — content is the value.',
    formula: 'Specific tactic → exact script → results → "and it\'s free"',
    adaptIdea: 'Give away your seller prep checklist for free. Post the entire thing as a carousel. Trust > sales pitch.',
  },
  {
    creator: 'Brittany Loeffler', handle: '@brittanyloefflerteam', platform: 'TikTok + Instagram', followers: '300K+',
    location: 'Philadelphia, PA', niche: 'day-in-life', effort: '20min', engagement: 'HIGH',
    hook: '"POV: you\'re a luxury agent on closing day"', viralViews: '3M+ on top reels',
    contentType: 'Aesthetic day-in-life with luxury lifestyle aspiration',
    caption: 'Brittany sells the LIFESTYLE of being a luxury agent (well-dressed, beautiful homes, dream cars). Her content makes other women want to BECOME agents AND makes wealthy women want to HIRE her. Double-audience win.',
    hashtags: ['#luxuryagent', '#realestatelifestyle', '#womeninrealestate', '#luxurylife'],
    visual: 'Cinematic gimbal shots, fashion-forward outfits, sun flares, beautiful homes, dream cars.',
    formula: 'Aspirational visual → soft narration → lifestyle aesthetic → CTA',
    adaptIdea: 'YOUR Metro Detroit luxury agent aesthetic: well-dressed, in Birmingham/Bloomfield homes, behind the wheel of a nice car, sunrise to sunset day-in-life. Aspirational, not sales-y.',
  },
  {
    creator: 'The Altman Brothers', handle: '@thealtmanbrothers', platform: 'Instagram', followers: '1M+',
    location: 'Beverly Hills, CA', niche: 'luxury-tour', effort: '2hrs', engagement: 'HIGH',
    hook: '"You\'re looking at a $42M Bel-Air estate"', viralViews: '2M+ per tour',
    contentType: 'Ultra-luxury walkthroughs with brotherly chemistry',
    caption: 'The Altman Brothers (from Million Dollar Listing LA) sell PERSONALITY as much as homes. Their content works because of their dynamic, not just the homes. Two-agent banter format is replicable with a partner.',
    hashtags: ['#luxuryrealestate', '#bevhills', '#milliondollarhome', '#luxurylifestyle'],
    visual: 'Two-person conversational tour. Drone establishing shots. Lots of personality.',
    formula: 'Establish stakes (price) → tour with banter → personality moments → CTA',
    adaptIdea: 'Find a partner (your broker, another agent, a stager) and do paired tours. The chemistry sells. If solo: do "tour with your spouse/friend" content.',
  },
  {
    creator: 'Mauricio Umansky', handle: '@mumansky18', platform: 'Instagram', followers: '1M+',
    location: 'Beverly Hills, CA', niche: 'celebrity-listings', effort: '2hrs', engagement: 'HIGH',
    hook: '"Inside the $250M Bel-Air mega-mansion"', viralViews: '5M+ per tour',
    contentType: 'Celebrity-tier luxury with Mauricio\'s personal brand',
    caption: 'Mauricio (founder of The Agency) leverages his RHOBH celebrity for visibility, then converts with actual luxury expertise. His "celebrity client" mentions are subtle flexes that establish authority.',
    hashtags: ['#luxuryrealestate', '#thelagent', '#beverlyhills', '#celebrityhomes'],
    visual: 'Drone establishing shots, smooth gimbal tours, sometimes featuring clients (with permission).',
    formula: 'Authority signal (celebrity, price) → tour → personal brand moment → CTA',
    adaptIdea: 'You don\'t need celebrities. Use Metro Detroit "celebrity homes" — former Pistons players\' homes, Lions players\' homes, Motown legend homes. Public records show many of these.',
  },
  {
    creator: 'Tatiana Londono', handle: '@tatianalondono', platform: 'Instagram + TikTok', followers: '500K+',
    location: 'Montreal, QC', niche: 'agent-education', effort: '30min', engagement: 'HIGH',
    hook: '"3 ways NEW agents waste their first year"', viralViews: '1M+ on top reels',
    contentType: 'Bold opinions + script breakdowns for agents',
    caption: 'Tatiana built her empire by being BLUNT — calls out bad agent behavior, gives controversial advice, doesn\'t soften. The "I\'m going to say what other coaches won\'t" angle drives engagement.',
    hashtags: ['#realestatecoach', '#newagent', '#agentadvice', '#realestatetraining'],
    visual: 'Direct-to-camera, intense eye contact, bold backgrounds. Captions emphasize controversial takes.',
    formula: 'Controversial opinion → defense → actionable advice → CTA',
    adaptIdea: 'Pick something the Metro Detroit luxury market gets WRONG. Take a bold stance ("Most Birmingham agents underprice older homes by $50K — here\'s why"). Defend it with proof.',
  },
  {
    creator: 'Jonathan Garbutt', handle: '@thatsmartagent', platform: 'TikTok', followers: '400K+',
    location: 'Toronto, ON', niche: 'agent-education', effort: '15min', engagement: 'HIGH',
    hook: '"This script gets you 5 listing appointments a week"', viralViews: '2M+ on top reels',
    contentType: 'Script teardowns — exact words to say',
    caption: 'Jonathan gives the EXACT words agents need to say. Short reels (15-30 sec), high-value, immediately actionable. Agents save these reels. Builds authority fast.',
    hashtags: ['#realestatescripts', '#listingagent', '#realestatecoach', '#agentscripts'],
    visual: 'Quick cuts, captions emphasize key phrases. Phone-shot, casual setting.',
    formula: 'Specific scenario → exact words → why it works → save it',
    adaptIdea: 'For BUYERS/SELLERS not agents: "What to say when an agent pressures you to make an offer." Same script-teardown format, consumer audience.',
  },
  {
    creator: 'Krista Mashore', handle: '@kristamashore', platform: 'YouTube + Instagram', followers: '300K+',
    location: 'Brentwood, CA', niche: 'agent-education', effort: '45min', engagement: 'MED',
    hook: '"How I went from 5 deals to 169 in one year"', viralViews: '200K+ per video',
    contentType: 'Personal transformation + agent system breakdowns',
    caption: 'Krista\'s hero arc (single mom → top agent) is her hook. She teaches HER specific system. Personal story + system = high-converting coaching content.',
    hashtags: ['#realestatecoach', '#topagent', '#realestatesystem'],
    visual: 'Polished talking head, B-roll of her business, occasional client testimonials.',
    formula: 'Personal story → "here\'s what changed" → system breakdown → CTA',
    adaptIdea: 'Share YOUR transformation story. "From 12 deals to 38 deals by focusing on Birmingham luxury." Your specific pivot, your specific system.',
  },
  {
    creator: 'Brennan Adams', handle: '@brennanadams_re', platform: 'Instagram + TikTok', followers: '250K+',
    location: 'Toronto, ON', niche: 'investor', effort: '30min', engagement: 'HIGH',
    hook: '"I bought this duplex for $40K. Here\'s what I made."', viralViews: '1M+ on top reels',
    contentType: 'Investment property breakdowns + real numbers',
    caption: 'Brennan shares ACTUAL investment numbers (purchase price, reno cost, rent, profit). Real estate investor audience eats this up. Builds an investor lead pipeline.',
    hashtags: ['#realestateinvesting', '#duplexinvesting', '#rentalproperty', '#cashflow'],
    visual: 'Before/after shots, P&L breakdown on screen, walkthrough of finished property.',
    formula: 'Shocking purchase price → reno breakdown → final numbers → reproducible system',
    adaptIdea: 'Metro Detroit investor content. Show duplex deals in Hamtramck, Ferndale, Royal Oak. Real numbers. Real cash flow. Builds investor lead pipeline.',
  },
  {
    creator: 'Brandon Mulrenin', handle: '@brandonmulrenin', platform: 'YouTube + Instagram', followers: '400K+',
    location: 'Cherry Hill, NJ', niche: 'agent-education', effort: '45min', engagement: 'MED',
    hook: '"Why most agents will fail in 2026"', viralViews: '300K+ per video',
    contentType: 'Market predictions + agent business model breakdowns',
    caption: 'Brandon makes bold predictions about the industry. Pulls in both consumers (worried about market) and agents (worried about their business). Dual-audience content scales.',
    hashtags: ['#realestatemarket', '#realestatepredictions', '#agentbusiness'],
    visual: 'Authority pose talking head, charts on screen, sometimes interviews other agents.',
    formula: 'Bold prediction → evidence → implications → action',
    adaptIdea: 'Take a Metro Detroit-specific stance. "Bloomfield Hills will outperform every Detroit suburb in 2026 — here\'s why." Bold, evidenced, local.',
  },
  {
    creator: 'Phil Hawkins', handle: '@philhawkinsre', platform: 'TikTok', followers: '200K+',
    location: 'Dallas, TX', niche: 'lifestyle', effort: '20min', engagement: 'HIGH',
    hook: '"Day in the life: closing 3 deals before noon"', viralViews: '5M+ on top reels',
    contentType: 'Fast-paced day-in-life montages',
    caption: 'Phil\'s rapid-fire day-in-life content (closings, meetings, calls in 60 seconds) creates "wow this guy works hard" perception. Builds trust through visible work ethic.',
    hashtags: ['#realestatelife', '#dayinthelife', '#hustleculture', '#realestateagent'],
    visual: 'Timelapses, jump cuts between activities, time stamps on screen, upbeat music.',
    formula: 'Aggressive goal (3 deals) → rapid montage → end-of-day reflection',
    adaptIdea: 'Your Metro Detroit montage: 6am coffee, 9am Birmingham showing, noon Bloomfield listing presentation, 3pm Novi closing, 6pm dinner with past clients. Show the volume.',
  },
  {
    creator: 'Hina Khan', handle: '@hinakhanrealtor', platform: 'TikTok + Instagram', followers: '150K+',
    location: 'Houston, TX', niche: 'luxury-tour', effort: '30min', engagement: 'HIGH',
    hook: '"What $2M gets you in Houston vs LA"', viralViews: '3M+ on top reels',
    contentType: 'City-comparison tours showing price disparity',
    caption: 'Hina\'s city-comparison content (Houston $2M vs LA $2M) goes viral because it taps into "did I move to the wrong city" anxiety. Visual side-by-side reveals are screenshot-worthy.',
    hashtags: ['#houstonrealestate', '#houstonvsla', '#luxuryhomes', '#hometourcompare'],
    visual: 'Side-by-side splits, same camera angle in both cities, clear price labels.',
    formula: 'Shock comparison setup → side-by-side reveal → emotional implication → CTA',
    adaptIdea: '"What $500K buys you in Bloomfield Hills vs Beverly Hills" or "$1M Birmingham home vs $1M Manhattan apartment." Geographic value comparison.',
  },
  {
    creator: 'Andy Elliott', handle: '@officialandyelliott', platform: 'Instagram + TikTok', followers: '500K+',
    location: 'Scottsdale, AZ', niche: 'sales-training', effort: '15min', engagement: 'HIGH',
    hook: '"Stop saying \'I\'ll think about it\' to your clients"', viralViews: '2M+ on top reels',
    contentType: 'Sales objection handling — exact scripts',
    caption: 'Andy gets agents fired up about closing. High-energy delivery, controversial takes on sales tactics. Audience: agents who want more aggression in their close.',
    hashtags: ['#salescoaching', '#closing', '#realestatescripts', '#salestraining'],
    visual: 'Intense talking head, dramatic lighting, captions in ALL CAPS for emphasis.',
    formula: 'Common weak phrase → why it loses → power phrase replacement → demo',
    adaptIdea: 'Calmer Monica version: "Here\'s what I say when a buyer says \'we\'re going to wait until rates drop\'." Your specific Metro Detroit objection-handling.',
  },
  {
    creator: 'Dean Adler', handle: '@deanadler_realestate', platform: 'TikTok + Instagram', followers: '200K+',
    location: 'New York, NY', niche: 'luxury-tour', effort: '30min', engagement: 'HIGH',
    hook: '"Inside a $25M NYC penthouse — wait until you see the closet"', viralViews: '4M+ on top reels',
    contentType: 'Luxury walkthrough reels with one wow moment',
    caption: 'Dean builds every tour around ONE wow moment (the closet, the wine cellar, the hidden room). The hook tees up the reveal. Tour structure: build anticipation → payoff.',
    hashtags: ['#nyrealestate', '#luxurypenthouse', '#luxurytour', '#manhattan'],
    visual: 'Smooth gimbal, building toward one big reveal. Music swells at the moment.',
    formula: 'Tease the wow → walk through ordinary → reveal the wow → emotional payoff',
    adaptIdea: 'Find ONE wow feature in each Birmingham/Bloomfield listing (the wine cellar, the indoor pool, the panic room). Build the whole reel around the reveal.',
  },
  {
    creator: 'Sarah Knauer', handle: '@sarahknauer.realestate', platform: 'TikTok + Instagram', followers: '180K+',
    location: 'Nashville, TN', niche: 'agent-story', effort: '25min', engagement: 'HIGH',
    hook: '"Single mom who built a million-dollar real estate business"', viralViews: '3M+ on top reels',
    contentType: 'Hero-arc personal story + real estate education',
    caption: 'Sarah\'s hero arc (single mom transitioning into top producer) is the foundation. Every market lesson is wrapped in her personal journey. Authenticity + aspiration = high engagement with women buyers.',
    hashtags: ['#singlemomrealestate', '#womenwhocrush', '#nashvillerealestate', '#femaleagent'],
    visual: 'Mix of personal life moments, professional shots, talking-head reflection.',
    formula: 'Personal vulnerability → market lesson → empowerment → CTA',
    adaptIdea: 'YOUR personal journey into real estate. Whatever your origin story is, lean into it. Women buyers and sellers want to work with women who get it.',
  },
];

// The prompt used by the "Refresh with AI" button. Calls /api/claude/messages
// which falls back to GOOGLE_GEMINI_API_KEY when ANTHROPIC isn't set. Output
// must be JSON array matching the seed shape for the UI to render.
// Monica explicitly wants TOP US CREATORS + their viral content, not local
// caption ideas. The seed is high-engagement US RE creators with proven viral
// content + the formula behind why it worked + an adapt-this-for-Monica idea.
const CONTENT_ENGINE_PROMPT_OLD_METRO = `You are an elite real estate content strategist generating viral content ideas for Monica Iskra, a RE/MAX Classic luxury agent in Metro Detroit (Birmingham, Bloomfield Hills, Novi, Northville, West Bloomfield, Oakland County, I-275 corridor, $350K+ homes).

Generate 30 fresh, ready-to-post content ideas she can execute THIS WEEK.

OUTPUT REQUIREMENT: Return ONLY a valid JSON array, no preamble, no markdown code fences. Each object must have EXACTLY these fields:
{
  "hook": "First 3 seconds — what stops the scroll",
  "platform": "Instagram Reel" | "TikTok" | "YouTube Short" | "Instagram Carousel" | "Instagram Story",
  "niche": "luxury-tour" | "market" | "educational" | "day-in-life" | "hyperlocal" | "investor" | "agent-story" | "lifestyle" | "listing-promo",
  "effort": "5min" | "15min" | "20min" | "25min" | "30min" | "45min" | "60min" | "2hrs",
  "engagement": "LOW" | "MED" | "HIGH",
  "caption": "Full ready-to-paste caption in Monica's voice (warm, professional, confident, never pushy). Include emoji where natural. End with a clear CTA.",
  "hashtags": ["array of 5 hashtags optimized for Metro Detroit luxury"],
  "visual": "One sentence describing the visual/b-roll"
}

MIX REQUIREMENT (must include all):
- 10 luxury home walkthroughs (name specific Metro Detroit suburbs)
- 5 market commentary (Birmingham appreciation, Bloomfield prices, etc.)
- 5 day-in-the-life as a luxury agent
- 5 educational ("3 mistakes...", "What to check...", etc.)
- 5 hyper-local Metro Detroit cultural moments (Dream Cruise, Auto Show, Tigers Opening Day, Birmingham Restaurant Week, etc.)

QUALITY RULES:
- Every idea must name a real Metro Detroit neighborhood, not generic
- No vague "real estate tips" — be hyper-specific
- Hashtags must reasonably exist (no #made_up_hashtag)
- Captions must be in HER voice (warm, professional, confident — like a luxury concierge, not a used-car salesman)
- Avoid clichés ("don't miss out", "act fast", "click link in bio")

OUTPUT ONLY THE JSON ARRAY. NO OTHER TEXT.`;

// The ACTIVE prompt — fetches TOP US viral creators + their content formulas.
// Used by the "Refresh with AI" button on the Content Engine tab.
const CONTENT_ENGINE_PROMPT = `You are an expert real estate content researcher tracking the highest-engagement US real estate creators on Instagram, TikTok, and YouTube in 2026.

Your client is Monica Iskra (RE/MAX Classic, Metro Detroit luxury agent). She wants to study the BEST US RE creators and adapt their winning formulas to her market.

Return 20 top US real estate creators currently going viral. PRIORITIZE creators with proven high engagement (50K+ views per post regularly). Skip coaching influencers if possible — focus on PRACTICING agents who post about real estate.

OUTPUT REQUIREMENT: Return ONLY a valid JSON array, no preamble, no markdown code fences. Each object must have EXACTLY these fields:
{
  "creator": "Full name",
  "handle": "@instagram_or_tiktok_handle",
  "platform": "TikTok" | "Instagram" | "YouTube" | "Instagram + TikTok" | "YouTube Long-form",
  "followers": "estimated follower count e.g. '850K' or '1.5M'",
  "location": "City, ST",
  "niche": "storytelling" | "luxury-tour" | "agent-education" | "investor" | "day-in-life" | "lifestyle" | "celebrity-listings" | "agent-story" | "sales-training",
  "effort": "15min" | "20min" | "25min" | "30min" | "45min" | "60min" | "2hrs",
  "engagement": "LOW" | "MED" | "HIGH",
  "hook": "Their signature hook style — actual example of how they open a viral post",
  "viralViews": "Approximate view count on their viral posts e.g. '10M+ views' or '500K+ per video'",
  "contentType": "What kind of content (e.g. 'Talking-head storytelling reel' or 'High-production luxury walkthrough')",
  "caption": "2-3 sentences describing what makes this creator's content WORK — the psychological + algorithmic reasons",
  "hashtags": ["5 hashtags this creator uses"],
  "visual": "One sentence describing the visual style/production approach",
  "formula": "The 3-5 step formula this creator follows on every post",
  "adaptIdea": "One specific idea for HOW MONICA (Metro Detroit luxury agent) could adapt this creator's style to her market — be specific, name Birmingham/Bloomfield/Novi/Northville/West Bloomfield"
}

QUALITY RULES:
- Real creators only. Don't make up handles.
- Mix luxury and non-luxury creators (Monica wants creative inspiration from all niches)
- Mix big names (Ryan Serhant, Altman Brothers) with mid-tier creators (50K-500K followers — often higher engagement than mega-creators)
- Geographic mix across the US
- Include creators known for going VIRAL specifically (not just consistently posting)
- "adaptIdea" must mention a specific Metro Detroit neighborhood, not generic

OUTPUT ONLY THE JSON ARRAY. NO OTHER TEXT.`;

// ── CURATED INFLUENCER DIRECTORY ────────────────────────────────────────────
// Each entry: name, location, platforms (with handles), follower estimates,
// what they're known for, and a "why watch" tag explaining the format/style
// you'd want to mimic. Curated for 2026 — list re-verified periodically.
const INFLUENCERS = [
  {
    id: 'glennda-baker',
    name: 'Glennda Baker',
    location: 'Atlanta, GA',
    handles: {
      tiktok: 'glenndabaker',
      instagram: 'glennda_baker',
      youtube: '@GlenndaBakerAtlanta',
    },
    followers: { tiktok: '850K', instagram: '300K+' },
    whyWatch: 'Storytelling queen — wraps market lessons in personal stories. "$137K on one sale" reel = 10M+ views. Best for emotional + educational mashup format.',
    knownFor: 'Personal storytelling, market education, deal breakdowns',
    bestFormats: ['Talking head', 'Story arc', 'Breaking news'],
    tag: 'Storyteller',
  },
  {
    id: 'mike-sherrard',
    name: 'Mike Sherrard',
    location: 'Toronto, ON',
    handles: {
      youtube: '@MikeSherrard',
      instagram: 'mikesherrard',
      tiktok: 'mikesherrard',
    },
    followers: { youtube: '700K+', total: '700K+' },
    whyWatch: 'Content strategy for agents. $1M in sales with ZERO ad spend. Best for learning HOW to make content, not just what to post.',
    knownFor: 'Content strategy education for agents, growth tactics',
    bestFormats: ['Educational', 'Hook breakdowns', 'Strategy explainers'],
    tag: 'Strategy',
  },
  {
    id: 'ricky-carruth',
    name: 'Ricky Carruth',
    location: 'Alabama (national reach)',
    handles: {
      instagram: 'rickycarruth',
      tiktok: 'rickycarruth',
      youtube: '@RickyCarruth',
    },
    followers: { total: '10M monthly organic views (Inman 2025)' },
    whyWatch: 'Coach turned content machine — 10M monthly views without ads. Practical, no-BS, conversion-focused content.',
    knownFor: 'Daily content cadence, agent coaching, practical advice',
    bestFormats: ['Talking head', 'Quick tips', 'Day-in-the-life'],
    tag: 'Volume',
  },
  {
    id: 'daniel-heider',
    name: 'Daniel Heider',
    location: 'DC',
    handles: {
      tiktok: 'heiderrealestate',
      instagram: 'heiderrealestate',
    },
    followers: { tiktok: '3.7M' },
    whyWatch: 'Trend-jack master. Uses trending audio over listings with witty captions tying audio to visual. Drove 3.7M follower count from zero.',
    knownFor: 'Trend-jacking with trending audio + clever captions',
    bestFormats: ['Trend-jack', 'Lifestyle B-roll', 'Audio-driven'],
    tag: 'Trend-jack',
  },
  {
    id: 'rochelle-maize',
    name: 'Rochelle Maize',
    location: 'Beverly Hills, CA',
    handles: {
      instagram: 'rochellemaize',
      tiktok: 'rochellemaize',
    },
    followers: { instagram: '500K+' },
    whyWatch: 'Luxury POV pioneer. POV-style kitchen tour hit 9M+ views, listing in escrow within 2 weeks. Best for high-end POV reveal format.',
    knownFor: 'Luxury POV tours, kitchen/closet reveals',
    bestFormats: ['POV', 'Luxury reveal', 'Slow camera reveal'],
    tag: 'Luxury POV',
  },
  {
    id: 'josh-altman',
    name: 'Josh Altman',
    location: 'LA',
    handles: {
      instagram: 'thejoshaltman',
      tiktok: 'joshaltmanofficial',
      youtube: '@thejoshaltman',
    },
    followers: { instagram: '1.5M+' },
    whyWatch: 'Pool-of-a-listing curiosity reveal = 4M+ views. Million Dollar Listing alum, builds personality with property content.',
    knownFor: 'Personality + property combos, celebrity listings',
    bestFormats: ['Wow-feature reveal', 'Behind-the-scenes', 'Personality'],
    tag: 'Celeb agent',
  },
  {
    id: 'brad-scott',
    name: 'Brad Scott ("The Unprofessional Realtor")',
    location: 'San Antonio, TX',
    handles: {
      tiktok: 'theunprofessionalrealtor',
      instagram: 'theunprofessionalrealtor',
    },
    followers: { tiktok: '500K+' },
    whyWatch: 'Raw, unfiltered, reactive home tours. Proves personality beats polish. Best if you want to lean into authenticity over production value.',
    knownFor: 'Aggressive personality-forward tours, real-time reactions',
    bestFormats: ['Reaction tours', 'Walk-and-talk', 'Personality'],
    tag: 'Personality',
  },
  {
    id: 'tracy-tutor',
    name: 'Tracy Tutor',
    location: 'LA',
    handles: {
      instagram: 'tracytutor',
      tiktok: 'tracytutorrealestate',
    },
    followers: { instagram: '500K+' },
    whyWatch: 'Million Dollar Listing LA. Polished luxury content with strong personal brand voice. Best for high-end aspirational content.',
    knownFor: 'High-end LA listings, polished brand',
    bestFormats: ['Aspirational walk-through', 'Behind-the-scenes', 'Luxury'],
    tag: 'Luxury',
  },
  {
    id: 'tolga-karip',
    name: 'Tolga Karip',
    location: 'LA (luxury)',
    handles: {
      instagram: 'tolgakarip',
      tiktok: 'tolgakariprealestate',
    },
    followers: { instagram: '800K+' },
    whyWatch: 'Luxury Reel cinematography master. Cinematic shots, slow reveals, premium audio. Best if you have access to high-end listings.',
    knownFor: 'Cinematic luxury Reels, slow reveals',
    bestFormats: ['Cinematic tour', 'Slow reveal', 'Luxury B-roll'],
    tag: 'Cinematic',
  },
  {
    id: 'ben-mallah',
    name: 'Ben Mallah',
    location: 'Florida',
    handles: {
      youtube: '@BenMallah',
      tiktok: 'benmallah',
      instagram: 'benmallah',
    },
    followers: { youtube: '1M+' },
    whyWatch: 'Commercial RE investor with raw, opinionated takes. Best for hot-take + spicy-take format inspiration even though commercial focus.',
    knownFor: 'Commercial RE, blunt opinions, deal stories',
    bestFormats: ['Spicy take', 'Deal breakdown', 'Walk-and-talk'],
    tag: 'Spicy take',
  },
  {
    id: 'bryan-casella',
    name: 'Bryan Casella',
    location: 'LA',
    handles: {
      youtube: '@BryanCasella',
      tiktok: 'bryancasella',
      instagram: 'bryancasella',
    },
    followers: { youtube: '300K+' },
    whyWatch: 'Daily cold-call + door-knock content. Best for prospecting-content inspiration if she wants to show the grit side.',
    knownFor: 'Daily prospecting content, cold-calling',
    bestFormats: ['Day-in-the-life', 'Real-time prospecting'],
    tag: 'Grind',
  },
  {
    id: 'erica-strange',
    name: 'Erica Strange',
    location: 'NYC',
    handles: {
      tiktok: 'ericastrangenyc',
      instagram: 'ericastrange',
    },
    followers: { tiktok: '500K+' },
    whyWatch: 'NYC luxury + market commentary. Strong personal brand. Best for combining lifestyle + market education.',
    knownFor: 'NYC luxury + market takes',
    bestFormats: ['Market commentary', 'Lifestyle', 'POV'],
    tag: 'Market take',
  },
  {
    id: 'broke-agent-media',
    name: 'Broke Agent Media (BAM)',
    location: 'National',
    handles: {
      instagram: 'thebrokeagent',
      tiktok: 'broke.agent',
      youtube: '@TheBrokeAgent',
    },
    followers: { instagram: '600K+' },
    whyWatch: 'Real estate meme + content media brand. Best free education on what hooks work — they publish hook breakdowns weekly.',
    knownFor: 'Memes + content education',
    bestFormats: ['Memes', 'Hook breakdowns', 'Industry commentary'],
    tag: 'Content brand',
  },
  {
    id: 'tom-ferry',
    name: 'Tom Ferry',
    location: 'National',
    handles: {
      youtube: '@TomFerry',
      instagram: 'tomferry',
      tiktok: 'tomferry',
    },
    followers: { youtube: '300K+' },
    whyWatch: 'Industry-leading coach. Best for big-picture content strategy and weekly trend breakdowns.',
    knownFor: 'Coaching, strategy podcasts',
    bestFormats: ['Long-form education', 'Strategy frameworks'],
    tag: 'Coach',
  },
  {
    id: 'krista-mashore',
    name: 'Krista Mashore',
    location: 'National',
    handles: {
      youtube: '@KristaMashore',
      instagram: 'kristamashore',
    },
    followers: { instagram: '200K+' },
    whyWatch: 'Video-first coaching. Best for "video used to grow real estate" framework + tactical breakdowns.',
    knownFor: 'Video marketing coaching',
    bestFormats: ['Educational', 'Talking head'],
    tag: 'Video coach',
  },
  {
    id: 'graham-stephan',
    name: 'Graham Stephan',
    location: 'LA',
    handles: {
      youtube: '@GrahamStephan',
      instagram: 'gpstephan',
      tiktok: 'gpstephan',
    },
    followers: { youtube: '4.5M' },
    whyWatch: 'RE-adjacent but huge audience. Best for hook patterns that worked at scale (he\'s mastered the YouTube algorithm).',
    knownFor: 'Personal finance + RE investing',
    bestFormats: ['Educational', 'Hook patterns', 'Listicles'],
    tag: 'Mass audience',
  },
  {
    id: 'mark-spain',
    name: 'Mark Spain',
    location: 'Atlanta',
    handles: {
      youtube: '@MarkSpainRealEstate',
      instagram: 'markspainrealestate',
    },
    followers: { instagram: '100K+' },
    whyWatch: 'High-volume agent team. Best for understanding how a team produces content at scale.',
    knownFor: 'Team content, market updates',
    bestFormats: ['Market updates', 'Team content'],
    tag: 'Team',
  },
  {
    id: 'christophe-choo',
    name: 'Christophe Choo',
    location: 'Beverly Hills',
    handles: {
      youtube: '@ChristopheChoo',
      instagram: 'christophechoo',
      tiktok: 'christophechoo',
    },
    followers: { youtube: '200K+' },
    whyWatch: 'Long-form luxury tours. Best for full-property walk-through format inspiration.',
    knownFor: 'Long-form luxury tours',
    bestFormats: ['Long tours', 'Cinematic'],
    tag: 'Long-form',
  },
  {
    id: 'sean-pan',
    name: 'Sean Pan',
    location: 'Bay Area',
    handles: {
      youtube: '@SeanPan',
      instagram: 'seanpanrealestate',
    },
    followers: { youtube: '50K+' },
    whyWatch: 'Bay Area market strategist. Best for analytical / data-driven content.',
    knownFor: 'Data-driven market analysis',
    bestFormats: ['Data viz', 'Market analysis'],
    tag: 'Data',
  },
  {
    id: 'inman-news',
    name: 'Inman News',
    location: 'National (industry pub)',
    handles: {
      instagram: 'inmannews',
      tiktok: 'inmannews',
    },
    followers: { instagram: '50K+' },
    whyWatch: 'Industry news + trending agent profiles. Best for staying current on what\'s breaking + who\'s rising.',
    knownFor: 'Industry news',
    bestFormats: ['News', 'Trend reports'],
    tag: 'Industry',
  },
];

const TAGS = ['All', 'Storyteller', 'Strategy', 'Trend-jack', 'Luxury POV', 'Luxury', 'Cinematic', 'Spicy take', 'Personality', 'Market take', 'Coach', 'Content brand', 'Volume', 'Data'];

function platformUrl(platform, handle) {
  switch (platform) {
    case 'instagram': return `https://instagram.com/${handle.replace('@', '')}`;
    case 'tiktok':    return `https://tiktok.com/@${handle.replace('@', '')}`;
    case 'youtube':   return `https://youtube.com/${handle.startsWith('@') ? handle : '@' + handle}`;
    default: return '#';
  }
}

const InfluencerWatch = ({ setPage, toast }) => {
  const [tab, setTab] = useState('engine'); // engine | feed | directory | youtube | inspiration | library
  // Content Engine — Gemini-powered viral idea generator (Monica's #1 ask)
  const [contentIdeas, setContentIdeas] = useLS('content_engine_ideas_v2', CONTENT_ENGINE_SEED);
  const [engineLoading, setEngineLoading] = useState(false);
  const [engineError, setEngineError] = useState(null);
  const [engineFilter, setEngineFilter] = useState({ platform: 'all', effort: 'all', niche: 'all' });
  const [contentDrafts, setContentDrafts] = useLS('content_drafts', []);
  const refreshContentIdeas = async () => {
    setEngineLoading(true);
    setEngineError(null);
    try {
      const r = await fetch('/api/claude/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 8000,
          messages: [{ role: 'user', content: CONTENT_ENGINE_PROMPT }],
        }),
      });
      if (!r.ok) throw new Error(`AI error ${r.status}`);
      const data = await r.json();
      const text = data?.content?.[0]?.text || data?.choices?.[0]?.message?.content || '';
      // Try to parse JSON out of the response
      const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (!jsonMatch) throw new Error('AI returned no parseable ideas — try again');
      const ideas = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(ideas) || ideas.length === 0) throw new Error('No ideas returned');
      setContentIdeas(ideas);
      toast?.success?.(`✨ ${ideas.length} fresh ideas generated by AI`);
    } catch (e) {
      setEngineError(e.message);
      toast?.error?.('Refresh failed: ' + e.message);
    }
    setEngineLoading(false);
  };
  const handleUseIdea = (idea) => {
    const draft = {
      id: 'draft_' + Date.now(),
      ...idea,
      savedAt: new Date().toISOString(),
      status: 'draft',
    };
    setContentDrafts(p => [draft, ...p]);
    // Build a "ready to film" brief in the clipboard — creator's formula
    // adapted to Monica's market. Easier to act on than just a hook.
    const brief = `INSPIRED BY: ${idea.creator} (${idea.handle})\n\nHOOK STYLE: "${idea.hook}"\n\nFORMULA TO FOLLOW:\n${idea.formula}\n\nADAPT FOR METRO DETROIT:\n${idea.adaptIdea}\n\nVISUAL:\n${idea.visual}\n\nHASHTAGS:\n${(idea.hashtags || []).join(' ')}`;
    if (navigator.clipboard) navigator.clipboard.writeText(brief);
    toast?.success?.(`✅ "${idea.creator}" formula saved + brief copied to clipboard`);
  };
  // Posted-log: every template Monica marks as posted gets logged here
  // (separate from contentDrafts so we can show "X posts in last 30 days")
  const [postedLog, setPostedLog] = useLS('posted_content_log', []);
  const markAsPosted = (template) => {
    const entry = {
      id: 'posted_' + Date.now(),
      templateId: template.id,
      title: template.title,
      platform: template.platform,
      inspiredBy: template.inspiredBy,
      postedAt: new Date().toISOString(),
    };
    setPostedLog(p => [entry, ...p]);
    toast?.success?.(`✅ Marked as posted! ${postedLog.length + 1} total posts logged.`);
  };
  // Today's Pick — deterministic based on day-of-year so each day she sees
  // a different one but it's stable through the day (not re-randomizing per
  // render). Picks from READY_TO_FILM_TEMPLATES which are fully complete.
  const todaysPick = React.useMemo(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    return READY_TO_FILM_TEMPLATES[dayOfYear % READY_TO_FILM_TEMPLATES.length];
  }, []);
  const copyTemplateAndMarkPosted = (template) => {
    const fullText = `${template.caption}\n\n${(template.hashtags || []).join(' ')}`;
    if (navigator.clipboard) navigator.clipboard.writeText(fullText);
    markAsPosted(template);
  };
  const copyTemplateOnly = (template) => {
    const fullText = `${template.caption}\n\n${(template.hashtags || []).join(' ')}`;
    if (navigator.clipboard) navigator.clipboard.writeText(fullText);
    toast?.success?.('📋 Caption + hashtags copied to clipboard');
  };

  // ── GEMINI OPTIMIZATION — sharpens any template into 3 variations ─────
  // Monica's ask: "use Gemini for optimization to get the best content."
  // Each variation targets a different angle (more emotional / more educational /
  // more punchy) so she picks what fits the moment. Uses /api/claude/messages
  // which falls back to GOOGLE_GEMINI_API_KEY (free) when ANTHROPIC isn't set.
  const [optimizing, setOptimizing] = useState(null); // template.id being optimized
  const [optimizedVariants, setOptimizedVariants] = useState({}); // {templateId: [variants]}
  const optimizeTemplate = async (template) => {
    setOptimizing(template.id);
    try {
      const prompt = `You are a viral real estate content optimizer. Rewrite the caption below into 3 sharper variations for Monica Iskra (RE/MAX Classic luxury agent, Metro Detroit — Birmingham, Bloomfield Hills, Novi, Northville, West Bloomfield).

ORIGINAL CAPTION:
"""
${template.caption}
"""

PLATFORM: ${template.platform}
INSPIRED BY: ${template.inspiredBy} (study their voice)

Generate 3 distinct rewrites:
1. EMOTIONAL — lead with feeling, tell the human story harder
2. EDUCATIONAL — lead with the lesson, make the value clearer
3. PUNCHY — shorter, more shocking, designed to stop the scroll

Rules:
- Match Monica's voice: warm, professional, confident, never pushy
- Keep the platform format (Reel = punchier, Carousel = more list-like)
- Each rewrite must still include a clear CTA
- Each must be COMPLETE and ready to post (no placeholders)

Return ONLY a valid JSON array. No preamble, no markdown fences. Format:
[
  {"angle": "EMOTIONAL", "caption": "...", "whyBetter": "1 sentence explaining the angle"},
  {"angle": "EDUCATIONAL", "caption": "...", "whyBetter": "1 sentence"},
  {"angle": "PUNCHY", "caption": "...", "whyBetter": "1 sentence"}
]`;
      const r = await fetch('/api/claude/messages', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 3000,
          messages: [{role:'user', content: prompt}],
        }),
      });
      if (!r.ok) throw new Error(`AI error ${r.status}`);
      const data = await r.json();
      const text = data?.content?.[0]?.text || data?.choices?.[0]?.message?.content || '';
      const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (!jsonMatch) throw new Error('AI returned no parseable variations');
      const variants = JSON.parse(jsonMatch[0]);
      setOptimizedVariants(prev => ({...prev, [template.id]: variants}));
      toast?.success?.(`✨ ${variants.length} optimized variations generated`);
    } catch (e) {
      toast?.error?.('Optimize failed: ' + e.message);
    }
    setOptimizing(null);
  };
  const copyVariant = (variant, template) => {
    const fullText = `${variant.caption}\n\n${(template.hashtags || []).join(' ')}`;
    if (navigator.clipboard) navigator.clipboard.writeText(fullText);
    toast?.success?.(`📋 ${variant.angle} version copied to clipboard`);
  };

  const filteredIdeas = contentIdeas.filter(i =>
    (engineFilter.platform === 'all' || (i.platform || '').toLowerCase().includes(engineFilter.platform)) &&
    (engineFilter.effort === 'all' || i.effort === engineFilter.effort) &&
    (engineFilter.niche === 'all' || i.niche === engineFilter.niche)
  );
  const [tagFilter, setTagFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [openInfluencer, setOpenInfluencer] = useState(null);
  const [bookmarks, setBookmarks] = useLS('influencer_bookmarks', []);
  // Pre-fill for Adapt a Post — set by other tabs to hand off context
  const [prefillContext, setPrefillContext] = useState(null);
  // Saved adaptations library
  const [library, setLibrary] = useLS('inspiration_library', []);

  const filtered = INFLUENCERS.filter(i => {
    if (tagFilter !== 'All' && i.tag !== tagFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return i.name.toLowerCase().includes(q) || i.location.toLowerCase().includes(q) || (i.knownFor || '').toLowerCase().includes(q);
    }
    return true;
  });

  const toggleBookmark = (id) => {
    setBookmarks(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]);
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Users size={22} color="#7eb8f7" />
          <h1 style={{ margin: 0, fontFamily: "'DM Serif Display',serif", fontSize: 28, fontWeight: 900, color: '#fff' }}>Influencer Watch</h1>
          <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 8, background: 'rgba(126,184,247,.15)', color: '#7eb8f7' }}>2026 LIST</span>
        </div>
        <div style={{ fontSize: 14, color: '#94a3b8', maxWidth: 760 }}>
          Track top real estate creators across IG, TikTok, and YouTube. Browse curated viral accounts, pull their latest YouTube videos automatically, or paste any IG/TikTok URL to analyze and adapt for your market.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid rgba(255,255,255,.06)', paddingBottom: 2, flexWrap: 'wrap' }}>
        {[
          { id: 'engine', label: '🚀 Content Engine', desc: '30 viral ideas, dummy-proof' },
          { id: 'feed', label: '🔥 Feed', desc: 'Unified inspiration feed' },
          { id: 'directory', label: '📋 Directory', desc: 'Curated 20+ creators' },
          { id: 'inspiration', label: '✨ Adapt a Post', desc: 'Paste any URL, AI adapts' },
          { id: 'youtube', label: '📺 YouTube Tracker', desc: 'Auto-pull recent videos' },
          { id: 'library', label: `📚 My Library (${library.length})`, desc: 'Saved adaptations' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 13,
              color: tab === t.id ? '#7eb8f7' : '#475569',
              borderBottom: tab === t.id ? '2px solid #7eb8f7' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* CONTENT ENGINE TAB — Monica's #1 ask: dummy-proof viral idea generator */}
      {tab === 'engine' && (
        <div>
          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              TODAY'S PICK — the dummy-proof "just post this" magic
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div style={{
            padding:'20px 24px',marginBottom:20,
            background:'linear-gradient(135deg, rgba(184,134,75,.18), rgba(167,139,250,.10))',
            border:'2px solid rgba(184,134,75,.45)',borderRadius:16,
          }}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <div>
                <div style={{fontSize:10,fontWeight:800,color:'#e0b370',letterSpacing:.8,textTransform:'uppercase',marginBottom:2}}>
                  🌟 Today's Pick · {new Date().toLocaleDateString('en-US', {weekday:'long', month:'short', day:'numeric'})}
                </div>
                <div style={{fontSize:18,fontWeight:900,color:'#fff',fontFamily:"'DM Serif Display',serif",lineHeight:1.2}}>
                  {todaysPick.title}
                </div>
                <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>
                  Inspired by <strong style={{color:'#e0b370'}}>{todaysPick.inspiredBy}</strong> · {todaysPick.platform} · ⏱ {todaysPick.effort} · 📅 Best: {todaysPick.bestTime}
                </div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:32}}>🎬</div>
              </div>
            </div>

            {/* Hook */}
            <div style={{padding:'10px 14px',background:'rgba(0,0,0,.25)',borderRadius:8,marginBottom:12}}>
              <div style={{fontSize:9,fontWeight:800,color:'#e0b370',textTransform:'uppercase',letterSpacing:.5,marginBottom:3}}>HOOK (FIRST 3 SECONDS)</div>
              <div style={{fontSize:14,fontWeight:700,color:'#fff',fontStyle:'italic'}}>"{todaysPick.hook}"</div>
            </div>

            {/* Caption preview + shot list side-by-side */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
              <div style={{padding:'10px 14px',background:'rgba(0,0,0,.2)',borderRadius:8}}>
                <div style={{fontSize:9,fontWeight:800,color:'#a78bfa',textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>📝 CAPTION (ready to paste)</div>
                <div style={{fontSize:11,color:'#cbd5e1',whiteSpace:'pre-wrap',lineHeight:1.5,maxHeight:160,overflow:'auto'}}>
                  {todaysPick.caption}
                </div>
              </div>
              <div style={{padding:'10px 14px',background:'rgba(0,0,0,.2)',borderRadius:8}}>
                <div style={{fontSize:9,fontWeight:800,color:'#6ee7b7',textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>🎥 SHOT LIST</div>
                <div style={{fontSize:11,color:'#cbd5e1',lineHeight:1.6}}>
                  {todaysPick.shotList.map((s, i) => (
                    <div key={i} style={{marginBottom:4}}>{i+1}. {s}</div>
                  ))}
                </div>
                <div style={{fontSize:10,color:'#94a3b8',marginTop:8,fontStyle:'italic'}}>
                  🎨 {todaysPick.visual}
                </div>
              </div>
            </div>

            {/* Hashtags */}
            <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:14}}>
              {todaysPick.hashtags.map((h,i) => (
                <span key={i} style={{fontSize:10.5,color:'#7eb8f7',fontWeight:600}}>{h}</span>
              ))}
            </div>

            {/* Big action buttons */}
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              <button onClick={()=>copyTemplateAndMarkPosted(todaysPick)} style={{
                flex:1,minWidth:180,padding:'14px 18px',
                background:'linear-gradient(135deg, #10b981, #6ee7b7)',
                color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:800,cursor:'pointer',
                boxShadow:'0 4px 14px rgba(16,185,129,.3)',
              }}>
                ✅ Copy Caption + Mark Posted
              </button>
              <button onClick={()=>copyTemplateOnly(todaysPick)} style={{
                padding:'14px 18px',
                background:'rgba(126,184,247,.15)',color:'#7eb8f7',
                border:'1px solid rgba(126,184,247,.35)',borderRadius:10,fontSize:13,fontWeight:800,cursor:'pointer',
              }}>
                📋 Just Copy
              </button>
              <button onClick={()=>optimizeTemplate(todaysPick)} disabled={optimizing === todaysPick.id} style={{
                padding:'14px 18px',
                background: optimizing === todaysPick.id ? 'rgba(167,139,250,.2)' : 'linear-gradient(135deg, #a78bfa, #c4b5fd)',
                color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:800,cursor: optimizing === todaysPick.id ? 'wait' : 'pointer',
              }}>
                {optimizing === todaysPick.id ? '⏳ Optimizing…' : '✨ Optimize with Gemini'}
              </button>
            </div>

            {/* Gemini-optimized variations (appear after "Optimize" is clicked) */}
            {optimizedVariants[todaysPick.id] && (
              <div style={{marginTop:14,padding:'14px 16px',background:'rgba(167,139,250,.08)',border:'1px solid rgba(167,139,250,.3)',borderRadius:10}}>
                <div style={{fontSize:10.5,fontWeight:800,color:'#a78bfa',textTransform:'uppercase',letterSpacing:.6,marginBottom:10}}>
                  ✨ Gemini-Optimized Variations — pick the angle that fits today's vibe
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))',gap:10}}>
                  {optimizedVariants[todaysPick.id].map((v, i) => {
                    const angleColors = { EMOTIONAL: '#f87171', EDUCATIONAL: '#7eb8f7', PUNCHY: '#10b981' };
                    const c = angleColors[v.angle] || '#a78bfa';
                    return (
                      <div key={i} style={{
                        padding:'10px 12px',background:'rgba(0,0,0,.25)',borderRadius:8,
                        borderLeft:`3px solid ${c}`,display:'flex',flexDirection:'column',gap:6,
                      }}>
                        <div style={{fontSize:9.5,fontWeight:900,color:c,letterSpacing:.5}}>
                          {v.angle}
                        </div>
                        <div style={{fontSize:10,color:'#94a3b8',fontStyle:'italic'}}>
                          {v.whyBetter}
                        </div>
                        <div style={{fontSize:11,color:'#cbd5e1',whiteSpace:'pre-wrap',lineHeight:1.5,maxHeight:140,overflow:'auto'}}>
                          {v.caption}
                        </div>
                        <button onClick={()=>copyVariant(v, todaysPick)} style={{
                          marginTop:'auto',padding:'6px 10px',
                          background:`${c}22`,color:c,border:`1px solid ${c}55`,
                          borderRadius:6,fontSize:10.5,fontWeight:800,cursor:'pointer',
                        }}>
                          📋 Use this version
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Posted count badge */}
            {postedLog.length > 0 && (
              <div style={{marginTop:10,fontSize:11,color:'#6ee7b7',fontWeight:600}}>
                ✨ You've posted {postedLog.length} time{postedLog.length===1?'':'s'} using my-re-hub. Keep going.
              </div>
            )}
          </div>

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              READY-TO-FILM TEMPLATES — browse all 15
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div style={{marginBottom:24}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:800,color:'#fff'}}>
                📚 Browse All {READY_TO_FILM_TEMPLATES.length} Plug-and-Play Templates
              </div>
              <div style={{fontSize:10.5,color:'#94a3b8'}}>
                Each one is fully written — caption, hashtags, shot list. Just film + post.
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))',gap:10}}>
              {READY_TO_FILM_TEMPLATES.map(t => (
                <div key={t.id} style={{
                  padding:'12px 14px',background:'#0d1117',border:'1px solid rgba(255,255,255,.08)',borderRadius:10,
                  display:'flex',flexDirection:'column',gap:6,
                }}>
                  <div style={{fontSize:12,fontWeight:800,color:'#fff',lineHeight:1.3}}>{t.title}</div>
                  <div style={{fontSize:10,color:'#e0b370',fontStyle:'italic'}}>"{t.hook}"</div>
                  <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:2}}>
                    <span style={{fontSize:8.5,padding:'1px 6px',borderRadius:8,background:'rgba(126,184,247,.12)',color:'#7eb8f7',fontWeight:700}}>{t.platform}</span>
                    <span style={{fontSize:8.5,padding:'1px 6px',borderRadius:8,background:'rgba(167,139,250,.12)',color:'#a78bfa',fontWeight:700}}>⏱ {t.effort}</span>
                    <span style={{fontSize:8.5,padding:'1px 6px',borderRadius:8,background:'rgba(255,255,255,.04)',color:'#94a3b8',fontWeight:700}}>Inspired by {t.inspiredBy}</span>
                  </div>
                  <div style={{display:'flex',gap:6,marginTop:6}}>
                    <button onClick={()=>copyTemplateAndMarkPosted(t)} style={{
                      flex:1,padding:'6px 10px',background:'linear-gradient(135deg, #b8864b, #e0b370)',
                      color:'#fff',border:'none',borderRadius:6,fontSize:10.5,fontWeight:800,cursor:'pointer',
                    }}>
                      ✅ Copy + Post
                    </button>
                    <button onClick={()=>copyTemplateOnly(t)} title="Just copy"
                      style={{padding:'6px 10px',background:'rgba(126,184,247,.12)',color:'#7eb8f7',
                      border:'1px solid rgba(126,184,247,.25)',borderRadius:6,fontSize:10.5,fontWeight:800,cursor:'pointer'}}>
                      📋
                    </button>
                    <button onClick={()=>optimizeTemplate(t)} disabled={optimizing === t.id} title="Optimize with Gemini"
                      style={{padding:'6px 10px',background:'rgba(167,139,250,.12)',color:'#a78bfa',
                      border:'1px solid rgba(167,139,250,.25)',borderRadius:6,fontSize:10.5,fontWeight:800,cursor: optimizing === t.id ? 'wait' : 'pointer'}}>
                      {optimizing === t.id ? '⏳' : '✨'}
                    </button>
                  </div>
                  {/* Inline variations for this template */}
                  {optimizedVariants[t.id] && (
                    <div style={{marginTop:8,padding:'8px 10px',background:'rgba(167,139,250,.08)',borderLeft:'2px solid #a78bfa',borderRadius:6,display:'flex',flexDirection:'column',gap:6}}>
                      {optimizedVariants[t.id].map((v, i) => {
                        const angleColors = { EMOTIONAL: '#f87171', EDUCATIONAL: '#7eb8f7', PUNCHY: '#10b981' };
                        const c = angleColors[v.angle] || '#a78bfa';
                        return (
                          <div key={i} style={{display:'flex',alignItems:'center',gap:6,fontSize:10}}>
                            <span style={{padding:'1px 5px',borderRadius:4,background:`${c}22`,color:c,fontWeight:800,fontSize:8.5}}>{v.angle}</span>
                            <span style={{flex:1,color:'#cbd5e1',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{v.caption.slice(0,60)}…</span>
                            <button onClick={()=>copyVariant(v, t)} style={{background:'none',border:'none',color:c,cursor:'pointer',fontSize:11}}>📋</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Posted log */}
          {postedLog.length > 0 && (
            <div style={{marginBottom:24,padding:'14px 16px',background:'rgba(16,185,129,.06)',border:'1px solid rgba(16,185,129,.2)',borderRadius:12}}>
              <div style={{fontSize:11,fontWeight:800,color:'#6ee7b7',textTransform:'uppercase',letterSpacing:.5,marginBottom:10}}>
                📊 Your Posting History · {postedLog.length} posts logged
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:200,overflow:'auto'}}>
                {postedLog.slice(0,10).map(p => (
                  <div key={p.id} style={{display:'flex',justifyContent:'space-between',padding:'6px 8px',background:'rgba(0,0,0,.2)',borderRadius:6,fontSize:11}}>
                    <span style={{color:'#fff'}}>{p.title}</span>
                    <span style={{color:'#94a3b8'}}>{new Date(p.postedAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              TOP CREATORS LIBRARY (existing section)
              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div style={{fontSize:13,fontWeight:800,color:'#fff',marginBottom:8}}>
            🌎 Top US Real Estate Creators (for inspiration)
          </div>
          <div style={{fontSize:11,color:'#94a3b8',marginBottom:14}}>
            Study how these creators built massive audiences. Click "Adapt for Me" to save their formula adapted for Metro Detroit.
          </div>
          {/* Hero with Refresh button */}
          <div style={{
            display:'flex',gap:14,alignItems:'center',justifyContent:'space-between',
            padding:'18px 22px',marginBottom:18,
            background:'linear-gradient(135deg, rgba(184,134,75,.12), rgba(167,139,250,.06))',
            border:'1px solid rgba(184,134,75,.25)',borderRadius:14,
          }}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:11,fontWeight:800,color:'#e0b370',textTransform:'uppercase',letterSpacing:.6,marginBottom:4}}>🚀 Top US Viral Real Estate Creators</div>
              <div style={{fontSize:14,color:'#fff',fontWeight:700,marginBottom:3}}>
                {contentIdeas.length} highest-engagement US RE creators + their viral formulas
              </div>
              <div style={{fontSize:11.5,color:'#94a3b8'}}>
                Each card shows a top creator's signature hook, why it works, the exact formula, and how to adapt it for YOUR market. Click <strong>"Adapt for Me"</strong> to save the brief.
              </div>
            </div>
            <button onClick={refreshContentIdeas} disabled={engineLoading}
              style={{
                background:engineLoading?'rgba(184,134,75,.2)':'linear-gradient(135deg, #b8864b, #e0b370)',
                color:'#fff',border:'none',borderRadius:10,padding:'10px 16px',
                fontSize:12,fontWeight:800,cursor:engineLoading?'wait':'pointer',
                whiteSpace:'nowrap',
              }}>
              {engineLoading ? '⏳ Generating…' : '✨ Refresh with AI'}
            </button>
          </div>

          {engineError && (
            <div style={{padding:'10px 12px',marginBottom:12,background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.25)',borderRadius:8,fontSize:11.5,color:'#f87171'}}>
              ⚠ {engineError}
            </div>
          )}

          {/* Filter row */}
          <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
            <span style={{fontSize:11,color:'#64748b',fontWeight:700}}>FILTER:</span>
            <select value={engineFilter.platform} onChange={e=>setEngineFilter(f=>({...f,platform:e.target.value}))}
              style={{background:'rgba(255,255,255,.04)',color:'#fff',border:'1px solid rgba(255,255,255,.1)',borderRadius:6,padding:'5px 8px',fontSize:11.5}}>
              <option value="all">All platforms</option>
              <option value="reel">Instagram Reel</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube Short</option>
              <option value="carousel">Instagram Carousel</option>
              <option value="story">Instagram Story</option>
            </select>
            <select value={engineFilter.effort} onChange={e=>setEngineFilter(f=>({...f,effort:e.target.value}))}
              style={{background:'rgba(255,255,255,.04)',color:'#fff',border:'1px solid rgba(255,255,255,.1)',borderRadius:6,padding:'5px 8px',fontSize:11.5}}>
              <option value="all">Any effort</option>
              <option value="5min">5 min</option>
              <option value="15min">15 min</option>
              <option value="20min">20 min</option>
              <option value="30min">30 min</option>
              <option value="45min">45 min</option>
              <option value="60min">1 hr</option>
              <option value="2hrs">2 hrs</option>
            </select>
            <select value={engineFilter.niche} onChange={e=>setEngineFilter(f=>({...f,niche:e.target.value}))}
              style={{background:'rgba(255,255,255,.04)',color:'#fff',border:'1px solid rgba(255,255,255,.1)',borderRadius:6,padding:'5px 8px',fontSize:11.5}}>
              <option value="all">All niches</option>
              <option value="storytelling">Storytelling</option>
              <option value="luxury-tour">Luxury Tour</option>
              <option value="agent-education">Agent Education</option>
              <option value="investor">Investor</option>
              <option value="day-in-life">Day in Life</option>
              <option value="lifestyle">Lifestyle</option>
              <option value="celebrity-listings">Celebrity Listings</option>
              <option value="agent-story">Agent Story</option>
              <option value="sales-training">Sales Training</option>
            </select>
            <span style={{fontSize:10.5,color:'#475569',marginLeft:'auto'}}>{filteredIdeas.length} of {contentIdeas.length} creators · {contentDrafts.length} saved briefs</span>
          </div>

          {/* Creator grid — each card shows a top US RE creator + their viral formula */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(420px, 1fr))',gap:14}}>
            {filteredIdeas.map((idea, idx) => {
              const engagementColor = idea.engagement === 'HIGH' ? '#10b981' : idea.engagement === 'MED' ? '#f0c040' : '#94a3b8';
              // Handle building social URLs from handle
              const handleClean = (idea.handle || '').replace('@','');
              const platformUrl = (idea.platform || '').toLowerCase().includes('tiktok')
                ? `https://tiktok.com/@${handleClean}`
                : (idea.platform || '').toLowerCase().includes('youtube')
                ? `https://youtube.com/${handleClean.startsWith('@')?handleClean:'@'+handleClean}`
                : `https://instagram.com/${handleClean}`;
              return (
                <div key={idx} style={{
                  background:'#0d1117',border:'1px solid rgba(255,255,255,.08)',borderRadius:12,
                  padding:'16px 18px',display:'flex',flexDirection:'column',gap:10,
                  borderLeft:`3px solid ${engagementColor}`,
                }}>
                  {/* Creator header */}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:16,fontWeight:900,color:'#fff',fontFamily:"'DM Serif Display',serif",lineHeight:1.1}}>
                        {idea.creator}
                      </div>
                      <a href={platformUrl} target="_blank" rel="noreferrer" style={{
                        fontSize:11.5,color:'#7eb8f7',textDecoration:'none',fontWeight:600,
                      }}>
                        {idea.handle} ↗
                      </a>
                      <div style={{fontSize:10,color:'#64748b',marginTop:2}}>{idea.location}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:14,fontWeight:900,color:engagementColor,fontFamily:"'DM Serif Display',serif"}}>
                        {idea.followers}
                      </div>
                      <div style={{fontSize:9.5,color:'#94a3b8',marginTop:2}}>followers</div>
                    </div>
                  </div>

                  {/* Meta tags */}
                  <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                    <span style={{fontSize:9,padding:'2px 7px',borderRadius:10,background:'rgba(126,184,247,.12)',color:'#7eb8f7',fontWeight:700}}>{idea.platform}</span>
                    <span style={{fontSize:9,padding:'2px 7px',borderRadius:10,background:'rgba(167,139,250,.12)',color:'#a78bfa',fontWeight:700,textTransform:'uppercase'}}>{idea.niche}</span>
                    <span style={{fontSize:9,padding:'2px 7px',borderRadius:10,background:`${engagementColor}22`,color:engagementColor,fontWeight:800}}>{idea.viralViews}</span>
                  </div>

                  {/* Their viral hook / content type */}
                  <div style={{padding:'8px 10px',background:'rgba(184,134,75,.06)',borderRadius:8,borderLeft:'2px solid #b8864b'}}>
                    <div style={{fontSize:9.5,fontWeight:800,color:'#e0b370',textTransform:'uppercase',letterSpacing:.5,marginBottom:3}}>
                      Signature Hook
                    </div>
                    <div style={{fontSize:12.5,color:'#fff',fontWeight:700,fontStyle:'italic'}}>
                      "{idea.hook}"
                    </div>
                    <div style={{fontSize:10.5,color:'#94a3b8',marginTop:4}}>
                      Type: {idea.contentType}
                    </div>
                  </div>

                  {/* Why it works */}
                  <div style={{fontSize:11,color:'#cbd5e1',lineHeight:1.55,
                    background:'rgba(255,255,255,.02)',padding:'8px 10px',borderRadius:8,
                  }}>
                    <strong style={{color:'#fff'}}>Why it works:</strong> {idea.caption}
                  </div>

                  {/* Formula */}
                  {idea.formula && (
                    <div style={{fontSize:11,color:'#a78bfa',padding:'6px 10px',background:'rgba(167,139,250,.06)',borderRadius:8}}>
                      📐 <strong style={{color:'#fff'}}>Formula:</strong> {idea.formula}
                    </div>
                  )}

                  {/* Adapt for Monica idea */}
                  {idea.adaptIdea && (
                    <div style={{fontSize:11,color:'#6ee7b7',padding:'8px 10px',background:'rgba(16,185,129,.06)',borderRadius:8,borderLeft:'2px solid #10b981'}}>
                      🎯 <strong style={{color:'#fff'}}>Adapt for you:</strong> {idea.adaptIdea}
                    </div>
                  )}

                  {/* Visual cue */}
                  {idea.visual && (
                    <div style={{fontSize:10.5,color:'#94a3b8',fontStyle:'italic'}}>
                      🎬 {idea.visual}
                    </div>
                  )}

                  {/* Hashtags */}
                  <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                    {(idea.hashtags || []).map((h,i) => (
                      <span key={i} style={{fontSize:9.5,color:'#7eb8f7',fontWeight:600}}>{h}</span>
                    ))}
                  </div>

                  {/* Action buttons */}
                  <div style={{display:'flex',gap:6,marginTop:'auto'}}>
                    <a href={platformUrl} target="_blank" rel="noreferrer" style={{
                      flex:1,padding:'8px 12px',
                      background:'rgba(126,184,247,.12)',color:'#7eb8f7',
                      border:'1px solid rgba(126,184,247,.3)',borderRadius:8,
                      fontSize:11.5,fontWeight:800,cursor:'pointer',textDecoration:'none',textAlign:'center',
                    }}>
                      👁 View {(idea.platform||'').split(' ')[0]}
                    </a>
                    <button onClick={()=>handleUseIdea(idea)} style={{
                      flex:1,padding:'8px 12px',
                      background:'linear-gradient(135deg, #b8864b, #e0b370)',
                      color:'#fff',border:'none',borderRadius:8,fontSize:11.5,fontWeight:800,cursor:'pointer',
                    }}>
                      ✨ Adapt for Me
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Drafts log preview */}
          {contentDrafts.length > 0 && (
            <div style={{marginTop:24,padding:'14px 16px',background:'rgba(16,185,129,.04)',border:'1px solid rgba(16,185,129,.15)',borderRadius:10}}>
              <div style={{fontSize:11,fontWeight:800,color:'#6ee7b7',textTransform:'uppercase',letterSpacing:.5,marginBottom:8}}>
                📋 {contentDrafts.length} saved draft{contentDrafts.length===1?'':'s'} (latest 5)
              </div>
              {contentDrafts.slice(0,5).map(d => (
                <div key={d.id} style={{padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,.04)',fontSize:11.5,color:'#94a3b8'}}>
                  <strong style={{color:'#fff'}}>{d.hook}</strong> · {d.platform} · saved {new Date(d.savedAt).toLocaleString()}
                </div>
              ))}
              <button onClick={()=>{ if(window.confirm('Clear all saved drafts?')) setContentDrafts([]); }}
                style={{marginTop:8,background:'none',border:'1px solid rgba(239,68,68,.3)',color:'#f87171',padding:'4px 10px',borderRadius:6,fontSize:10,cursor:'pointer'}}>
                Clear drafts
              </button>
            </div>
          )}
        </div>
      )}

      {/* DIRECTORY TAB */}
      {tab === 'directory' && (
        <div>
          {/* Filter row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 200px', background: 'rgba(255,255,255,.03)', borderRadius: 8, padding: '4px 10px' }}>
              <Search size={14} color="#64748b" />
              <input
                placeholder="Search by name, location, or topic…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ background: 'none', border: 'none', color: '#fff', flex: 1, fontSize: 13, outline: 'none', padding: '6px 0' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => setTagFilter(tag)}
                style={{
                  padding: '6px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  border: `1px solid ${tagFilter === tag ? '#7eb8f7' : 'rgba(255,255,255,.1)'}`,
                  background: tagFilter === tag ? 'rgba(126,184,247,.12)' : 'rgba(255,255,255,.02)',
                  color: tagFilter === tag ? '#7eb8f7' : '#94a3b8',
                }}
              >
                {tag}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {filtered.map(i => (
              <div key={i.id} className="glass-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 2 }}>{i.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>📍 {i.location}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: 'rgba(126,184,247,.15)', color: '#7eb8f7', textTransform: 'uppercase', letterSpacing: '.5px' }}>{i.tag}</span>
                    <button
                      onClick={() => toggleBookmark(i.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: bookmarks.includes(i.id) ? '#fbbf24' : '#475569' }}
                      title={bookmarks.includes(i.id) ? 'Bookmarked' : 'Bookmark'}
                    >
                      <Bookmark size={14} fill={bookmarks.includes(i.id) ? '#fbbf24' : 'none'} />
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.5 }}>{i.whyWatch}</div>

                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.05)' }}>
                  {i.handles.instagram && (
                    <a href={platformUrl('instagram', i.handles.instagram)} target="_blank" rel="noreferrer" className="btn btn-ghost btn-xs" style={{ flex: '1 1 auto' }}>
                      📷 IG
                    </a>
                  )}
                  {i.handles.tiktok && (
                    <a href={platformUrl('tiktok', i.handles.tiktok)} target="_blank" rel="noreferrer" className="btn btn-ghost btn-xs" style={{ flex: '1 1 auto' }}>
                      🎵 TikTok
                    </a>
                  )}
                  {i.handles.youtube && (
                    <a href={platformUrl('youtube', i.handles.youtube)} target="_blank" rel="noreferrer" className="btn btn-ghost btn-xs" style={{ flex: '1 1 auto' }}>
                      ▶ YT
                    </a>
                  )}
                  <button className="btn btn-blue btn-xs" onClick={() => setOpenInfluencer(i)} style={{ flex: '1 1 auto' }}>
                    Details →
                  </button>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => { setPrefillContext({ creatorName: i.name, creatorLocation: i.location, creatorStyle: i.knownFor }); setTab('inspiration'); }}
                    style={{ flex: '1 1 auto' }}
                    title="Pre-fill Adapt a Post with this creator's style"
                  >
                    <Sparkles size={10} /> Adapt their style
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FEED TAB — unified view: YouTube auto + manually-saved IG/TikTok inspirations */}
      {tab === 'feed' && (
        <UnifiedFeed
          toast={toast}
          bookmarks={bookmarks}
          library={library}
          setLibrary={setLibrary}
          onAdapt={(ctx) => { setPrefillContext(ctx); setTab('inspiration'); }}
        />
      )}

      {/* INSPIRATION TAB */}
      {tab === 'inspiration' && (
        <InspirationCapture
          toast={toast}
          prefill={prefillContext}
          onClearPrefill={() => setPrefillContext(null)}
          onSaveToLibrary={(item) => setLibrary(prev => [{ ...item, id: `lib_${Date.now()}`, savedAt: new Date().toISOString() }, ...prev])}
        />
      )}

      {/* YOUTUBE TAB */}
      {tab === 'youtube' && (
        <YouTubeTracker
          toast={toast}
          bookmarks={bookmarks}
          onAdapt={(ctx) => { setPrefillContext(ctx); setTab('inspiration'); }}
        />
      )}

      {/* LIBRARY TAB */}
      {tab === 'library' && (
        <SavedLibrary
          toast={toast}
          library={library}
          setLibrary={setLibrary}
        />
      )}

      {/* Influencer detail modal */}
      {openInfluencer && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setOpenInfluencer(null)}
        >
          <div
            style={{ background: '#0d1117', borderRadius: 16, padding: '24px 28px', maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid rgba(255,255,255,.1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: "'DM Serif Display',serif" }}>{openInfluencer.name}</div>
                <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>📍 {openInfluencer.location}</div>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setOpenInfluencer(null)}><X size={14} /></button>
            </div>

            <div style={{ padding: '12px 14px', background: 'rgba(126,184,247,.06)', borderRadius: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#7eb8f7', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Why watch them</div>
              <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>{openInfluencer.whyWatch}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,.03)', borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>Known For</div>
                <div style={{ fontSize: 12, color: '#cbd5e1' }}>{openInfluencer.knownFor}</div>
              </div>
              <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,.03)', borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>Followers</div>
                <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                  {Object.entries(openInfluencer.followers).map(([k, v]) => <div key={k}>{k}: {v}</div>)}
                </div>
              </div>
            </div>

            <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,.03)', borderRadius: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Best formats to study</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {openInfluencer.bestFormats?.map(f => (
                  <span key={f} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, background: 'rgba(167,139,250,.1)', color: '#a78bfa' }}>{f}</span>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {openInfluencer.handles.instagram && (
                <a href={platformUrl('instagram', openInfluencer.handles.instagram)} target="_blank" rel="noreferrer" className="btn btn-blue btn-sm" style={{ flex: 1 }}>
                  📷 Open Instagram
                </a>
              )}
              {openInfluencer.handles.tiktok && (
                <a href={platformUrl('tiktok', openInfluencer.handles.tiktok)} target="_blank" rel="noreferrer" className="btn btn-blue btn-sm" style={{ flex: 1 }}>
                  🎵 Open TikTok
                </a>
              )}
              {openInfluencer.handles.youtube && (
                <a href={platformUrl('youtube', openInfluencer.handles.youtube)} target="_blank" rel="noreferrer" className="btn btn-blue btn-sm" style={{ flex: 1 }}>
                  ▶ Open YouTube
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── INSPIRATION CAPTURE — paste a URL or describe a post, AI adapts ────────
const InspirationCapture = ({ toast, prefill, onClearPrefill, onSaveToLibrary }) => {
  const [sourceUrl, setSourceUrl] = useState(prefill?.sourceUrl || '');
  const [description, setDescription] = useState(prefill?.description || '');
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [profile] = useLS('re_profile', { name: 'Monica Iskra' });
  const [creatorContext, setCreatorContext] = useState(prefill?.creatorName ? `${prefill.creatorName} (${prefill.creatorLocation}) — known for: ${prefill.creatorStyle}` : '');

  // When prefill changes (handoff from another tab), update inputs
  useEffect(() => {
    if (prefill?.sourceUrl) setSourceUrl(prefill.sourceUrl);
    if (prefill?.description) setDescription(prefill.description);
    if (prefill?.creatorName) {
      setCreatorContext(`${prefill.creatorName} (${prefill.creatorLocation}) — known for: ${prefill.creatorStyle}`);
    }
  }, [prefill]);

  const analyze = async () => {
    if (!description.trim() && !sourceUrl.trim()) {
      return toast.error('Paste a URL OR describe the post you saw (hook, format, what happened)');
    }
    setBusy(true);
    setAnalysis(null);
    try {
      const sys = `You are a viral real-estate content analyst. The user is ${profile.name || 'Monica Iskra'} — a real estate agent in the I-275 corridor of Metro Detroit (Livonia, Plymouth, Novi, Northville, Farmington, Farmington Hills, Canton) at the $350K+ price band. They've seen a piece of content on Instagram or TikTok or YouTube and want to (1) understand what made it work and (2) adapt it for their market.

Return STRICT JSON only (no markdown fences):
{
  "originalAnalysis": {
    "hook": "what the hook structure was",
    "format": "Reel / Carousel / TikTok / Short / etc.",
    "whyItWorked": "the psychological + algorithmic reasons",
    "keyElements": ["specific element 1", "specific element 2", "..."]
  },
  "monicaAdaptation": {
    "hook": "Monica's version of the hook tuned for Metro Detroit $350K+",
    "script": "full shoot-ready script (sec by sec or as paragraph)",
    "filmingNotes": "literal shot list",
    "caption": "80-125 char caption",
    "hashtags": ["#realestate", "..."],
    "format": "format spec (length, vertical, captions, etc.)"
  },
  "warnings": "any compliance / legal / brand-voice concerns when adapting this"
}`;

      const prompt = `Analyze this content + adapt it for Monica.

${creatorContext ? `CREATOR CONTEXT: ${creatorContext}` : ''}
${sourceUrl ? `SOURCE URL: ${sourceUrl}` : ''}
${description ? `WHAT I SAW:\n${description}` : ''}`;

      const r = await fetch('/api/claude/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          system: sys,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      const text = (d.content?.[0]?.text || '').trim();
      const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(jsonText);
      setAnalysis(parsed);
      toast.success('Analysis ready');
    } catch (e) {
      console.error(e);
      toast.error(`AI analysis failed: ${e.message}`);
    }
    setBusy(false);
  };

  const copy = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  return (
    <div>
      <div className="glass-card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Adapt any viral post for your market</div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12, lineHeight: 1.5 }}>
          Saw a great Reel/TikTok/YouTube short on someone else's profile? Paste the URL OR describe what you saw. AI breaks down why it worked and writes your version tuned for Metro Detroit $350K+.
        </div>

        {creatorContext && (
          <div style={{ padding: '10px 12px', background: 'rgba(126,184,247,.06)', borderRadius: 8, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#cbd5e1' }}>
              <strong style={{ color: '#7eb8f7' }}>Creator context:</strong> {creatorContext}
            </div>
            <button className="btn btn-ghost btn-xs" onClick={() => { setCreatorContext(''); onClearPrefill?.(); }}><X size={11} /></button>
          </div>
        )}

        <div className="label" style={{ marginBottom: 4 }}>Source URL (optional)</div>
        <input
          className="input"
          placeholder="https://instagram.com/reel/… or tiktok.com/@user/video/…"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          style={{ marginBottom: 10, fontFamily: 'monospace', fontSize: 12 }}
        />

        <div className="label" style={{ marginBottom: 4 }}>What you saw (recommended — describe the post)</div>
        <textarea
          className="textarea"
          style={{ minHeight: 110 }}
          placeholder={`e.g. "Glennda Baker did a 30-sec Reel walking through a $1.2M Atlanta home. Hook was 'You guys are NOT going to believe what the seller did.' Big personality, screenshotted MLS photos, ended with 'Save this if you are house hunting in Atlanta.' Got 2M+ views."`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <button className="btn btn-blue" onClick={analyze} disabled={busy} style={{ marginTop: 10, width: '100%', padding: '12px 14px' }}>
          {busy ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing…</> : <><Sparkles size={13} /> Analyze + adapt for me</>}
        </button>
      </div>

      {analysis && (
        <div className="glass-card" style={{ background: 'linear-gradient(135deg, rgba(167,139,250,.08), rgba(16,185,129,.04))', borderColor: 'rgba(167,139,250,.25)' }}>
          {/* Original analysis */}
          <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Why the original worked</div>
            <DetailBlock label="Hook" value={analysis.originalAnalysis?.hook} />
            <DetailBlock label="Format" value={analysis.originalAnalysis?.format} />
            <DetailBlock label="Why it worked" value={analysis.originalAnalysis?.whyItWorked} />
            {analysis.originalAnalysis?.keyElements?.length > 0 && (
              <DetailBlock label="Key elements" value={analysis.originalAnalysis.keyElements.map(e => '• ' + e).join('\n')} />
            )}
          </div>

          {/* Monica's version */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 6, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '.5px' }}>✨ Your adapted version</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {onSaveToLibrary && (
                  <button className="btn btn-blue btn-xs" onClick={() => {
                    onSaveToLibrary({
                      title: analysis.monicaAdaptation?.hook?.slice(0, 60) || 'Untitled adaptation',
                      creator: creatorContext || null,
                      sourceUrl: sourceUrl || null,
                      sourceDescription: description || null,
                      originalAnalysis: analysis.originalAnalysis,
                      adaptation: analysis.monicaAdaptation,
                    });
                    toast.success('Saved to library');
                  }}><Bookmark size={10} /> Save to Library</button>
                )}
                <button className="btn btn-ghost btn-xs" onClick={() => copy(
                  `HOOK: ${analysis.monicaAdaptation?.hook}\n\nSCRIPT: ${analysis.monicaAdaptation?.script}\n\nFILMING: ${analysis.monicaAdaptation?.filmingNotes}\n\nCAPTION: ${analysis.monicaAdaptation?.caption}\n\nHASHTAGS: ${(analysis.monicaAdaptation?.hashtags || []).join(' ')}\n\nFORMAT: ${analysis.monicaAdaptation?.format}`,
                  'Full adaptation'
                )}><Copy size={10} /> Copy all</button>
              </div>
            </div>
            <DetailBlock label="Hook" value={analysis.monicaAdaptation?.hook} onCopy={(v) => copy(v, 'Hook')} />
            <DetailBlock label="Script" value={analysis.monicaAdaptation?.script} onCopy={(v) => copy(v, 'Script')} />
            <DetailBlock label="Filming notes" value={analysis.monicaAdaptation?.filmingNotes} onCopy={(v) => copy(v, 'Filming notes')} />
            <DetailBlock label="Caption" value={analysis.monicaAdaptation?.caption} onCopy={(v) => copy(v, 'Caption')} />
            {analysis.monicaAdaptation?.hashtags?.length > 0 && (
              <DetailBlock label="Hashtags" value={analysis.monicaAdaptation.hashtags.join(' ')} onCopy={(v) => copy(v, 'Hashtags')} />
            )}
            <DetailBlock label="Format spec" value={analysis.monicaAdaptation?.format} />
          </div>

          {analysis.warnings && (
            <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#fbbf24', marginBottom: 4 }}>⚠ Warnings</div>
              <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>{analysis.warnings}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const DetailBlock = ({ label, value, onCopy }) => {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</span>
        {onCopy && <button className="btn btn-ghost btn-xs" onClick={() => onCopy(value)}><Copy size={10} /></button>}
      </div>
      <div style={{ fontSize: 13, color: '#fff', padding: '8px 10px', background: 'rgba(255,255,255,.03)', borderRadius: 6, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{value}</div>
    </div>
  );
};

// ── YOUTUBE TRACKER — auto-pull recent videos via YouTube Data API ──────────
const YouTubeTracker = ({ toast, bookmarks, onAdapt }) => {
  const [apiKey, setApiKey] = useLS('youtube_api_key', '');
  const [keyInput, setKeyInput] = useState('');
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Map influencer handles to YT search queries (handle resolution needs
  // a separate channels.list call; we use search.list with the channel name
  // as a query for simplicity)
  const watchList = INFLUENCERS.filter(i => i.handles.youtube);

  const saveKey = () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return toast.error('Paste your YouTube Data API key first');
    setApiKey(trimmed);
    setKeyInput('');
    toast.success('YouTube API key saved');
  };

  const clearKey = () => { setApiKey(''); setVideos([]); };

  const loadRecent = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true); setError(''); setVideos([]);
    const allVideos = [];
    const channelsToScan = bookmarks?.length > 0
      ? watchList.filter(i => bookmarks.includes(i.id))
      : watchList.slice(0, 8); // default: first 8 if no bookmarks
    try {
      for (const inf of channelsToScan) {
        // 1) Resolve channel handle -> channel ID
        const handleClean = inf.handles.youtube.replace('@', '');
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(handleClean)}&type=channel&maxResults=1&key=${apiKey}`;
        const sr = await fetch(searchUrl);
        if (!sr.ok) continue;
        const sd = await sr.json();
        const channelId = sd.items?.[0]?.id?.channelId;
        if (!channelId) continue;

        // 2) Pull recent videos from that channel
        const videosUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=4&type=video&key=${apiKey}`;
        const vr = await fetch(videosUrl);
        if (!vr.ok) continue;
        const vd = await vr.json();

        // 3) Get stats (views, likes) via videos.list
        const ids = (vd.items || []).map(v => v.id?.videoId).filter(Boolean);
        if (ids.length === 0) continue;
        const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails&id=${ids.join(',')}&key=${apiKey}`;
        const stR = await fetch(statsUrl);
        const stD = await stR.json();
        (stD.items || []).forEach(v => {
          allVideos.push({
            id: v.id,
            title: v.snippet.title,
            channel: inf.name,
            channelHandle: inf.handles.youtube,
            publishedAt: v.snippet.publishedAt,
            thumbnail: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url,
            views: parseInt(v.statistics?.viewCount || 0),
            likes: parseInt(v.statistics?.likeCount || 0),
            duration: v.contentDetails?.duration || '',
            url: `https://youtube.com/watch?v=${v.id}`,
            tag: inf.tag,
          });
        });
      }
      // sort by view velocity (views / days since posted)
      const withVelocity = allVideos.map(v => {
        const daysSince = Math.max(1, (Date.now() - new Date(v.publishedAt).getTime()) / 86400000);
        return { ...v, velocity: Math.round(v.views / daysSince) };
      });
      withVelocity.sort((a, b) => b.velocity - a.velocity);
      setVideos(withVelocity);
    } catch (e) {
      console.error(e);
      setError(e.message);
    }
    setLoading(false);
  }, [apiKey, bookmarks, watchList]);

  useEffect(() => {
    if (apiKey) loadRecent();
  }, [apiKey, loadRecent]);

  // ── Not-connected state ──
  if (!apiKey) {
    return (
      <div className="glass-card">
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 28, color: '#ff0000', flexShrink: 0, marginTop: 2 }}>▶</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Auto-track real estate creators on YouTube</div>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 14 }}>
              Add a <strong style={{ color: '#10b981' }}>free YouTube Data API key</strong> (10K queries/day free tier — way more than you'll use). The tracker pulls recent videos from the directory, sorts by view velocity, and surfaces breakout content from the last 30 days.
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Setup (~3 min, no credit card):</div>
            <ol style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.8, paddingLeft: 22, marginBottom: 14 }}>
              <li>Open <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer" style={{ color: '#7eb8f7' }}>YouTube Data API v3 in Google Cloud Console</a> (sign in with the same Google account you use for Gmail/Business Profile)</li>
              <li>Click <strong>Enable</strong></li>
              <li>Go to <strong>Credentials</strong> → <strong>+ Create Credentials</strong> → <strong>API Key</strong></li>
              <li>Copy the key, paste below</li>
            </ol>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                placeholder="AIzaSy..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
              />
              <button className="btn btn-blue btn-sm" onClick={saveKey}>Save Key</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>
          Tracking {bookmarks?.length > 0 ? `${bookmarks.length} bookmarked` : 'the top 8'} creators · sorted by view velocity (views/day since post)
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={loadRecent} disabled={loading}>
            <RefreshCw size={11} style={loading ? { animation: 'spin 1s linear infinite' } : {}} /> Refresh
          </button>
          <button className="btn btn-ghost btn-sm" onClick={clearKey}>Reset key</button>
        </div>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: '12px 14px', background: 'rgba(239,68,68,.08)', borderColor: 'rgba(239,68,68,.25)', marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: '#f87171' }}>{error}</div>
        </div>
      )}

      {loading && videos.length === 0 && (
        <div className="glass-card" style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
          <div>Pulling recent videos from {bookmarks?.length > 0 ? `${bookmarks.length}` : '8'} channels…</div>
        </div>
      )}

      {videos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {videos.map(v => (
            <div key={v.id} className="glass-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {v.thumbnail && (
                <a href={v.url} target="_blank" rel="noreferrer" style={{ aspectRatio: '16/9', background: '#000', position: 'relative', overflow: 'hidden', display: 'block' }}>
                  <img src={v.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </a>
              )}
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                <a href={v.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textDecoration: 'none' }}>{v.title}</a>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{v.channel}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#64748b' }}>
                  <span><Eye size={10} style={{ display: 'inline', marginRight: 3 }} />{v.views.toLocaleString()}</span>
                  <span><Heart size={10} style={{ display: 'inline', marginRight: 3 }} />{v.likes.toLocaleString()}</span>
                  <span style={{ fontWeight: 800, color: '#10b981' }}>{v.velocity.toLocaleString()}/day</span>
                </div>
                <div style={{ fontSize: 10, color: '#475569' }}>{new Date(v.publishedAt).toLocaleDateString()}</div>
                {onAdapt && (
                  <button
                    className="btn btn-blue btn-xs"
                    style={{ marginTop: 'auto' }}
                    onClick={() => onAdapt({
                      sourceUrl: v.url,
                      description: `YouTube video from ${v.channel}: "${v.title}". Got ${v.views.toLocaleString()} views (${v.velocity.toLocaleString()}/day velocity), ${v.likes.toLocaleString()} likes. Posted ${new Date(v.publishedAt).toLocaleDateString()}.`,
                      creatorName: v.channel,
                    })}
                  >
                    <Sparkles size={11} /> Adapt this for my market
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── UNIFIED FEED — combines auto-tracked YT videos + manually-saved IG/TikTok ──
const UnifiedFeed = ({ toast, bookmarks, library, setLibrary, onAdapt }) => {
  const [apiKey] = useLS('youtube_api_key', '');
  const [ytVideos, setYtVideos] = useState([]);
  const [loadingYT, setLoadingYT] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualPlatform, setManualPlatform] = useState('instagram');
  const [savedManuals, setSavedManuals] = useLS('manual_inspirations', []);

  // Load YT videos for the feed if API key set
  const watchList = INFLUENCERS.filter(i => i.handles.youtube);
  const loadYT = useCallback(async () => {
    if (!apiKey) return;
    setLoadingYT(true);
    const all = [];
    const channels = bookmarks?.length > 0
      ? watchList.filter(i => bookmarks.includes(i.id))
      : watchList.slice(0, 5);
    try {
      for (const inf of channels) {
        const handleClean = inf.handles.youtube.replace('@', '');
        const sr = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(handleClean)}&type=channel&maxResults=1&key=${apiKey}`);
        if (!sr.ok) continue;
        const sd = await sr.json();
        const cid = sd.items?.[0]?.id?.channelId;
        if (!cid) continue;
        const vr = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${cid}&order=date&maxResults=2&type=video&key=${apiKey}`);
        if (!vr.ok) continue;
        const vd = await vr.json();
        const ids = (vd.items || []).map(v => v.id?.videoId).filter(Boolean);
        if (!ids.length) continue;
        const stR = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${ids.join(',')}&key=${apiKey}`);
        const stD = await stR.json();
        (stD.items || []).forEach(v => {
          all.push({
            id: v.id, type: 'youtube',
            title: v.snippet.title, channel: inf.name,
            publishedAt: v.snippet.publishedAt,
            thumbnail: v.snippet.thumbnails?.medium?.url,
            views: parseInt(v.statistics?.viewCount || 0),
            likes: parseInt(v.statistics?.likeCount || 0),
            url: `https://youtube.com/watch?v=${v.id}`,
          });
        });
      }
      setYtVideos(all);
    } catch (e) {
      console.warn(e);
    }
    setLoadingYT(false);
  }, [apiKey, bookmarks, watchList]);

  useEffect(() => { loadYT(); }, [loadYT]);

  const addManual = () => {
    if (!manualUrl.trim() && !manualDesc.trim()) return toast.error('Paste a URL or describe the post');
    setSavedManuals(prev => [{
      id: `m_${Date.now()}`,
      type: manualPlatform,
      url: manualUrl.trim(),
      description: manualDesc.trim(),
      savedAt: new Date().toISOString(),
    }, ...prev]);
    setManualUrl(''); setManualDesc('');
    toast.success('Saved to feed');
  };

  const deleteManual = (id) => setSavedManuals(prev => prev.filter(m => m.id !== id));

  // Merge YT + manual inspirations into one feed, sorted by date
  const feed = [
    ...ytVideos.map(v => ({ ...v, _date: v.publishedAt })),
    ...savedManuals.map(m => ({ ...m, _date: m.savedAt })),
  ].sort((a, b) => new Date(b._date) - new Date(a._date));

  return (
    <div>
      {/* Add manual inspiration card */}
      <div className="glass-card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 8 }}>📌 Add an IG / TikTok inspiration to your feed</div>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, marginBottom: 8 }}>
          <select className="select" value={manualPlatform} onChange={(e) => setManualPlatform(e.target.value)}>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube</option>
            <option value="other">Other</option>
          </select>
          <input className="input" placeholder="URL of the post (optional)" value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />
        </div>
        <textarea
          className="textarea"
          style={{ minHeight: 60, marginBottom: 8 }}
          placeholder={`Describe the post — who, what hook, how it performed if you know. e.g. "Glennda Baker did a 30-sec Reel walking through a $1.2M home in Atlanta — hook was 'You guys are NOT going to believe...'"`}
          value={manualDesc}
          onChange={(e) => setManualDesc(e.target.value)}
        />
        <button className="btn btn-blue btn-sm" onClick={addManual}>📌 Save to feed</button>
      </div>

      {/* Combined feed */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
          🔥 Your Inspiration Feed ({feed.length})
        </div>
        {apiKey && (
          <button className="btn btn-ghost btn-sm" onClick={loadYT} disabled={loadingYT}>
            <RefreshCw size={11} style={loadingYT ? { animation: 'spin 1s linear infinite' } : {}} /> Refresh YT
          </button>
        )}
      </div>

      {!apiKey && (
        <div className="glass-card" style={{ padding: '12px 14px', background: 'rgba(245,158,11,.04)', borderColor: 'rgba(245,158,11,.2)', marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>
            💡 Add a free <strong>YouTube API key</strong> in the YouTube Tracker tab to auto-include recent videos from your bookmarked creators here.
          </div>
        </div>
      )}

      {feed.length === 0 ? (
        <div className="glass-card" style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>
          Your feed is empty. Save an IG/TikTok post above, or set up YouTube tracking to auto-populate.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {feed.map(item => (
            <div key={item.id} className="glass-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {item.type === 'youtube' ? (
                <>
                  {item.thumbnail && (
                    <a href={item.url} target="_blank" rel="noreferrer" style={{ aspectRatio: '16/9', background: '#000', display: 'block', overflow: 'hidden' }}>
                      <img src={item.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </a>
                  )}
                  <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#ff0000' }}>▶</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#ff0000', textTransform: 'uppercase' }}>YouTube</span>
                    </div>
                    <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.4, textDecoration: 'none', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.title}</a>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.channel}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#64748b' }}>
                      <span><Eye size={10} /> {item.views.toLocaleString()}</span>
                      <span><Heart size={10} /> {item.likes.toLocaleString()}</span>
                    </div>
                    <button
                      className="btn btn-blue btn-xs"
                      style={{ marginTop: 'auto' }}
                      onClick={() => onAdapt({
                        sourceUrl: item.url,
                        description: `YouTube video from ${item.channel}: "${item.title}". Views: ${item.views.toLocaleString()}, Likes: ${item.likes.toLocaleString()}.`,
                        creatorName: item.channel,
                      })}
                    >
                      <Sparkles size={11} /> Adapt this
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 5, background: 'rgba(167,139,250,.15)' }}>
                      {item.type}
                    </span>
                    <button onClick={() => deleteManual(item.id)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><X size={12} /></button>
                  </div>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#7eb8f7', wordBreak: 'break-all', textDecoration: 'none' }}>
                      <ExternalLink size={10} style={{ display: 'inline', marginRight: 3 }} />{item.url.slice(0, 60)}{item.url.length > 60 ? '…' : ''}
                    </a>
                  )}
                  <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5, flex: 1 }}>{item.description}</div>
                  <div style={{ fontSize: 10, color: '#475569' }}>Saved {new Date(item.savedAt).toLocaleDateString()}</div>
                  <button
                    className="btn btn-blue btn-xs"
                    style={{ marginTop: 'auto' }}
                    onClick={() => onAdapt({
                      sourceUrl: item.url,
                      description: item.description,
                    })}
                  >
                    <Sparkles size={11} /> Adapt this
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── SAVED LIBRARY — adapted content scripts she's saved ────────────────────
const SavedLibrary = ({ toast, library, setLibrary }) => {
  const [openItem, setOpenItem] = useState(null);
  const copy = (text, label) => { navigator.clipboard.writeText(text); toast.success(`${label} copied`); };

  if (library.length === 0) {
    return (
      <div className="glass-card" style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>
        <Bookmark size={32} color="#475569" style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>No saved adaptations yet</div>
        <div style={{ fontSize: 12 }}>Adapt a post and click "Save to Library" to start your swipe file.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>
        Your swipe file of AI-adapted content scripts — every "Save to Library" click lands here.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {library.map(item => (
          <div key={item.id} className="glass-card" style={{ padding: 14, cursor: 'pointer' }} onClick={() => setOpenItem(item)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{item.title}</div>
                {item.creator && <div style={{ fontSize: 11, color: '#7eb8f7', marginBottom: 4 }}>Inspired by: {item.creator}</div>}
                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {item.adaptation?.hook}
                </div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>Saved {new Date(item.savedAt).toLocaleDateString()}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setLibrary(prev => prev.filter(l => l.id !== item.id)); }} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><X size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {/* Detail modal */}
      {openItem && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setOpenItem(null)}
        >
          <div style={{ background: '#0d1117', borderRadius: 16, padding: '24px 28px', maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid rgba(255,255,255,.1)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', fontFamily: "'DM Serif Display',serif" }}>{openItem.title}</div>
                {openItem.creator && <div style={{ fontSize: 12, color: '#7eb8f7', marginTop: 4 }}>Inspired by: {openItem.creator}</div>}
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setOpenItem(null)}><X size={14} /></button>
            </div>
            <DetailBlock label="Hook" value={openItem.adaptation?.hook} onCopy={(v) => copy(v, 'Hook')} />
            <DetailBlock label="Script" value={openItem.adaptation?.script} onCopy={(v) => copy(v, 'Script')} />
            <DetailBlock label="Filming notes" value={openItem.adaptation?.filmingNotes} onCopy={(v) => copy(v, 'Filming notes')} />
            <DetailBlock label="Caption" value={openItem.adaptation?.caption} onCopy={(v) => copy(v, 'Caption')} />
            {openItem.adaptation?.hashtags?.length > 0 && (
              <DetailBlock label="Hashtags" value={openItem.adaptation.hashtags.join(' ')} onCopy={(v) => copy(v, 'Hashtags')} />
            )}
            <DetailBlock label="Format" value={openItem.adaptation?.format} />
            <button className="btn btn-blue" onClick={() => copy(
              `HOOK: ${openItem.adaptation?.hook}\n\nSCRIPT: ${openItem.adaptation?.script}\n\nFILMING: ${openItem.adaptation?.filmingNotes}\n\nCAPTION: ${openItem.adaptation?.caption}\n\nHASHTAGS: ${(openItem.adaptation?.hashtags || []).join(' ')}\n\nFORMAT: ${openItem.adaptation?.format}`,
              'Full script'
            )} style={{ width: '100%', marginTop: 10 }}>
              <Copy size={12} /> Copy entire script
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InfluencerWatch;
