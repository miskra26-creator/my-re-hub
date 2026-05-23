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

import { useState, useEffect, useCallback } from 'react';
import { useLS } from './cloudHooks';
import {
  Users, ExternalLink, Eye, Heart, Copy, Sparkles, RefreshCw, X,
  Search, Bookmark,
} from 'lucide-react';

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
  { hook: '"Why this $1.4M Birmingham home will sell in 3 days"', platform: 'Instagram Reel', niche: 'luxury-tour', effort: '30min', engagement: 'HIGH', caption: '3 things buyers will fight over here:\n\n1️⃣ Walk-in pantry bigger than most NYC apartments\n2️⃣ Heated garage (you Detroit folks know)\n3️⃣ Primary suite with private balcony overlooking Quarton Lake\n\nWho do I tour this one with? 👇', hashtags: ['#BirminghamMI', '#MetroDetroitLuxury', '#OaklandCountyRealEstate', '#LuxuryHomesMichigan', '#MichiganRealtor'], visual: 'Slow-motion walkthrough hero shot, focus on natural light from window, then quick cuts of 3 features' },
  { hook: '"POV: You said yes to the Bloomfield Hills house"', platform: 'TikTok', niche: 'lifestyle', effort: '15min', engagement: 'HIGH', caption: 'When clients close on their dream home, this is the moment.\n\nNo script. No staging. Just real joy.\n\nThinking about buying in Bloomfield Hills? My DMs are open 💛', hashtags: ['#BloomfieldHills', '#ClosingDay', '#RealEstateAgent', '#MichiganRealtor', '#LuxuryLifestyle'], visual: 'Phone shot of clients getting keys, slow-mo of them walking into empty house, golden hour' },
  { hook: '"3 mistakes first-time luxury buyers in Michigan ALWAYS make"', platform: 'Instagram Reel', niche: 'educational', effort: '20min', engagement: 'MED', caption: 'I\'ve helped 100+ families buy in Oakland County. Here\'s what trips up first-time luxury buyers:\n\n❌ Falling in love before pre-approval\n❌ Skipping the sewer inspection in older Birmingham homes\n❌ Underestimating winter heating costs on 5000+ sqft\n\nSave this for when you\'re ready 📌', hashtags: ['#OaklandCountyRealEstate', '#FirstTimeLuxuryBuyer', '#MichiganRealEstate', '#BirminghamMI', '#HomeBuyingTips'], visual: 'Talking head with text overlay for each mistake, B-roll of homes in background' },
  { hook: '"Why Birmingham real estate jumped 12% this year"', platform: 'YouTube Short', niche: 'market', effort: '45min', engagement: 'MED', caption: 'Birmingham\'s appreciation outpaced the national average AGAIN. Here\'s why:\n\n• Detroit auto sector rebound\n• Walkable downtown + restaurant scene\n• Top-rated school district (Birmingham Public Schools = top 5 in MI)\n• Limited new construction = scarcity\n\nIf you own here, congrats. If you\'re thinking about buying, let\'s talk before prices climb again.', hashtags: ['#BirminghamMarket2026', '#MetroDetroitMarket', '#OaklandCountyHomes', '#MichiganRealEstate'], visual: 'Stock chart animation + drone shot of downtown Birmingham + agent talking head' },
  { hook: '"Day in the life of a Metro Detroit luxury agent"', platform: 'Instagram Reel', niche: 'day-in-life', effort: '2hrs', engagement: 'HIGH', caption: '6am ☕ Coffee + client emails from Bloomfield\n9am 📞 Listing strategy call with sellers in Novi\n11am 🏡 Showing 3 homes in Birmingham\n2pm 📋 Offer review at the brokerage\n5pm 🎉 Closing celebration with my buyers\n9pm 📱 Final emails of the day\n\nSomeone wanted to know what this job really looks like 👆', hashtags: ['#MichiganRealtor', '#DayInTheLife', '#LuxuryRealEstate', '#MetroDetroit', '#WomenInRealEstate'], visual: 'Quick cuts of each timestamped activity, time stamps as text overlay, upbeat music' },
  { hook: '"This $850K Novi home sold in 4 days. Here\'s why."', platform: 'TikTok', niche: 'luxury-tour', effort: '30min', engagement: 'HIGH', caption: 'Marketing matters MORE than price when listing a home.\n\nWhat we did differently:\n📸 Twilight photography (sold in 4 days)\n🎥 Drone tour for the lake views\n📋 Pre-listing inspection cleared concerns upfront\n🎯 Targeted ads to Novi buyers\n\nThinking of selling? DM me before you sign with anyone.', hashtags: ['#NoviMichigan', '#HomeSellingTips', '#MetroDetroitRealEstate', '#LuxuryHomes'], visual: 'Before/after of listing photos, fast cuts of staging, drone shot of property' },
  { hook: '"What $500K buys you in Birmingham vs Bloomfield"', platform: 'Instagram Carousel', niche: 'market', effort: '30min', engagement: 'HIGH', caption: 'Swipe to compare ➡️\n\nSame budget. Wildly different homes.\n\nBirmingham: 3-bed colonial, walk to downtown, 1950s build\nBloomfield: 4-bed ranch on 1/2 acre, top schools, 1980s build\n\nWhich would YOU pick? Comment below 👇', hashtags: ['#BirminghamMI', '#BloomfieldHills', '#NeighborhoodComparison', '#MetroDetroitHomes'], visual: '10-image carousel: 5 images per home, price labels, side-by-side comparisons' },
  { hook: '"Walking you through this Northville new build"', platform: 'YouTube Short', niche: 'luxury-tour', effort: '45min', engagement: 'MED', caption: 'Just listed: brand new construction in Northville.\n\n5 beds | 4.5 baths | 4,800 sqft | $1.275M\n\nFeatures:\n✨ 10ft ceilings on main level\n✨ Chef\'s kitchen with Wolf appliances\n✨ Heated 3-car garage\n✨ Finished basement with wet bar\n\nFull tour link in bio. Showings start Friday.', hashtags: ['#NorthvilleMI', '#NewConstruction', '#LuxuryHomes', '#MetroDetroitRealEstate'], visual: 'Smooth gimbal walkthrough, starting at front door, ending at backyard sunset' },
  { hook: '"5 things I tell every Metro Detroit buyer about winter"', platform: 'Instagram Reel', niche: 'educational', effort: '15min', engagement: 'MED', caption: 'Out-of-state buyers always ask. Here\'s the truth:\n\n🥶 Yes, it gets cold. Salt your driveway.\n❄️ Heated garages are worth every penny\n🏠 Check the furnace age (replace = $5-8k)\n🍂 Gutter guards prevent ice dams\n☃️ Snow blowers > shovels after age 35\n\nSurviving 8 Michigan winters in luxury 💁‍♀️', hashtags: ['#MetroDetroit', '#MichiganLiving', '#WinterHomeTips', '#NewToMichigan'], visual: 'Snowy exterior shots + cozy interior cuts + agent talking with coffee' },
  { hook: '"The Bloomfield Hills home that started a bidding war"', platform: 'TikTok', niche: 'luxury-tour', effort: '30min', engagement: 'HIGH', caption: 'Listed Friday. 11 offers by Sunday. Closed for $145K OVER asking.\n\nWhat made this listing explode:\n• Twilight photos hit Instagram before MLS\n• Pre-showing private agent tour built urgency\n• Honest disclosure of every flaw (buyers trust this)\n• Multiple-offer protocol set clear rules\n\nMy approach isn\'t magic. It\'s strategy.', hashtags: ['#BloomfieldHills', '#BiddingWar', '#ListingAgent', '#MetroDetroitLuxury'], visual: 'Stack of offers fanned out + drone of house + closing celebration shot' },
  { hook: '"What\'s actually happening with mortgage rates right now"', platform: 'Instagram Reel', niche: 'market', effort: '20min', engagement: 'MED', caption: 'I\'m not a lender, but here\'s what I\'m seeing on actual closings:\n\n📈 Conventional 30yr: high 6\'s\n💰 Jumbo (over $766K): high 6\'s to low 7\'s\n🏦 Best deals: local credit unions beat the big banks\n⏰ Buyers waiting for "perfect rate" are missing inventory\n\nTalk to a lender BEFORE you look. Need a great one? DM me.', hashtags: ['#MortgageRates2026', '#MichiganRealEstate', '#HomeBuying', '#MetroDetroit'], visual: 'Talking head with rate graphic text overlay, B-roll of home for sale signs' },
  { hook: '"Open house this Sunday in West Bloomfield"', platform: 'Instagram Story', niche: 'listing-promo', effort: '5min', engagement: 'LOW', caption: 'OPEN HOUSE 🏡\n\n📍 Address in story link\n🕐 Sunday 1-3pm\n💰 $895,000\n🛏 4 beds | 3.5 baths | 3,200 sqft\n\nNo appointment needed. Coffee + cookies provided ☕🍪', hashtags: ['#OpenHouse', '#WestBloomfield', '#MetroDetroitHomes'], visual: 'Map pin animation + 3 photos of home + branded story template' },
  { hook: '"Behind-the-scenes of pricing a $2M Bloomfield home"', platform: 'YouTube Short', niche: 'educational', effort: '45min', engagement: 'MED', caption: 'Pricing luxury isn\'t about Zestimate. It\'s about:\n\n1. Recent SOLDs in same micro-market\n2. Active comps + their days on market\n3. Unique features (lake view? private dock?)\n4. Seller timeline (motivated? testing?)\n5. Current buyer pool depth\n\nMost agents skip 3-5. That\'s why they overprice and chase the market down.', hashtags: ['#LuxuryRealEstate', '#PricingStrategy', '#BloomfieldHills', '#MichiganRealtor'], visual: 'Whiteboard explanation + B-roll of homes + spreadsheet on screen' },
  { hook: '"Bought this Birmingham fixer 18 months ago for $475K"', platform: 'TikTok', niche: 'investor', effort: '30min', engagement: 'HIGH', caption: 'Just listed for $890K after renovation.\n\nThe math:\n💰 Purchase: $475K\n🔨 Reno: $185K\n🏷 Listed: $890K\n💵 Profit (before agent/tax): $230K\n\nFlipping luxury isn\'t for everyone. The buyer pool is smaller but the margins are bigger. DM me if you want me to find your next project.', hashtags: ['#BirminghamMI', '#FixAndFlip', '#RealEstateInvesting', '#MetroDetroit'], visual: 'Before/after split screen, numbers as text overlay, drone of finished home' },
  { hook: '"Why I left BoldTrail / kvCORE and built my own CRM"', platform: 'Instagram Reel', niche: 'day-in-life', effort: '30min', engagement: 'MED', caption: 'I was paying $500/mo for software I barely used.\n\nNow I have:\n✅ My own AI-powered CRM\n✅ Custom drip campaigns\n✅ Automated past-client touchpoints\n✅ Everything in ONE place\n\nIt\'s not for everyone. But if you\'re tired of paying for tools you don\'t use, DM me. I\'ll show you what I built.', hashtags: ['#RealEstateTechnology', '#AgentLife', '#MichiganRealtor', '#WomenInRealEstate'], visual: 'Agent at laptop, screen recordings of CRM, fast cuts of dashboards' },
  { hook: '"Birmingham vs Royal Oak — which is right for you?"', platform: 'Instagram Carousel', niche: 'market', effort: '40min', engagement: 'HIGH', caption: 'Two of the best Metro Detroit walkable cities. Different vibes:\n\n🏛️ BIRMINGHAM: luxury, refined, $$$ (median $850K)\n🎨 ROYAL OAK: hip, eclectic, $$ (median $385K)\n\nSwipe for the full comparison ➡️\n\nWhich would YOU pick? Comment 1 for Birmingham, 2 for Royal Oak.', hashtags: ['#BirminghamMI', '#RoyalOakMI', '#NeighborhoodCompare', '#MetroDetroit'], visual: '8-image carousel: side-by-side photos + key stats + vibe shots' },
  { hook: '"$650K in West Bloomfield got me THIS much house"', platform: 'TikTok', niche: 'luxury-tour', effort: '20min', engagement: 'HIGH', caption: 'When clients ask "what does $650K get me?" — I show them this home.\n\n4 beds | 3 baths | 2,800 sqft | West Bloomfield Township\n\n✅ Updated kitchen\n✅ Finished basement\n✅ Lake access community\n✅ Top-rated schools\n\nDM "tour" for the full walkthrough.', hashtags: ['#WestBloomfield', '#MetroDetroitHomes', '#LuxuryRealEstate', '#MichiganHomes'], visual: 'Fast-cut tour with price label always on screen, dramatic music' },
  { hook: '"How I help past clients become repeat clients"', platform: 'Instagram Reel', niche: 'educational', effort: '20min', engagement: 'MED', caption: 'Every agent SAYS they keep in touch with past clients.\n\nFew actually do it.\n\nMy system:\n• Houseaversary text on closing date every year\n• Birthday email\n• Quarterly market report for THEIR neighborhood\n• Holiday cards (real ones, not e-cards)\n\nResult: 65% of my business is repeat or referral.', hashtags: ['#RealEstateMarketing', '#PastClientCare', '#MichiganRealtor', '#AgentTips'], visual: 'Agent writing card, sending text, phone notifications, happy clients' },
  { hook: '"3 questions to ask BEFORE hiring a listing agent"', platform: 'Instagram Reel', niche: 'educational', effort: '15min', engagement: 'MED', caption: 'Most sellers just call the first agent they meet. Don\'t.\n\nAsk:\n\n1️⃣ "How many homes did you sell in MY ZIP code last year?"\n2️⃣ "What\'s your average days-on-market vs the MLS average?"\n3️⃣ "Can I see your last 5 listings\' marketing photos?"\n\nIf they can\'t answer all 3 confidently, keep looking. Save this 📌', hashtags: ['#HomeSellingTips', '#ListingAgent', '#MichiganRealEstate', '#MetroDetroit'], visual: 'Talking head with the 3 questions as bold text overlays' },
  { hook: '"Dream Cruise weekend = the best time to list your Royal Oak home"', platform: 'Instagram Reel', niche: 'hyperlocal', effort: '20min', engagement: 'HIGH', caption: 'Hot tip nobody talks about:\n\nDream Cruise brings 1M+ visitors to Woodward every August. Many are out-of-state buyers checking out Metro Detroit.\n\nListings active during Dream Cruise week see 40% more open house traffic.\n\nIf you\'re thinking of selling, list by August 1. DM me for a free CMA.', hashtags: ['#DreamCruise', '#RoyalOak', '#MetroDetroitMarket', '#HomeSelling'], visual: 'Classic cars on Woodward + open house sign + agent talking' },
  { hook: '"What happens at closing in 60 seconds"', platform: 'TikTok', niche: 'educational', effort: '20min', engagement: 'MED', caption: 'You\'re under contract. Now what?\n\n📅 Day 1-7: Inspection\n📅 Day 8-21: Appraisal + lending\n📅 Day 22-35: Final walkthrough\n📅 Day 35-45: Closing day 🎉\n\nMy job: keep YOU calm while I handle everything behind the scenes.', hashtags: ['#HomeClosing', '#FirstTimeBuyer', '#MichiganRealtor', '#MetroDetroit'], visual: 'Timeline animation + agent voiceover + closing keys reveal' },
  { hook: '"The North American Auto Show brings BUYERS to Metro Detroit"', platform: 'Instagram Reel', niche: 'hyperlocal', effort: '15min', engagement: 'MED', caption: 'Auto execs from Tokyo, Munich, Seoul fly in every January.\n\nMany are relocating to Detroit area for work.\n\nIf your home is move-in ready and well-priced, January is a SLEEPER month for selling to relocation buyers.\n\nThinking of selling Q1? Let\'s talk now to be ready.', hashtags: ['#NorthAmericanAutoShow', '#DetroitRelocation', '#MetroDetroitMarket', '#MichiganRealtor'], visual: 'Auto show footage + maps + agent talking + relocation testimonials' },
  { hook: '"$1.2M Birmingham home tour — full price reveal at end"', platform: 'YouTube Short', niche: 'luxury-tour', effort: '60min', engagement: 'HIGH', caption: 'Take a quick tour of this STUNNING Birmingham colonial.\n\n• 5 beds, 4.5 baths\n• 4,200 sqft\n• Walk to downtown\n• Top-rated school district\n• Heated 3-car garage\n\nStick around for the asking price at the end 👀', hashtags: ['#BirminghamMI', '#LuxuryHomeTour', '#MetroDetroitHomes', '#MichiganRealEstate'], visual: 'Gimbal walkthrough, hide price until last 3 seconds for hook' },
  { hook: '"5 things I always check in older Bloomfield Hills homes"', platform: 'Instagram Reel', niche: 'educational', effort: '20min', engagement: 'MED', caption: 'Buying a luxury home built before 1990? Don\'t skip these:\n\n1️⃣ Knob & tube wiring (insurance won\'t cover)\n2️⃣ Galvanized plumbing (replace eventually)\n3️⃣ Asbestos in older boilers\n4️⃣ Original windows (drafty + $$$$$ to replace)\n5️⃣ Sewer line scope ($300, saves $30K)\n\nSave this for your next showing 📌', hashtags: ['#BloomfieldHills', '#HomeBuyingTips', '#OlderHomes', '#MichiganRealtor'], visual: 'Walk through home pointing out each issue, B-roll of inspection' },
  { hook: '"What I wish first-time sellers knew"', platform: 'Instagram Reel', niche: 'educational', effort: '20min', engagement: 'MED', caption: 'Selling your first home? Three truths:\n\n💵 Closing costs are ~7-10% of sale price\n📅 Timing matters more than you think (spring > winter)\n📸 First impression (photos) sells your home\n\nWant my "selling for the first time" checklist? Comment "checklist" below.', hashtags: ['#FirstTimeSeller', '#HomeSellingTips', '#MichiganRealtor', '#MetroDetroit'], visual: 'Agent at kitchen table with checklist + B-roll of home sale signs' },
  { hook: '"Why I refused to list this $1.5M home (until they fixed it)"', platform: 'TikTok', niche: 'agent-story', effort: '30min', engagement: 'HIGH', caption: 'A seller called me last week. Wanted to list for $1.5M.\n\nI walked through the home. Beautiful. But:\n• Cracked driveway\n• Outdated kitchen (1990s oak)\n• Carpet in the basement (mold smell)\n\nI told them: "Spend $35K, list for $1.65M, net $80K more."\n\nThey did it. Listing goes live Monday.\n\nMost agents take the listing as-is. I tell you the truth.', hashtags: ['#ListingAgent', '#HonestRealtor', '#MetroDetroitLuxury', '#MichiganRealEstate'], visual: 'Agent at home walking through issues, then dramatic reveal of staged version' },
  { hook: '"Where to actually live in Metro Detroit if you want luxury"', platform: 'Instagram Carousel', niche: 'market', effort: '40min', engagement: 'HIGH', caption: 'Out-of-state buyer? Don\'t just Google "best suburbs Detroit."\n\nMy ranked list:\n\n1️⃣ Birmingham — walkable luxury\n2️⃣ Bloomfield Hills — estates + privacy\n3️⃣ Bloomfield Township — best schools value\n4️⃣ Northville — small-town charm + luxury\n5️⃣ Novi — newer construction\n6️⃣ West Bloomfield — lakes + diversity\n7️⃣ Rochester Hills — value play\n\nSave this 📌 DM me for the full breakdown.', hashtags: ['#MetroDetroit', '#RelocatingToMichigan', '#LuxurySuburbs', '#OaklandCounty'], visual: '8-image carousel: 1 per suburb with key stats + iconic photo' },
  { hook: '"Tigers opening day is the unofficial start of Metro Detroit home buying season"', platform: 'Instagram Reel', niche: 'hyperlocal', effort: '15min', engagement: 'MED', caption: 'It\'s a Detroit thing.\n\nWhen the Tigers play their home opener, our market wakes up. Spring buyers come out. Sellers start prepping. Open houses get crowded.\n\nIf you\'re thinking of buying or selling this spring, start the conversation NOW so you\'re ready before the rush.', hashtags: ['#DetroitTigers', '#OpeningDay', '#MetroDetroitMarket', '#SpringMarket'], visual: 'Tigers stadium + spring open house signs + cherry blossoms + agent talking' },
  { hook: '"3 reasons Michigan is the BEST place to buy luxury right now"', platform: 'YouTube Short', niche: 'market', effort: '30min', engagement: 'MED', caption: 'Coastal buyers, listen up:\n\n1️⃣ Your $1M = $1.8M house here\n2️⃣ No state income tax on real estate gains over 2yrs\n3️⃣ Best schools in the Midwest (Birmingham, Bloomfield)\n4️⃣ Four seasons (winter is gorgeous, fight me)\n5️⃣ Detroit auto/tech sector booming\n\nDM me if you\'re considering relocation. I\'ll send you a relocation guide.', hashtags: ['#MichiganRelocation', '#LuxuryRealEstate', '#MetroDetroit', '#MoveToMichigan'], visual: 'Drone shots of Birmingham + Bloomfield estates + stock charts overlay' },
  { hook: '"Birmingham Restaurant Week — the BEST week to host a buyer tour"', platform: 'Instagram Reel', niche: 'hyperlocal', effort: '25min', engagement: 'MED', caption: 'Pro tip for buyer agents (or DIY buyers):\n\nSchedule your downtown Birmingham showings during Restaurant Week.\n\nWhy?\n🍽️ Town is alive and busy\n🚶 Walkability sells itself\n🍷 Easy to grab a glass of wine after to close the deal\n🌳 Trees are budding, town looks magical\n\nNothing sells Birmingham like the Birmingham experience.', hashtags: ['#BirminghamMI', '#BirminghamRestaurantWeek', '#HomeShowing', '#MetroDetroit'], visual: 'Restaurant patio shots + agent walking through downtown + happy buyers' },
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
