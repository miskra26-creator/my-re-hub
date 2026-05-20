// AdComposer.jsx — AI-driven Facebook/Instagram ad campaign generator.
//
// You input a brief (listing, area, audience hint), AI generates:
//   - 3 headline variations (FB limit: 40 chars)
//   - 3 primary text variations (FB feed limit: 125 chars)
//   - 3 link descriptions
//   - Recommended CTA button
//   - Image/creative concept suggestions
//   - Audience targeting (geo, age, interests, behaviors)
//   - Budget + schedule recommendation
//   - Landing page copy
//   - Expected performance estimates
//
// Phase 1 (this file): generate + save to localStorage. User copy/pastes into
// Facebook Ads Manager.
// Phase 2 (next): wire to Meta Ads API for one-click launch.

import { useState } from 'react';
import { useLS } from './cloudHooks';
import {
  Megaphone, Target, Users, DollarSign, Image as ImageIcon,
  Copy, Save, Trash2, ChevronRight, Sparkles, RefreshCw, Check, MapPin,
  TrendingUp, Calendar, Eye, FileText, X,
} from 'lucide-react';

const CAMPAIGN_OBJECTIVES = [
  { id: 'LEADS', label: 'Lead Generation', desc: 'Capture name/email/phone via lead form (recommended)' },
  { id: 'TRAFFIC', label: 'Traffic to Listing Page', desc: 'Drive clicks to a landing page' },
  { id: 'AWARENESS', label: 'Brand Awareness', desc: 'Get your name in front of buyers/sellers' },
  { id: 'ENGAGEMENT', label: 'Engagement / Saves', desc: 'Build a warm audience to retarget later' },
];

// PROVEN_TEMPLATES — tuned to the I-275 corridor at $350K+
// (Livonia / Plymouth / Novi / Northville / Farmington / Farmington Hills / Canton)
//
// All audience defaults are HOUSING SPECIAL AD CATEGORY (SAC) compliant:
//   - Age locked 18-65+ (cannot narrow)
//   - Gender locked to "all"
//   - Minimum radius 15 miles (no ZIP-level)
//   - No detailed targeting on protected attributes
//   - Lookalikes were replaced by Special Ad Audiences in 2019, then Meta
//     discontinued SAAs in Aug 2022 — pure lookalikes are GONE for housing.
//     Closest substitute: interest-stack on top of Custom Audiences (past
//     clients via email upload, website visitors via pixel, video viewers).
//
// CPL ranges are based on WordStream 2025 ($16.61 blended) adjusted 2-3x
// for premium $350K+ market. Verbatim hooks are cited from Saleswise,
// Foreplay/Aalto, Adfuel, HomeValueLeads — see ad_strategy_metro_detroit.md
// memory file for source URLs.
const PROVEN_TEMPLATES = [
  {
    id: 'home-worth-hyperlocal',
    name: "What's My Home Worth in [City]",
    segment: 'seller',
    icon: '💰',
    whyItConverts: 'Highest-converting seller hook in real estate (Saleswise documented). Premium suburb empty-nesters have 70-100% equity. Curiosity + "no obligation" = lowest friction lead form.',
    expectedCPL: '$20-40',
    bestForCities: ['Northville', 'Novi', 'Plymouth', 'Livonia', 'Farmington Hills'],
    hookPatterns: [
      'Curious What Your {city} Home is Worth?',
      'Home values in {city} are changing. Get a FREE valuation.',
      'Get a real-comp-based valuation in 90 seconds — no Zestimate guesses.',
    ],
    bodyPatterns: [
      'Home values in {city} are changing. Find out how much equity you have with a FREE, no-obligation home value report.',
      "I'll send you a custom valuation in 24 hours based on actual recent sales in your subdivision. No calls unless you ask.",
      'Get a real-comp-based valuation in 90 seconds — no Zestimate guesses.',
    ],
    ctaButton: 'Get Quote',
    audience: {
      // HOUSING SAC COMPLIANT — see top of file
      ageMin: 18, ageMax: 65, gender: 'all', radiusMiles: 15,
      interests: ['Zillow', 'Realtor.com', 'Redfin', 'Trulia', 'Home improvement', 'HGTV', 'Houzz'],
      behaviors: ['Likely to move'],
      exclusions: ['Real estate agent', 'Real estate broker', 'National Association of Realtors'],
      customAudiences: ['Past client email list (upload as Custom Audience)', 'Website visitors 180d'],
    },
    creative: 'Agent on-camera Reel (15-30 sec) in front of a recently SOLD home in {city}. Pattern: "Curious what your home is worth in this market? Here\'s the 2025 number, not the Zestimate." Captions burned in (80% of viewers watch muted).',
    leadMagnet: 'Custom CMA delivered in 24 hours + "What sold on your street" 1-pager',
    dailyBudget: 10, durationDays: 30,
  },
  {
    id: 'school-district-guide',
    name: 'School District Guide (Novi vs. Northville vs. Plymouth-Canton)',
    segment: 'buyer',
    icon: '🏫',
    whyItConverts: 'School district is the #1 driver of move-up purchases in this corridor. Direct comparison content captures the exact decision parents are agonizing over.',
    expectedCPL: '$20-35',
    bestForCities: ['Canton', 'Livonia', 'Farmington Hills', 'Plymouth'],
    hookPatterns: [
      'Novi vs. Northville vs. Plymouth-Canton: which top-rated district fits YOUR family?',
      'Your starter home served you well. But is it time for Novi schools?',
      'The 2026 school district guide for Metro Detroit\'s top-3 corridors.',
    ],
    bodyPatterns: [
      'Compare test scores, boundaries, and home prices across the three best school systems in Metro Detroit. Free PDF guide.',
      'Most families pick the wrong district because they only look at rankings. This guide shows what the rankings miss.',
      'I\'ve helped 50+ families move into Novi/Northville/PCCS. Here\'s everything I wish they\'d known earlier.',
    ],
    ctaButton: 'Download',
    audience: {
      // HOUSING SAC COMPLIANT
      ageMin: 18, ageMax: 65, gender: 'all', radiusMiles: 20,
      interests: ['Parenting', 'GreatSchools.org', 'Elementary school', 'PTA', 'Zillow', 'Realtor.com', 'Home improvement'],
      behaviors: ['Likely to move'],
      exclusions: ['Real estate agent'],
      customAudiences: ['Past school-district movers (Custom Audience seed)'],
    },
    creative: 'Carousel: side-by-side comparison of the three districts (test scores, programs, boundaries map). Or a 15-sec Reel of Monica explaining how to evaluate beyond rankings. Captions on.',
    leadMagnet: '3-district side-by-side PDF: test scores, programs, boundaries, 2025 closed-sales price-per-sqft in each',
    dailyBudget: 10, durationDays: 30,
  },
  {
    id: 'move-up-dual',
    name: 'Move-Up Without Owning Two Homes',
    segment: 'both',
    icon: '🔄',
    whyItConverts: 'Highest-LTV lead type in this corridor — one lead = TWO transactions (sell their current home + buy a bigger one). Solves the "sell first or buy first" paralysis directly.',
    expectedCPL: '$35-55',
    bestForCities: ['Canton', 'Livonia', 'Plymouth', 'Farmington Hills', 'Novi'],
    hookPatterns: [
      'Selling your $450K Canton home to buy a $650K Northville home? I coordinate both sides.',
      'Stop worrying about owning two homes (or none). The bridge plan for move-up buyers.',
      'Your kids are outgrowing the house. Here\'s the move-up plan that doesn\'t leave you homeless.',
    ],
    bodyPatterns: [
      'I coordinate the sale of your current home and the purchase of your next one — so you never own two homes or none. Free 15-min timing call.',
      'The biggest reason move-up families stall: fear of being between homes. There\'s a way to bridge that. Let me show you.',
      'I\'ve guided 30+ families through this exact transition in Canton → Northville and Livonia → Novi. Free timing strategy call.',
    ],
    ctaButton: 'Sign Up',
    audience: {
      // HOUSING SAC COMPLIANT
      ageMin: 18, ageMax: 65, gender: 'all', radiusMiles: 20,
      interests: ['Real estate', 'Zillow', 'Realtor.com', 'Home improvement', 'HGTV', 'Mortgage refinance'],
      behaviors: ['Likely to move'],
      exclusions: ['Real estate agent'],
      customAudiences: ['Past client email list', 'Website visitors 90d'],
    },
    creative: 'Monica on-camera Reel (45-60 sec) explaining the sell-then-buy coordination in plain English. Whiteboard or simple graphic showing the 3-step bridge process.',
    leadMagnet: 'Move-up timing calculator + 15-min strategy call',
    dailyBudget: 25, durationDays: 14,
  },
  {
    id: 'relocator',
    name: 'Relocating to Metro Detroit',
    segment: 'buyer',
    icon: '✈️',
    whyItConverts: 'Niche but VERY high-quality leads. Out-of-state professionals at Ford/Stellantis/Rocket Companies have compressed timelines (30-60 days) and often buy sight-unseen after one weekend visit. Auto industry hiring is constant.',
    expectedCPL: '$40-70',
    bestForCities: ['Northville', 'Novi', 'Plymouth'],
    hookPatterns: [
      'Moving to Metro Detroit for work? I help Ford, Stellantis, and Rocket pros land in Novi, Northville, and Plymouth.',
      'Just got the offer? Here\'s where Detroit\'s top execs actually live (and how to buy in one weekend).',
      'Relocating to the auto/tech corridor? I\'ll fly you in, show you 8 homes Saturday, write an offer Sunday.',
    ],
    bodyPatterns: [
      'Specialized in fast relocations for Ford, Stellantis, Rocket Companies, and tier-1 supplier professionals. 30-60 day timelines welcome.',
      'I send a custom relocation packet: top 5 neighborhoods for your commute + income, school overview, sample listings. Free.',
      'Most relocators waste their first weekend with a generic agent. I tailor everything to your industry, commute, and family.',
    ],
    ctaButton: 'Learn More',
    audience: {
      // HOUSING SAC COMPLIANT — national US targeting allowed
      ageMin: 18, ageMax: 65, gender: 'all', radiusMiles: 15,
      interests: ['Ford Motor Company', 'Stellantis', 'Rocket Companies', 'General Motors', 'Automotive industry', 'Relocation'],
      behaviors: ['Recently moved'],
      exclusions: ['Real estate agent'],
      // Geo: cross-shopper markets (Cleveland, Indianapolis, Chicago, Toronto/Windsor for Stellantis)
      customAudiences: ['Website visitors who viewed "Relocation" pages'],
    },
    creative: 'Monica on-camera tour of one premium neighborhood (Northville historic district, Novi/Twelve Oaks corridor) explaining commute times to Ford HQ / Rocket HQ. Caption with auto-industry references.',
    leadMagnet: '"Relocating to Metro Detroit" packet: top 5 neighborhoods by commute, school overview, current inventory',
    dailyBudget: 25, durationDays: 21,
  },
  {
    id: 'downsizer',
    name: 'Empty-Nester Downsizer',
    segment: 'seller',
    icon: '🌅',
    whyItConverts: 'Highest-equity sellers in the corridor. Tone matters — this segment hates aggressive sales pitches. Empathetic framing + the "kids are gone, what now" emotional angle converts where direct-response fails.',
    expectedCPL: '$35-55',
    bestForCities: ['Northville', 'Novi', 'Plymouth', 'Farmington Hills'],
    hookPatterns: [
      'The kids are gone. The house is too big. Now what?',
      'Your home is worth 2-3x what you paid. Ready to downsize but unsure where to start?',
      'Downsizing in Metro Detroit: the 5 mistakes that cost retirees the most equity.',
    ],
    bodyPatterns: [
      'You\'ve lived in this home 20+ years. Selling is emotional. I\'ll walk you through it at your pace, no pressure.',
      'Downsize calculator: how much will you net after the sale, and what can you afford on the next chapter? Free guide.',
      'Plymouth and Northville have beautiful walkable ranches under $500K. Let me send you a curated list.',
    ],
    ctaButton: 'Download',
    audience: {
      // HOUSING SAC COMPLIANT — age locked 18-65+ for housing; segment via interests instead
      ageMin: 18, ageMax: 65, gender: 'all', radiusMiles: 20,
      interests: ['AARP', 'Retirement planning', 'Golf', 'Gardening', 'RV travel', 'Florida real estate', 'Arizona real estate', 'Cruise ships'],
      behaviors: ['Likely to move'],
      exclusions: ['Real estate agent'],
      customAudiences: ['Past 55+ sellers (Custom Audience)', 'Newsletter subscribers'],
    },
    creative: 'Soft, warm Reel — Monica having a coffee at home, talking calmly about the downsizing decision. NO aggressive urgency. This segment buys trust, not hype.',
    leadMagnet: 'Downsizing & home equity guide: net-proceeds calculator + 3 downsizing-friendly neighborhoods in your area',
    dailyBudget: 30, durationDays: 21,
  },
  {
    id: 'just-listed-subdivision',
    name: 'Just Listed in [Subdivision]',
    segment: 'buyer',
    icon: '🏡',
    whyItConverts: 'High intent. People scrolling FB who see a specific subdivision name pause because they know it. Targeted to families ready to act.',
    expectedCPL: '$15-30',
    bestForCities: ['Northville', 'Novi', 'Plymouth', 'Canton', 'Livonia'],
    hookPatterns: [
      'Just listed in {neighborhood} — {beds} bed, {baths} bath, ${price}.',
      'Walk-up appointment Saturday only: {neighborhood}, {city}. ${price}.',
      'Hot new listing in {neighborhood}: {beds}/{baths}, {sqft} sqft. Showings start Friday.',
    ],
    bodyPatterns: [
      '{beds} beds · {baths} baths · {sqft} sqft · finished basement · updated kitchen. Walking distance to {school}. DM for showing.',
      'In the heart of {neighborhood}. Top-rated {school district} schools. Showings book up fast — message me for the slot.',
      '{neighborhood} doesn\'t list often. ${price} for {beds}/{baths}. Open Saturday 1-3 only.',
    ],
    ctaButton: 'Contact Us',
    audience: {
      // HOUSING SAC COMPLIANT — radius minimum 15 mi for housing ads
      ageMin: 18, ageMax: 65, gender: 'all', radiusMiles: 15,
      interests: ['Zillow', 'Realtor.com', 'Redfin', 'Trulia', 'Home improvement', 'Parenting'],
      behaviors: ['Likely to move'],
      exclusions: ['Real estate agent'],
      customAudiences: ['Website visitors 30d', 'Video viewers 75%+'],
    },
    creative: 'Professional listing photo (exterior + kitchen) with price + specs overlay. Or a 30-sec walkthrough Reel. Include the subdivision name in big text.',
    leadMagnet: 'Showing appointment + property details PDF',
    dailyBudget: 20, durationDays: 7,
  },
  {
    id: 'just-sold-social-proof',
    name: 'Just Sold in [Subdivision] (Same-Hood Sellers)',
    segment: 'seller',
    icon: '✅',
    whyItConverts: 'When neighbors see "Bradford of Northville sold for $X," they wonder what their own house would sell for. Curiosity + social proof = high-intent seller leads.',
    expectedCPL: '$25-40',
    bestForCities: ['Northville', 'Novi', 'Plymouth', 'Farmington Hills', 'Canton'],
    hookPatterns: [
      'Your neighbor in {neighborhood} just sold for ${price}. Curious what your home would sell for?',
      'Sold in 12 days at full price: {neighborhood}, {city}. Yours could be next.',
      '{neighborhood} just hit a new high: ${price} for {beds}/{baths}. See your home\'s value.',
    ],
    bodyPatterns: [
      'Just closed in your subdivision. I\'ll send you a free comp-based estimate for your own home — no calls unless you ask.',
      'Same subdivision, same year built, similar specs. Click below and I\'ll text you what your equivalent home would sell for.',
      'Sold over asking in {neighborhood}. If you\'re even thinking about selling, see what your number is.',
    ],
    ctaButton: 'Get Quote',
    audience: {
      // HOUSING SAC COMPLIANT — 15mi minimum radius (no same-subdivision tight targeting permitted)
      ageMin: 18, ageMax: 65, gender: 'all', radiusMiles: 15,
      interests: ['Home improvement', 'Gardening', 'Zillow', 'Realtor.com', 'HGTV'],
      behaviors: ['Likely to move'],
      exclusions: ['Real estate agent'],
      customAudiences: ['Same-ZIP homeowner email list (Custom Audience)'],
    },
    creative: 'Photo of the SOLD sign in front of the actual house, or a quick Reel walking past the sold home pointing out features. Caption with specific subdivision name.',
    leadMagnet: 'Subdivision-specific CMA based on the just-sold comp',
    dailyBudget: 25, durationDays: 14,
  },
  {
    id: 'off-market-list',
    name: 'Off-Market / Coming Soon Listings',
    segment: 'buyer',
    icon: '🔐',
    whyItConverts: 'Buyers feel they\'re getting insider access. Excellent for retargeting warm leads who didn\'t convert on the first offer. Builds a list of active buyers.',
    expectedCPL: '$20-35',
    bestForCities: ['Northville', 'Novi', 'Plymouth', 'Canton', 'Livonia'],
    hookPatterns: [
      'Off-market homes in {city}: not on Zillow yet. See them before everyone else.',
      'Coming Soon listings list — {city} & nearby. Updated weekly. Free access.',
      '5 homes in {city} hitting the market in the next 14 days. Want the addresses?',
    ],
    bodyPatterns: [
      'I get pocket listings and "coming soon" properties before they hit MLS. Get on the list — free, no spam, no calls unless you want them.',
      'Why fight bidding wars on Zillow when you can see homes 7-14 days before everyone else? Click below for the list.',
      'My buyer list gets first look at coming-soon homes in {city}. Active buyers only.',
    ],
    ctaButton: 'Sign Up',
    audience: {
      // HOUSING SAC COMPLIANT
      ageMin: 18, ageMax: 65, gender: 'all', radiusMiles: 15,
      interests: ['Zillow', 'Realtor.com', 'Redfin', 'Trulia', 'Mortgage calculator', 'Rocket Mortgage'],
      behaviors: ['Likely to move'],
      exclusions: ['Real estate agent'],
      customAudiences: ['Website visitors 60d', 'Past inquiries'],
    },
    creative: 'Mysterious / curiosity-driven imagery: blurred home photo with "COMING SOON" tag. Or a Reel of Monica unlocking a "private" listing.',
    leadMagnet: 'Weekly coming-soon list (email + SMS)',
    dailyBudget: 20, durationDays: 30,
  },
  {
    id: 'retargeting',
    name: 'Retargeting (Pixel + Lookalikes)',
    segment: 'both',
    icon: '🎯',
    whyItConverts: 'Without retargeting, you waste 70%+ of top-funnel spend. Warm audiences who already engaged with you convert at 3-5x higher rates than cold.',
    expectedCPL: '$50-90 (per consultation booked)',
    bestForCities: ['All 7 corridor cities'],
    hookPatterns: [
      'Still thinking about your move in {city}? Let\'s talk for 15 minutes.',
      'You looked at our market guide last week — here\'s what we\'re seeing this week.',
      'Almost ready to make a move? Free 15-min strategy call with Monica.',
    ],
    bodyPatterns: [
      'No pressure. Just 15 minutes to understand your timeline and answer questions. Pick a slot below.',
      'You\'ve been researching. Now let\'s map out your specific situation. Free consult.',
      '50+ families I helped in {city} last year. Yours could be next. Free 15-min call.',
    ],
    ctaButton: 'Sign Up',
    audience: {
      // HOUSING SAC COMPLIANT — pure lookalikes BANNED for housing (SAAs discontinued Aug 2022).
      // Use Custom Audiences + interest stacking instead.
      ageMin: 18, ageMax: 65, gender: 'all', radiusMiles: 15,
      interests: [],
      behaviors: [],
      exclusions: ['Real estate agent'],
      customAudiences: [
        'Website visitors 180d',
        'Instagram engagers 90d',
        'Video viewers 75%+',
        'Lead form openers (didn\'t submit)',
        'Past client email list',
      ],
    },
    creative: 'Mix: Just Sold social proof tiles + agent testimonial Reel + "Book a 15-min call" CTA. Rotate creatives every 14-21 days.',
    leadMagnet: '15-minute consultation booking',
    dailyBudget: 20, durationDays: 30,
  },
  {
    id: 'custom',
    name: 'Custom Brief',
    segment: 'custom',
    icon: '✏️',
    whyItConverts: 'For one-off campaigns not covered by the proven templates — events, specific listings, time-sensitive promos.',
    expectedCPL: 'Varies',
    bestForCities: ['Any'],
    hookPatterns: [],
    bodyPatterns: [],
    ctaButton: 'Learn More',
    audience: { ageMin: 30, ageMax: 65, radiusMiles: 8, interests: [], behaviors: [], exclusions: [] },
    creative: 'Describe what you want in the brief — AI will generate appropriate creative direction.',
    leadMagnet: 'Custom',
    dailyBudget: 15, durationDays: 14,
  },
];

// Legacy export name kept for picker UI compatibility.
const CAMPAIGN_TEMPLATES = PROVEN_TEMPLATES;

// ─── FORMAT FINDER ──────────────────────────────────────────────────────────
// Recommendation engine that maps user inputs → optimal ad format + specs.
// Backed by 2024-2025 research:
//   - Video converts 63% higher than static (Property Panorama 2025)
//   - IG Reels 3.7% engagement (highest of any format), 2.7x more than carousel (Coffee & Contracts)
//   - Optimal video length: 5-15 sec, hook in first 3 sec (HomeValueLeads)
//   - Carousel best practice: 5-7 photos (Saleswise)
//   - Agent-on-camera > listing photo > stock for trust (Property Panorama)
//   - Static is 25% cheaper but lower quality (Property Panorama)
const FORMAT_FINDER_FORMATS = {
  lead_form_reel: {
    name: 'Reel with Lead Form',
    icon: '🎬',
    aspectRatio: '9:16 (vertical)',
    dimensions: '1080 × 1920',
    duration: '15-30 sec',
    fileFormat: 'MP4, H.264, captions burned in',
    creativeDirection: 'Agent on-camera in a real location (downtown Plymouth, Northville historic district, in front of a recently SOLD home). Talk straight to the lens. Hook in first 3 seconds (question, number, claim). Captions ON.',
    captionLength: '80-125 chars (under "See More" cutoff)',
    expectedCPL: '$25-45 (premium $350K+)',
    whyThisFormat: 'Video converts 63% higher than static (Property Panorama 2025). IG Reels has the highest engagement of any IG format (3.7%, Coffee & Contracts 2025). Agent-on-camera builds trust faster than property photos.',
    bestFor: 'Lead generation when you want quality leads, not just volume',
    placement: 'Instagram Reels + Facebook Reels + Stories (Meta auto-places)',
  },
  carousel_listing: {
    name: 'Listing Carousel',
    icon: '🏡',
    aspectRatio: '1:1 (square)',
    dimensions: '1080 × 1080 per card',
    duration: 'N/A (5-7 cards)',
    fileFormat: 'JPG/PNG photos',
    creativeDirection: '5-7 professional photos in this order: 1) front exterior (hero), 2) kitchen, 3) living room, 4) primary bedroom, 5) backyard. NEVER lead with bathroom. Each card can have price + specs overlay.',
    captionLength: 'Headline ≤40 chars, primary text ≤125 chars',
    expectedCPL: '$20-35',
    whyThisFormat: 'Saleswise documents 5-7 photo carousels as the highest-converting "Just Listed" format. Square 1:1 dominates feed without cropping.',
    bestFor: 'Promoting a specific listing — drives showings + appointments',
    placement: 'Facebook + Instagram feed',
  },
  static_data: {
    name: 'Static Data Graphic',
    icon: '📊',
    aspectRatio: '1:1 (square)',
    dimensions: '1080 × 1080',
    duration: 'N/A',
    fileFormat: 'JPG/PNG',
    creativeDirection: 'Bold headline stat (e.g. "Median: $769,900 · DOM: 14 days") + minimal supporting copy. Branded but not over-designed. Use 1-2 brand colors max.',
    captionLength: 'Headline ≤40 chars, primary text ≤125 chars. Lead with the most striking number.',
    expectedCPL: '$15-30 (cheapest per lead but lower quality)',
    whyThisFormat: 'Static is 25% cheaper per lead than video (Property Panorama). Best for market updates where the NUMBER is the hook. Move-up sellers in your corridor respond to data.',
    bestFor: 'Market reports, monthly updates, market-shift content',
    placement: 'Facebook + Instagram feed',
  },
  reel_awareness: {
    name: 'Reel (Awareness)',
    icon: '✨',
    aspectRatio: '9:16 (vertical)',
    dimensions: '1080 × 1920',
    duration: '15-30 sec',
    fileFormat: 'MP4, H.264, captions burned in',
    creativeDirection: 'Agent walking a recognizable local landmark (Kellogg Park, downtown Northville, Twelve Oaks area). Local life / "POV of a Saturday in Plymouth" format works best per Coffee & Contracts 2025.',
    captionLength: '80-125 chars',
    expectedCPL: 'N/A (awareness — track reach + saves)',
    whyThisFormat: 'IG Reels has 3.2x more saves and shares than carousels (Coffee & Contracts 2025). Builds Custom Audiences for later retargeting at ~$10 CPM.',
    bestFor: 'Brand-building, building a warm audience for later retargeting',
    placement: 'Instagram Reels + Facebook Reels',
  },
  testimonial_video: {
    name: 'Testimonial Video',
    icon: '⭐',
    aspectRatio: '4:5 or 1:1',
    dimensions: '1080 × 1350 or 1080 × 1080',
    duration: '30-60 sec',
    fileFormat: 'MP4',
    creativeDirection: 'Real client speaking to camera. Specific outcome ("Monica got us into the Plymouth house at $620K, 24-hour offer"). Burn the dollar amount + days as on-screen text. Caption on.',
    captionLength: '125-200 chars (Facebook feed allows slightly longer)',
    expectedCPL: '$35-60 (most expensive, but highest-quality leads)',
    whyThisFormat: 'Testimonials have the highest conversion-to-appointment rate of any format. Best for warm audiences and pre-purchase consideration.',
    bestFor: 'Retargeting + closing warm leads',
    placement: 'Facebook + Instagram feed + Reels',
  },
  carousel_just_sold: {
    name: 'Just Sold Social Proof Carousel',
    icon: '✅',
    aspectRatio: '1:1',
    dimensions: '1080 × 1080',
    duration: 'N/A (3-5 cards)',
    fileFormat: 'JPG/PNG',
    creativeDirection: 'Card 1: SOLD sign in front of house. Card 2: list price vs sold price comparison. Card 3: "N days on market". Card 4: testimonial. Card 5: CTA.',
    captionLength: 'Headline: "JUST SOLD: Closed $X over list in N days". Primary text ≤125 chars.',
    expectedCPL: '$20-35',
    whyThisFormat: 'Triggers FOMO in same-neighborhood homeowners curious about their own value. Documented seller-attraction pattern in Foreplay\'s ad library.',
    bestFor: 'Attracting same-neighborhood seller leads',
    placement: 'Facebook + Instagram feed',
  },
  single_image_offer: {
    name: 'Single Image with Offer',
    icon: '🖼',
    aspectRatio: '1:1',
    dimensions: '1080 × 1080',
    duration: 'N/A',
    fileFormat: 'JPG/PNG',
    creativeDirection: 'One bold image with offer text overlay (≤20% of image area or Meta dings it). E.g., recent property photo + "Get your home value in 24 hrs" overlay.',
    captionLength: 'Headline ≤40 chars, primary ≤125',
    expectedCPL: '$15-30',
    whyThisFormat: 'Cheapest per lead. Good for testing offers before investing in video production. 25% cheaper than video per Property Panorama.',
    bestFor: 'Budget tests, awareness layer, repeat offers',
    placement: 'Facebook + Instagram feed',
  },
};

// Recommendation logic — maps user inputs to a format key
function recommendFormat({ goal, asset, media, budget }) {
  // Decision tree based on the research
  if (goal === 'leads') {
    if (asset === 'listing' && (media === 'photos' || media === 'both')) {
      return { key: 'carousel_listing', alts: ['reel_awareness'] };
    }
    if (asset === 'lead_magnet' && (media === 'video' || media === 'both')) {
      return { key: 'lead_form_reel', alts: ['carousel_listing'] };
    }
    if (asset === 'market_update') {
      return { key: 'static_data', alts: ['reel_awareness'] };
    }
    if (asset === 'just_sold') {
      return { key: 'carousel_just_sold', alts: ['static_data'] };
    }
    if (media === 'video' || media === 'both') {
      return { key: 'lead_form_reel', alts: ['testimonial_video'] };
    }
    if (budget === 'test') {
      return { key: 'single_image_offer', alts: ['static_data'] };
    }
    return { key: 'lead_form_reel', alts: ['carousel_listing'] };
  }
  if (goal === 'awareness') {
    if (asset === 'agent_brand' && (media === 'video' || media === 'both')) {
      return { key: 'reel_awareness', alts: ['testimonial_video'] };
    }
    if (asset === 'market_update') {
      return { key: 'static_data', alts: ['reel_awareness'] };
    }
    if (asset === 'just_sold') {
      return { key: 'carousel_just_sold', alts: ['static_data'] };
    }
    return { key: 'reel_awareness', alts: ['static_data'] };
  }
  if (goal === 'traffic') {
    if (asset === 'listing') {
      return { key: 'carousel_listing', alts: ['lead_form_reel'] };
    }
    return { key: 'single_image_offer', alts: ['static_data'] };
  }
  if (goal === 'engagement') {
    if (asset === 'just_sold') {
      return { key: 'carousel_just_sold', alts: ['reel_awareness'] };
    }
    return { key: 'reel_awareness', alts: ['carousel_just_sold'] };
  }
  return { key: 'lead_form_reel', alts: ['carousel_listing'] };
}

async function callAI(prompt, system, maxTokens = 2500) {
  const r = await fetch('/api/claude/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'AI proxy error');
  return (d.content?.[0]?.text || '').trim();
}

function parseAIJson(text) {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(stripped);
}

const AdComposer = ({ setPage, toast }) => {
  const [campaigns, setCampaigns] = useLS('ad_campaigns', []);
  const [profile] = useLS('re_profile', { name: 'Monica Iskra', brokerage: '', phone: '', email: '' });
  const [agentVoice] = useLS('agent_voice', '');
  const [areas] = useLS('service_areas', 'Livonia, MI; Plymouth, MI; Novi, MI; Northville, MI; Farmington, MI; Farmington Hills, MI; Canton, MI');

  const [view, setView] = useState('list'); // list | new | edit | format-finder
  const [form, setForm] = useState({
    template: 'just-listed',
    objective: 'LEADS',
    title: '',
    listingAddress: '',
    listingPrice: '',
    listingBeds: '',
    listingBaths: '',
    listingSqft: '',
    listingDetails: '',
    targetAreas: areas || 'Livonia, MI',
    audienceHint: '',
    dailyBudget: 10,
    durationDays: 7,
  });
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState(null);
  const [viewingId, setViewingId] = useState(null);

  const generate = async () => {
    setGenerating(true);
    setDraft(null);
    try {
      const tpl = PROVEN_TEMPLATES.find(t => t.id === form.template);
      const sys = `You are an elite Facebook / Instagram ads strategist specializing in real estate. The agent is ${profile.name || 'Monica Iskra'}${profile.brokerage ? ` at ${profile.brokerage}` : ''} serving the Metro Detroit I-275 corridor (Livonia, Plymouth, Novi, Northville, Farmington, Farmington Hills, Canton) at the $350K+ price band. ${agentVoice ? `Brand voice: ${agentVoice}` : 'Warm, direct, never salesy, always specific. Authority + empathy. Local landmarks > generic phrases.'}

YOU ARE NOT GENERATING FROM SCRATCH. You are PERSONALIZING a proven, documented-to-convert template for this agent's specific brief. Use the template's hook patterns, body patterns, and audience as the BASIS — customize them for the listing/area provided. Stay close to the proven structure; don't invent new ones.

CRITICAL — META HOUSING SPECIAL AD CATEGORY (SAC) RULES that you MUST follow in the audience output:
- Age: ALWAYS output ageMin=18, ageMax=65 (Meta locks housing ads to 18-65+, cannot narrow)
- Gender: ALWAYS output "all"
- radiusMiles: minimum 15 (Meta blocks tighter housing radii)
- DO NOT include any targeting on protected attributes: race, religion, family status, national origin, disability
- DO NOT include "Renters" / "Below median income" / "Homeowners with N+ year tenure" / specific age behaviors / parents-with-children-aged-X / family-status interests — these are PROHIBITED in housing
- Lookalikes are BANNED for housing. Output custom audiences instead (past client lists, website pixel visitors, video viewers, IG engagers).
- Exclusions: always include "Real estate agent" and "National Association of Realtors" interest exclusions (saves money on competitors clicking)

Output PRODUCTION-READY ad copy following 2024-2025 best practices:
- Headlines: ≤40 chars, specific (name the neighborhood/school district by name), curiosity-driven
- Primary text: ≤125 chars to avoid "See More" truncation on feed
- Descriptions: ≤30 chars
- Use real local landmarks (Kellogg Park, downtown Northville, Twelve Oaks Mall, specific subdivisions) wherever you can
- Numbers + dollar amounts + days + percentages = stops the scroll
- NEVER use clickbait, ALL CAPS, fake urgency, or generic "your dream home awaits"
- Avoid first-time-buyer / FHA / down-payment-assistance angles — this is $350K+ premium suburban segment
- For seller hooks: curiosity opener + "no obligation" + 24-hour response promise
- For buyer hooks: school district angle for families; commute/income for relocators; off-market list for active buyers`;

      // Build the template-specific scaffolding block
      const templateScaffold = tpl && tpl.id !== 'custom' ? `

═══════════════════════════════════════════════════════════
PROVEN TEMPLATE: ${tpl.name}
WHY THIS TEMPLATE CONVERTS: ${tpl.whyItConverts}
EXPECTED CPL FOR THIS MARKET: ${tpl.expectedCPL}
═══════════════════════════════════════════════════════════

HOOK PATTERNS — use these as the BASIS for your headlines. Customize with the user's specific city/listing/details. Don't invent new structures, evolve these.
${(tpl.hookPatterns || []).map((h, i) => `  ${i+1}. ${h}`).join('\n')}

BODY PATTERNS — use these as the BASIS for your primary text. Same rule: customize, don't invent.
${(tpl.bodyPatterns || []).map((b, i) => `  ${i+1}. ${b}`).join('\n')}

PRE-FILLED AUDIENCE (use as defaults; refine for the specific brief):
  Age: ${tpl.audience?.ageMin}-${tpl.audience?.ageMax}
  Gender: ${tpl.audience?.gender || 'all'}
  Radius: ${tpl.audience?.radiusMiles} miles around each target city center
  Interests: ${(tpl.audience?.interests || []).join(', ')}
  Behaviors: ${(tpl.audience?.behaviors || []).join(', ')}
  Exclusions: ${(tpl.audience?.exclusions || []).join(', ')}
  Income floor: ${tpl.audience?.incomeFloor || 'Top 25%'}
  ${tpl.audience?.customAudiences ? `Custom audiences: ${tpl.audience.customAudiences.join(', ')}` : ''}
  ${tpl.audience?.jobTitles ? `Job title layers: ${tpl.audience.jobTitles.join(', ')}` : ''}

CTA: ${tpl.ctaButton}

CREATIVE DIRECTION: ${tpl.creative}

LEAD MAGNET TO PITCH: ${tpl.leadMagnet}
═══════════════════════════════════════════════════════════
` : '';

      const userPrompt = `Personalize this proven template for the agent's specific brief.
${templateScaffold}

USER'S SPECIFIC BRIEF:
OBJECTIVE: ${form.objective}
${form.title ? `CAMPAIGN TITLE: ${form.title}` : ''}
${form.listingAddress ? `LISTING ADDRESS: ${form.listingAddress}` : ''}
${form.listingPrice ? `PRICE: $${form.listingPrice}` : ''}
${form.listingBeds || form.listingBaths || form.listingSqft ? `SPECS: ${form.listingBeds ? form.listingBeds + ' bed' : ''} ${form.listingBaths ? form.listingBaths + ' bath' : ''} ${form.listingSqft ? form.listingSqft + ' sqft' : ''}` : ''}
${form.listingDetails ? `DETAILS: ${form.listingDetails}` : ''}
TARGET CITIES (I-275 corridor): ${form.targetAreas}
${form.audienceHint ? `AUDIENCE HINT: ${form.audienceHint}` : ''}
DAILY BUDGET: $${form.dailyBudget}
DURATION: ${form.durationDays} days (total spend ~$${form.dailyBudget * form.durationDays})

Return STRICT JSON only (no markdown fences, no commentary):
{
  "campaignName": "short internal name",
  "objective": "${form.objective}",
  "headlines": ["...", "...", "..."],
  "primaryTexts": ["...", "...", "..."],
  "descriptions": ["...", "...", "..."],
  "ctaButton": "one of: Learn More, Sign Up, Get Quote, Get Offer, Apply Now, Contact Us, Download",
  "imageSuggestions": [
    {"concept": "describe the visual", "altText": "..."},
    {"concept": "...", "altText": "..."},
    {"concept": "...", "altText": "..."}
  ],
  "audience": {
    "locations": ["array of city, state strings"],
    "radiusMiles": 10,
    "ageMin": 25,
    "ageMax": 65,
    "gender": "all | women | men",
    "interests": ["specific FB interest names like 'Real estate', 'First-time buyer', etc."],
    "behaviors": ["specific FB behavior names like 'Likely to move', 'New homeowner', etc."],
    "exclusions": ["interests/behaviors to EXCLUDE if any"]
  },
  "budget": {
    "daily": ${form.dailyBudget},
    "totalDays": ${form.durationDays},
    "totalSpend": ${form.dailyBudget * form.durationDays},
    "recommendation": "one short sentence on whether this budget is realistic for the goal"
  },
  "schedule": {
    "bestStartDay": "e.g. Thursday",
    "bestHoursLocal": "e.g. 6PM-10PM"
  },
  "landingPageCopy": {
    "headline": "the page H1",
    "subheadline": "supporting line",
    "benefits": ["bullet 1", "bullet 2", "bullet 3"],
    "ctaText": "button text on the form",
    "formFields": ["Name", "Email", "Phone"]
  },
  "expectedPerformance": {
    "estimatedReach": "e.g. 5,000-12,000 people",
    "estimatedClicks": "e.g. 80-200",
    "estimatedLeads": "e.g. 8-25",
    "estimatedCostPerLead": "e.g. $4-10"
  },
  "followUpSequence": [
    {"day": 0, "channel": "email", "message": "first auto-response after they convert"},
    {"day": 1, "channel": "text", "message": "next touch"},
    {"day": 3, "channel": "email", "message": "value-add follow up"}
  ]
}`;

      const out = await callAI(userPrompt, sys, 3500);
      const parsed = parseAIJson(out);
      setDraft(parsed);
      toast.success('Campaign generated — review below');
    } catch (e) {
      console.error(e);
      toast.error(`AI generation failed: ${e.message}`);
    }
    setGenerating(false);
  };

  const save = () => {
    if (!draft) return;
    const c = {
      id: `camp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...draft,
      brief: { ...form },
      status: 'draft', // draft | ready | launched | paused | archived
      createdAt: new Date().toISOString(),
    };
    setCampaigns(p => [c, ...p]);
    setDraft(null);
    setView('list');
    toast.success('Campaign saved to your library');
  };

  const del = (id) => {
    if (!window.confirm('Delete this campaign? This only removes it from your library, not from Facebook if launched.')) return;
    setCampaigns(p => p.filter(c => c.id !== id));
    toast.success('Deleted');
  };

  const copy = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const viewing = viewingId ? campaigns.find(c => c.id === viewingId) : null;

  // ── LIST VIEW ──
  if (view === 'list' && !viewing) {
    return (
      <div className="page-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Megaphone size={22} color="#10b981" />
              <h1 style={{ margin: 0, fontFamily: "'DM Serif Display',serif", fontSize: 28, fontWeight: 900, color: '#fff' }}>Lead Generation</h1>
            </div>
            <div style={{ fontSize: 14, color: '#94a3b8' }}>
              AI generates everything you need to launch a Facebook + Instagram ad campaign — headlines, body copy, targeting, budget, landing page.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setView('format-finder')}>
              <Target size={13} /> Format Finder
            </button>
            <button className="btn btn-blue" onClick={() => setView('new')}>
              <Sparkles size={13} /> New Campaign
            </button>
          </div>
        </div>

        {/* Critical compliance + speed-to-lead reminders */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, marginBottom: 18 }}>
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.25)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#fbbf24', marginBottom: 4 }}>⚠ Housing Special Ad Category</div>
            <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.5 }}>
              Meta requires real estate ads to be in <strong>Housing SAC</strong>. Age locks to 18-65+, gender to "all", minimum 15-mile radius, no ZIP targeting. All templates here are pre-set to comply.
            </div>
          </div>
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.25)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#10b981', marginBottom: 4 }}>⏱ 5-minute lead response or it's wasted</div>
            <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.5 }}>
              77% of owners hire the FIRST agent they interview. Call within 5 min of every form-fill, or pipe through the AI Lead Responder I built (on every contact).
            </div>
          </div>
        </div>

        {/* Stats banner */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Saved Campaigns', val: campaigns.length, sub: 'in your library', color: '#7eb8f7' },
            { label: 'Drafts', val: campaigns.filter(c => c.status === 'draft').length, sub: 'awaiting launch', color: '#a78bfa' },
            { label: 'Launched', val: campaigns.filter(c => c.status === 'launched').length, sub: 'on Facebook', color: '#10b981' },
          ].map(s => (
            <div key={s.label} className="glass-card" style={{ textAlign: 'center', padding: 14 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: "'DM Serif Display',serif" }}>{s.val}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginTop: 2 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: '#475569' }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Campaign list */}
        {campaigns.length === 0 ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: 40 }}>
            <Megaphone size={36} color="#475569" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>No campaigns yet</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>Click "New Campaign" to generate your first ad package with AI.</div>
            <button className="btn btn-blue" onClick={() => setView('new')}><Sparkles size={13} /> Create your first campaign</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {campaigns.map(c => (
              <div key={c.id} className="glass-card" style={{ padding: 16, cursor: 'pointer', borderLeft: `3px solid ${c.status === 'launched' ? '#10b981' : c.status === 'ready' ? '#a78bfa' : '#475569'}` }} onClick={() => setViewingId(c.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{c.campaignName || c.brief?.title || 'Untitled'}</span>
                      <span className={`badge ${c.status === 'launched' ? 'badge-green' : c.status === 'ready' ? 'badge-blue' : 'badge-gray'}`}>{c.status}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>${c.budget?.daily}/day · {c.budget?.totalDays}d</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.headlines?.[0] || '(no headline)'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-icon btn-xs" onClick={(e) => { e.stopPropagation(); del(c.id); }}><Trash2 size={11} /></button>
                    <ChevronRight size={16} color="#475569" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── FORMAT FINDER VIEW ──
  if (view === 'format-finder') {
    return <FormatFinderView onBack={() => setView('list')} onUseInCampaign={() => setView('new')} />;
  }

  // ── DETAIL VIEW (saved campaign) ──
  if (viewing) {
    return <CampaignDetail
      campaign={viewing}
      onBack={() => setViewingId(null)}
      onCopy={copy}
      onDelete={() => { del(viewing.id); setViewingId(null); }}
      onUpdate={(updated) => setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c))}
      toast={toast}
    />;
  }

  // ── NEW CAMPAIGN VIEW ──
  return (
    <div className="page-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => { setView('list'); setDraft(null); }} style={{ marginBottom: 8 }}>← Back to campaigns</button>
          <h1 style={{ margin: 0, fontFamily: "'DM Serif Display',serif", fontSize: 26, fontWeight: 900, color: '#fff' }}>New Ad Campaign</h1>
        </div>
      </div>

      {!draft ? (
        <div className="glass-card">
          {/* Template picker */}
          <div className="label" style={{ marginBottom: 4 }}>Step 1 — Pick a proven template</div>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
            Each is tuned for the I-275 corridor at $350K+. The AI personalizes it for your specifics rather than starting from scratch.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, marginBottom: 18 }}>
            {PROVEN_TEMPLATES.map(t => {
              const isSelected = form.template === t.id;
              const segmentColor = t.segment === 'seller' ? '#10b981' : t.segment === 'buyer' ? '#7eb8f7' : t.segment === 'both' ? '#a78bfa' : '#64748b';
              const segmentBg = t.segment === 'seller' ? 'rgba(16,185,129,.15)' : t.segment === 'buyer' ? 'rgba(126,184,247,.15)' : t.segment === 'both' ? 'rgba(167,139,250,.15)' : 'rgba(100,116,139,.15)';
              return (
                <button
                  key={t.id}
                  onClick={() => setForm(f => ({
                    ...f,
                    template: t.id,
                    // Pre-fill recommended budget/duration from the template,
                    // but only if she hasn't customized them yet.
                    dailyBudget: t.dailyBudget || f.dailyBudget,
                    durationDays: t.durationDays || f.durationDays,
                  }))}
                  style={{
                    padding: '14px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                    border: `1px solid ${isSelected ? '#10b981' : 'rgba(255,255,255,.1)'}`,
                    background: isSelected ? 'rgba(16,185,129,.08)' : 'rgba(255,255,255,.02)',
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                    <div style={{ fontSize: 22 }}>{t.icon}</div>
                    {t.segment !== 'custom' && (
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: segmentBg, color: segmentColor, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                        {t.segment === 'both' ? 'BUYER+SELLER' : t.segment}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>{t.name}</div>
                  {t.whyItConverts && (
                    <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.45 }}>{t.whyItConverts}</div>
                  )}
                  {t.expectedCPL && t.expectedCPL !== 'Varies' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px' }}>Expected CPL</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#10b981' }}>{t.expectedCPL}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Objective */}
          <div className="label" style={{ marginBottom: 8 }}>Step 2 — Campaign objective</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 18 }}>
            {CAMPAIGN_OBJECTIVES.map(o => (
              <button
                key={o.id}
                onClick={() => setForm(f => ({ ...f, objective: o.id }))}
                style={{
                  padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  border: `1px solid ${form.objective === o.id ? '#7eb8f7' : 'rgba(255,255,255,.1)'}`,
                  background: form.objective === o.id ? 'rgba(126,184,247,.08)' : 'rgba(255,255,255,.02)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{o.label}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{o.desc}</div>
              </button>
            ))}
          </div>

          {/* Brief details */}
          <div className="label" style={{ marginBottom: 8 }}>Step 3 — Brief details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <div className="label" style={{ fontSize: 11 }}>Campaign Title (optional)</div>
              <input className="input" placeholder="e.g. May 2026 — Livonia New Listings" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <div className="label" style={{ fontSize: 11 }}>Listing Address (if applicable)</div>
              <input className="input" placeholder="123 Maple St, Livonia MI" value={form.listingAddress} onChange={e => setForm(f => ({ ...f, listingAddress: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div><div className="label" style={{ fontSize: 11 }}>Price</div><input className="input" placeholder="549000" value={form.listingPrice} onChange={e => setForm(f => ({ ...f, listingPrice: e.target.value }))} /></div>
            <div><div className="label" style={{ fontSize: 11 }}>Beds</div><input className="input" placeholder="4" value={form.listingBeds} onChange={e => setForm(f => ({ ...f, listingBeds: e.target.value }))} /></div>
            <div><div className="label" style={{ fontSize: 11 }}>Baths</div><input className="input" placeholder="3" value={form.listingBaths} onChange={e => setForm(f => ({ ...f, listingBaths: e.target.value }))} /></div>
            <div><div className="label" style={{ fontSize: 11 }}>Sqft</div><input className="input" placeholder="2400" value={form.listingSqft} onChange={e => setForm(f => ({ ...f, listingSqft: e.target.value }))} /></div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div className="label" style={{ fontSize: 11 }}>Listing / Topic Details (optional, gives AI more to work with)</div>
            <textarea className="textarea" style={{ minHeight: 80 }} placeholder="Updated kitchen, finished basement, walking distance to Stevenson HS, etc." value={form.listingDetails} onChange={e => setForm(f => ({ ...f, listingDetails: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <div className="label" style={{ fontSize: 11 }}>Target Areas (cities/zip codes, comma-sep)</div>
              <input className="input" value={form.targetAreas} onChange={e => setForm(f => ({ ...f, targetAreas: e.target.value }))} />
            </div>
            <div>
              <div className="label" style={{ fontSize: 11 }}>Audience Hint (optional)</div>
              <input className="input" placeholder="first-time buyers, downsizers, etc." value={form.audienceHint} onChange={e => setForm(f => ({ ...f, audienceHint: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            <div>
              <div className="label" style={{ fontSize: 11 }}>Daily Budget ($)</div>
              <input className="input" type="number" min="1" value={form.dailyBudget} onChange={e => setForm(f => ({ ...f, dailyBudget: Number(e.target.value) || 5 }))} />
            </div>
            <div>
              <div className="label" style={{ fontSize: 11 }}>Duration (days)</div>
              <input className="input" type="number" min="1" max="60" value={form.durationDays} onChange={e => setForm(f => ({ ...f, durationDays: Number(e.target.value) || 7 }))} />
            </div>
          </div>

          <div style={{ padding: '10px 12px', background: 'rgba(126,184,247,.06)', borderRadius: 8, fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>
            💰 Total estimated spend: <strong style={{ color: '#fff' }}>${form.dailyBudget * form.durationDays}</strong> over {form.durationDays} days. (Realistic minimum to test a campaign: $35-50 total. Below that, FB doesn't have enough data to optimize.)
          </div>

          <button className="btn btn-blue" onClick={generate} disabled={generating} style={{ padding: '12px 18px', fontSize: 14, width: '100%' }}>
            {generating ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> AI is generating your campaign…</> : <><Sparkles size={13} /> Generate Campaign</>}
          </button>
        </div>
      ) : (
        <CampaignDraftView draft={draft} onSave={save} onRegenerate={generate} onDiscard={() => setDraft(null)} onCopy={copy} toast={toast} regenerating={generating} />
      )}
    </div>
  );
};

// ── CAMPAIGN DRAFT VIEW (right after AI generation, before save) ─────────────
const CampaignDraftView = ({ draft, onSave, onRegenerate, onDiscard, onCopy, toast, regenerating }) => {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-blue" onClick={onSave}><Save size={13} /> Save to Library</button>
        <button className="btn btn-ghost" onClick={onRegenerate} disabled={regenerating}>{regenerating ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />} Regenerate</button>
        <button className="btn btn-ghost" onClick={onDiscard}>Discard</button>
      </div>
      <CampaignFullView c={draft} onCopy={onCopy} />
    </div>
  );
};

// ── CAMPAIGN DETAIL VIEW (saved campaign opened) ─────────────────────────────
const CampaignDetail = ({ campaign, onBack, onCopy, onDelete, toast, onUpdate }) => {
  const [integrations] = useLS('integrations', {});
  const [adAccountId, setAdAccountId] = useLS('meta_ad_account_id', '');
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [landingPageUrl, setLandingPageUrl] = useState(campaign.landingPageCopy?.url || '');
  const [launchProgress, setLaunchProgress] = useState(null); // { steps, ok, error, adsManagerUrl, notes }
  const [launching, setLaunching] = useState(false);

  const meta = integrations.meta || {};
  const accessToken = meta.accessToken;
  const pageId = meta.pageId;
  const isLaunched = campaign.status === 'launched';

  const launch = async () => {
    if (!accessToken) return toast.error('Connect Facebook in Integrations first (need a token with ads_management scope).');
    if (!pageId) return toast.error('Set your Facebook Page ID in Integrations.');
    if (!adAccountId.trim()) return toast.error('Enter your Ad Account ID (looks like act_XXXXX).');
    setLaunching(true);
    setLaunchProgress({ steps: [], notes: [] });
    try {
      const r = await fetch('/api/meta-ads/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign,
          accessToken,
          adAccountId: adAccountId.trim(),
          pageId,
          landingPageUrl: landingPageUrl.trim() || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setLaunchProgress({ ok: false, error: data.error?.message || `Failed: ${r.status}`, steps: data.steps || [] });
        toast.error(data.error?.message || `Launch failed: ${r.status}`);
      } else {
        setLaunchProgress({ ok: true, ...data });
        onUpdate?.({ ...campaign, status: 'launched', metaCampaignId: data.campaignId, adsManagerUrl: data.adsManagerUrl, launchedAt: new Date().toISOString() });
        toast.success('Campaign launched on Facebook (PAUSED — review in Ads Manager).');
      }
    } catch (e) {
      setLaunchProgress({ ok: false, error: e.message });
      toast.error(`Launch failed: ${e.message}`);
    }
    setLaunching(false);
  };

  return (
    <div className="page-content">
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>← Back to campaigns</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontFamily: "'DM Serif Display',serif", fontSize: 26, fontWeight: 900, color: '#fff' }}>{campaign.campaignName}</h1>
            {isLaunched && <span className="badge badge-green">launched (paused)</span>}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Saved {new Date(campaign.createdAt).toLocaleString()}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {!isLaunched && (
            <button className="btn btn-blue" onClick={() => setShowLaunchModal(true)}>
              🚀 Launch on Facebook
            </button>
          )}
          {isLaunched && campaign.adsManagerUrl && (
            <a href={campaign.adsManagerUrl} target="_blank" rel="noreferrer" className="btn btn-blue">
              View in Ads Manager →
            </a>
          )}
          <button className="btn btn-danger btn-sm" onClick={onDelete}><Trash2 size={12} /> Delete</button>
        </div>
      </div>
      <CampaignFullView c={campaign} onCopy={onCopy} />

      {/* Compact instructions for backup manual path */}
      {!isLaunched && (
        <div className="glass-card" style={{ marginTop: 16, background: 'rgba(126,184,247,.06)', borderColor: 'rgba(126,184,247,.2)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 8 }}>📋 Manual launch (backup path if one-click fails)</div>
          <ol style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.7, paddingLeft: 22, margin: 0 }}>
            <li>Open <a href="https://adsmanager.facebook.com" target="_blank" rel="noreferrer" style={{ color: '#7eb8f7' }}>Ads Manager</a> → Create → objective: <strong style={{ color: '#fff' }}>{campaign.objective}</strong></li>
            <li>Set Special Ad Category: <strong style={{ color: '#fff' }}>Housing</strong></li>
            <li>Copy headlines/text/audience using the buttons above</li>
            <li>Daily ${campaign.budget?.daily} / {campaign.budget?.totalDays} days · attach a creative · review · activate</li>
          </ol>
        </div>
      )}

      {/* Launch Modal */}
      {showLaunchModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => !launching && setShowLaunchModal(false)}
        >
          <div
            style={{ background: '#0d1117', borderRadius: 16, padding: '24px 28px', maxWidth: 620, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid rgba(255,255,255,.1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontFamily: "'DM Serif Display',serif", fontSize: 22, fontWeight: 900, color: '#fff' }}>🚀 Launch on Facebook</h2>
              {!launching && <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowLaunchModal(false)}><X size={14} /></button>}
            </div>

            {!launchProgress && (
              <>
                <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 14, lineHeight: 1.6 }}>
                  This creates a real Facebook campaign in <strong style={{ color: '#fbbf24' }}>PAUSED state</strong>. You'll review + activate in Ads Manager. No surprise spend.
                </div>

                <div className="label" style={{ marginBottom: 4 }}>Ad Account ID</div>
                <input
                  className="input"
                  placeholder="act_1234567890"
                  value={adAccountId}
                  onChange={(e) => setAdAccountId(e.target.value)}
                  style={{ marginBottom: 4, fontFamily: 'monospace', fontSize: 12 }}
                />
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 14 }}>
                  Find this in Business Manager → Ad Accounts → starts with "act_". Saved for next time.
                </div>

                <div className="label" style={{ marginBottom: 4 }}>Landing page URL (where clicks go)</div>
                <input
                  className="input"
                  placeholder="https://your-listing-page.com OR your Facebook page URL"
                  value={landingPageUrl}
                  onChange={(e) => setLandingPageUrl(e.target.value)}
                  style={{ marginBottom: 14, fontFamily: 'monospace', fontSize: 12 }}
                />

                <div style={{ padding: '10px 12px', background: 'rgba(245,158,11,.08)', borderRadius: 8, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#fbbf24', marginBottom: 4 }}>⚠ Before clicking Launch</div>
                  <ul style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
                    <li>Your Facebook token needs <code>ads_management</code> scope. If you only added it for posting, re-generate at <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noreferrer" style={{ color: '#7eb8f7' }}>Graph API Explorer</a> with that scope.</li>
                    <li>Your Ad Account needs a payment method attached.</li>
                    <li>You'll need to manually attach an image/video creative in Ads Manager before activating.</li>
                  </ul>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-blue" onClick={launch} disabled={launching} style={{ flex: 1, padding: '12px 16px' }}>
                    🚀 Launch as PAUSED campaign
                  </button>
                  <button className="btn btn-ghost" onClick={() => setShowLaunchModal(false)}>Cancel</button>
                </div>
              </>
            )}

            {launchProgress && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 12 }}>
                  {launching ? '⏳ Creating campaign…' : launchProgress.ok ? '✅ Campaign launched (paused)' : '❌ Launch failed'}
                </div>

                {(launchProgress.steps || []).map((s, i) => (
                  <div key={i} style={{ padding: '8px 12px', background: 'rgba(255,255,255,.03)', borderRadius: 6, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#cbd5e1' }}>
                      {s.status === 'done' ? '✓' : s.status === 'running' ? '⏳' : '✗'} {s.step}
                      {s.id && <span style={{ color: '#64748b', marginLeft: 6, fontSize: 10 }}>id: {s.id}</span>}
                      {s.step === 'targeting' && s.status === 'done' && (
                        <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>
                          ({s.resolvedInterests} interests, {s.resolvedCities} cities resolved)
                        </span>
                      )}
                    </span>
                  </div>
                ))}

                {launchProgress.error && (
                  <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: '#f87171', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{launchProgress.error}</div>
                  </div>
                )}

                {launchProgress.ok && launchProgress.notes && (
                  <div style={{ padding: '10px 12px', background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.25)', borderRadius: 8, marginTop: 14 }}>
                    <ul style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
                      {launchProgress.notes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  </div>
                )}

                {launchProgress.ok && launchProgress.adsManagerUrl && (
                  <a href={launchProgress.adsManagerUrl} target="_blank" rel="noreferrer" className="btn btn-blue" style={{ marginTop: 14, width: '100%' }}>
                    Open in Ads Manager →
                  </a>
                )}

                {!launching && (
                  <button className="btn btn-ghost" onClick={() => { setShowLaunchModal(false); setLaunchProgress(null); }} style={{ marginTop: 8, width: '100%' }}>
                    Close
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── SHARED FULL CAMPAIGN VIEW ────────────────────────────────────────────────
// ── FORMAT FINDER VIEW ──────────────────────────────────────────────────────
// Wizard: 4 questions → format recommendation card.
const FormatFinderView = ({ onBack, onUseInCampaign }) => {
  const [answers, setAnswers] = useState({
    goal: null,         // leads | awareness | traffic | engagement
    asset: null,        // listing | lead_magnet | market_update | just_sold | agent_brand
    media: null,        // photos | video | both | nothing
    budget: null,       // test | growing | scale
  });

  const allAnswered = answers.goal && answers.asset && answers.media && answers.budget;
  const recommendation = allAnswered ? recommendFormat(answers) : null;
  const recFormat = recommendation ? FORMAT_FINDER_FORMATS[recommendation.key] : null;

  const Q = ({ label, value, options, onChange }) => (
    <div style={{ marginBottom: 20 }}>
      <div className="label" style={{ marginBottom: 8, fontSize: 13 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        {options.map(opt => {
          const isSelected = value === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              style={{
                padding: '12px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                border: `1px solid ${isSelected ? '#10b981' : 'rgba(255,255,255,.1)'}`,
                background: isSelected ? 'rgba(16,185,129,.08)' : 'rgba(255,255,255,.02)',
              }}
            >
              <div style={{ fontSize: 18, marginBottom: 4 }}>{opt.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{opt.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="page-content">
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>← Back to campaigns</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Target size={22} color="#a78bfa" />
        <h1 style={{ margin: 0, fontFamily: "'DM Serif Display',serif", fontSize: 26, fontWeight: 900, color: '#fff' }}>Format Finder</h1>
      </div>
      <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24 }}>
        Tell me what you're working with — I'll recommend the optimal ad format with specs, creative direction, and expected CPL.
      </div>

      <div className="glass-card">
        <Q
          label="1. What's your campaign goal?"
          value={answers.goal}
          onChange={(v) => setAnswers(a => ({ ...a, goal: v }))}
          options={[
            { id: 'leads', icon: '📥', label: 'Lead Generation', desc: 'Capture name/email/phone — the most common' },
            { id: 'awareness', icon: '👁', label: 'Brand Awareness', desc: 'Build a warm audience for later retargeting' },
            { id: 'traffic', icon: '🚀', label: 'Traffic to Page', desc: 'Drive clicks to a listing or landing page' },
            { id: 'engagement', icon: '❤️', label: 'Engagement', desc: 'Likes, comments, shares — top of funnel' },
          ]}
        />
        <Q
          label="2. What are you promoting?"
          value={answers.asset}
          onChange={(v) => setAnswers(a => ({ ...a, asset: v }))}
          options={[
            { id: 'listing', icon: '🏡', label: 'A specific listing', desc: 'House for sale, address known' },
            { id: 'lead_magnet', icon: '📘', label: 'Lead magnet / CMA', desc: 'Home value, school guide, market report' },
            { id: 'market_update', icon: '📊', label: 'Market data update', desc: 'Median price, DOM, neighborhood stats' },
            { id: 'just_sold', icon: '✅', label: 'A just-sold success', desc: 'Social proof from a recent close' },
            { id: 'agent_brand', icon: '✨', label: 'You as an agent', desc: 'Personal brand, neighborhood walk, expertise' },
          ]}
        />
        <Q
          label="3. What media do you already have?"
          value={answers.media}
          onChange={(v) => setAnswers(a => ({ ...a, media: v }))}
          options={[
            { id: 'photos', icon: '📷', label: 'Photos only', desc: 'Property photos, headshots, no video' },
            { id: 'video', icon: '🎥', label: 'Video / Reels', desc: 'Talking head, walkthrough, b-roll' },
            { id: 'both', icon: '🎬', label: 'Both', desc: 'Photos + video — flexible' },
            { id: 'nothing', icon: '⬜', label: 'Nothing yet', desc: 'Tell me what to make' },
          ]}
        />
        <Q
          label="4. What's your budget level?"
          value={answers.budget}
          onChange={(v) => setAnswers(a => ({ ...a, budget: v }))}
          options={[
            { id: 'test', icon: '🧪', label: 'Test ($5-10/day)', desc: 'See if it works before scaling' },
            { id: 'growing', icon: '📈', label: 'Growing ($15-30/day)', desc: 'Past test, scaling winners' },
            { id: 'scale', icon: '🚀', label: 'Scale ($50+/day)', desc: 'Proven offer, max volume' },
          ]}
        />
      </div>

      {recommendation && recFormat && (
        <div className="glass-card" style={{ marginTop: 16, background: 'linear-gradient(135deg, rgba(167,139,250,.10), rgba(16,185,129,.06))', borderColor: 'rgba(167,139,250,.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 32 }}>{recFormat.icon}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '.5px' }}>Recommended Format</div>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, fontWeight: 900, color: '#fff' }}>{recFormat.name}</div>
            </div>
          </div>

          <div style={{ padding: '12px 14px', background: 'rgba(167,139,250,.08)', borderRadius: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Why this format</div>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>{recFormat.whyThisFormat}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
            <SpecBlock label="Aspect Ratio" value={recFormat.aspectRatio} />
            <SpecBlock label="Dimensions" value={recFormat.dimensions} />
            <SpecBlock label="Duration" value={recFormat.duration} />
            <SpecBlock label="File Format" value={recFormat.fileFormat} />
            <SpecBlock label="Caption Length" value={recFormat.captionLength} />
            <SpecBlock label="Expected CPL" value={recFormat.expectedCPL} color="#10b981" />
          </div>

          <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,.03)', borderRadius: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Creative Direction</div>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>{recFormat.creativeDirection}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,.02)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>Best for</div>
              <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>{recFormat.bestFor}</div>
            </div>
            <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,.02)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>Placement</div>
              <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>{recFormat.placement}</div>
            </div>
          </div>

          {recommendation.alts?.length > 0 && (
            <div style={{ paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.06)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Alternative formats to test</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {recommendation.alts.map(altKey => {
                  const alt = FORMAT_FINDER_FORMATS[altKey];
                  if (!alt) return null;
                  return (
                    <span key={altKey} style={{ fontSize: 12, padding: '4px 10px', background: 'rgba(126,184,247,.1)', color: '#7eb8f7', borderRadius: 8, border: '1px solid rgba(126,184,247,.25)' }}>
                      {alt.icon} {alt.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-blue" onClick={onUseInCampaign} style={{ flex: 1 }}>
              <Sparkles size={13} /> Use this in a new campaign
            </button>
            <button className="btn btn-ghost" onClick={() => setAnswers({ goal: null, asset: null, media: null, budget: null })}>
              Reset
            </button>
          </div>
        </div>
      )}

      {!allAnswered && (
        <div className="glass-card" style={{ marginTop: 16, padding: 18, textAlign: 'center', color: '#64748b' }}>
          Answer all 4 questions above to get your format recommendation.
        </div>
      )}
    </div>
  );
};

const SpecBlock = ({ label, value, color = '#fff' }) => (
  <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,.03)', borderRadius: 8 }}>
    <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1.4 }}>{value}</div>
  </div>
);

const CampaignFullView = ({ c, onCopy }) => {
  const Section = ({ title, icon: Icon, children }) => (
    <div className="glass-card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        {Icon && <Icon size={15} color="#7eb8f7" />}
        <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '.5px' }}>{title}</div>
      </div>
      {children}
    </div>
  );

  const CopyItem = ({ text, label, max }) => (
    <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,.03)', borderRadius: 8, marginBottom: 6, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ flex: 1, fontSize: 13, color: '#fff', lineHeight: 1.5 }}>
        {text}
        {max && (
          <div style={{ fontSize: 10, color: text.length > max ? '#f87171' : '#64748b', marginTop: 4 }}>
            {text.length} / {max} chars {text.length > max && '⚠ over limit'}
          </div>
        )}
      </div>
      <button className="btn btn-ghost btn-xs" onClick={() => onCopy(text, label)}><Copy size={11} /></button>
    </div>
  );

  return (
    <div>
      {c.headlines?.length > 0 && (
        <Section title="Headlines (≤40 chars)" icon={FileText}>
          {c.headlines.map((h, i) => <CopyItem key={i} text={h} label={`Headline ${i + 1}`} max={40} />)}
        </Section>
      )}

      {c.primaryTexts?.length > 0 && (
        <Section title="Primary Text (≤125 chars to avoid 'See More')" icon={FileText}>
          {c.primaryTexts.map((t, i) => <CopyItem key={i} text={t} label={`Primary text ${i + 1}`} max={125} />)}
        </Section>
      )}

      {c.descriptions?.length > 0 && (
        <Section title="Link Descriptions (≤30 chars)" icon={FileText}>
          {c.descriptions.map((d, i) => <CopyItem key={i} text={d} label={`Description ${i + 1}`} max={30} />)}
        </Section>
      )}

      {c.ctaButton && (
        <Section title="Call-to-Action Button" icon={Check}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ padding: '8px 16px', background: '#1a5aa0', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 14 }}>{c.ctaButton}</span>
            <button className="btn btn-ghost btn-xs" onClick={() => onCopy(c.ctaButton, 'CTA')}><Copy size={11} /> Copy</button>
          </div>
        </Section>
      )}

      {c.imageSuggestions?.length > 0 && (
        <Section title="Image / Creative Concepts" icon={ImageIcon}>
          {c.imageSuggestions.map((img, i) => (
            <div key={i} style={{ padding: '10px 12px', background: 'rgba(255,255,255,.03)', borderRadius: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 13, color: '#fff', marginBottom: 4 }}>{img.concept}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Alt text: {img.altText}</div>
            </div>
          ))}
        </Section>
      )}

      {c.audience && (
        <Section title="Audience Targeting" icon={Users}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {c.audience.locations?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}><MapPin size={11} style={{ display: 'inline', marginRight: 4 }} />Locations</div>
                <div style={{ fontSize: 12, color: '#cbd5e1' }}>{c.audience.locations.join(', ')}{c.audience.radiusMiles ? ` (+${c.audience.radiusMiles}mi)` : ''}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Age</div>
              <div style={{ fontSize: 12, color: '#cbd5e1' }}>{c.audience.ageMin}–{c.audience.ageMax}</div>
            </div>
            {c.audience.gender && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Gender</div>
                <div style={{ fontSize: 12, color: '#cbd5e1', textTransform: 'capitalize' }}>{c.audience.gender}</div>
              </div>
            )}
          </div>
          {c.audience.interests?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Interests (paste into FB's "Detailed Targeting")</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {c.audience.interests.map((i) => (
                  <span key={i} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, background: 'rgba(126,184,247,.1)', color: '#7eb8f7' }}>{i}</span>
                ))}
              </div>
            </div>
          )}
          {c.audience.behaviors?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Behaviors</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {c.audience.behaviors.map((b) => (
                  <span key={b} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, background: 'rgba(167,139,250,.1)', color: '#a78bfa' }}>{b}</span>
                ))}
              </div>
            </div>
          )}
          {c.audience.exclusions?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Exclusions</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {c.audience.exclusions.map((b) => (
                  <span key={b} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, background: 'rgba(239,68,68,.1)', color: '#f87171' }}>{b}</span>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {c.budget && (
        <Section title="Budget & Schedule" icon={DollarSign}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <div><div style={{ fontSize: 11, color: '#64748b' }}>Daily</div><div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>${c.budget.daily}</div></div>
            <div><div style={{ fontSize: 11, color: '#64748b' }}>Duration</div><div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{c.budget.totalDays}d</div></div>
            <div><div style={{ fontSize: 11, color: '#64748b' }}>Total</div><div style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>${c.budget.totalSpend}</div></div>
            {c.schedule?.bestStartDay && <div><div style={{ fontSize: 11, color: '#64748b' }}>Best start</div><div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{c.schedule.bestStartDay}</div></div>}
            {c.schedule?.bestHoursLocal && <div><div style={{ fontSize: 11, color: '#64748b' }}>Best hours</div><div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{c.schedule.bestHoursLocal}</div></div>}
          </div>
          {c.budget.recommendation && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10, fontStyle: 'italic' }}>💡 {c.budget.recommendation}</div>}
        </Section>
      )}

      {c.expectedPerformance && (
        <Section title="Expected Performance" icon={TrendingUp}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <div><div style={{ fontSize: 11, color: '#64748b' }}><Eye size={11} style={{ display: 'inline', marginRight: 3 }} />Estimated reach</div><div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{c.expectedPerformance.estimatedReach}</div></div>
            <div><div style={{ fontSize: 11, color: '#64748b' }}>Clicks</div><div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{c.expectedPerformance.estimatedClicks}</div></div>
            <div><div style={{ fontSize: 11, color: '#64748b' }}>Leads</div><div style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>{c.expectedPerformance.estimatedLeads}</div></div>
            <div><div style={{ fontSize: 11, color: '#64748b' }}>Cost per lead</div><div style={{ fontSize: 14, fontWeight: 700, color: '#a78bfa' }}>{c.expectedPerformance.estimatedCostPerLead}</div></div>
          </div>
        </Section>
      )}

      {c.landingPageCopy && (
        <Section title="Landing Page Copy (where the ad clicks land)" icon={FileText}>
          <div style={{ padding: 14, background: 'rgba(255,255,255,.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,.06)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 6 }}>{c.landingPageCopy.headline}</div>
            <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 12 }}>{c.landingPageCopy.subheadline}</div>
            {c.landingPageCopy.benefits && (
              <ul style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.7, paddingLeft: 20, margin: 0, marginBottom: 12 }}>
                {c.landingPageCopy.benefits.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
            <button style={{ padding: '10px 20px', background: '#1a5aa0', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: 13, border: 'none' }}>{c.landingPageCopy.ctaText}</button>
            {c.landingPageCopy.formFields && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>Form fields: {c.landingPageCopy.formFields.join(', ')}</div>
            )}
          </div>
          <button className="btn btn-ghost btn-xs" style={{ marginTop: 8 }} onClick={() => onCopy(JSON.stringify(c.landingPageCopy, null, 2), 'Landing page copy')}><Copy size={11} /> Copy as JSON</button>
        </Section>
      )}

      {c.followUpSequence?.length > 0 && (
        <Section title="Auto Follow-Up Sequence (after lead converts)" icon={Calendar}>
          {c.followUpSequence.map((step, i) => (
            <div key={i} style={{ padding: '10px 12px', background: 'rgba(255,255,255,.03)', borderRadius: 8, marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#7eb8f7' }}>Day {step.day} · {step.channel}</span>
                <button className="btn btn-ghost btn-xs" onClick={() => onCopy(step.message, `Day ${step.day} message`)}><Copy size={11} /></button>
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>{step.message}</div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
            💡 These auto-send when leads come through your existing FB webhook. Wire them up via Email Campaigns (next build phase).
          </div>
        </Section>
      )}
    </div>
  );
};

export default AdComposer;
