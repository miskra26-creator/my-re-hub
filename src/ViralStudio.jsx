// ViralStudio.jsx — Library of 15 documented viral content templates for
// real estate, tuned to Monica's I-275 corridor / $350K+ market.
//
// Each template carries: name, category, hook pattern, why it works (with
// platform-algorithm reasoning), a real-world example with documented view
// counts, format requirements, and a "best for" use case.
//
// Click a template → AI personalizes the hook for the user's specific
// listing/topic. Output is a ready-to-film script (hook, body, CTA, caption,
// hashtags) she can shoot today.
//
// Research sources (cited per template via `source` field): Coffee &
// Contracts, BAM, Luxury Presence, NAR, HomeLight, Inman, Bloomberg,
// Dataslayer, UseVisuals, Buffer, Hootsuite, Resimpli, Tom Ferry.
// See ad_strategy_metro_detroit.md memory for the full source list.

import { useState } from 'react';
import { useLS } from './cloudHooks';
import {
  Sparkles, TrendingUp, Eye, Heart, Save, Share2, Copy, Filter,
  PlayCircle, RefreshCw, X, ChevronRight, Target,
} from 'lucide-react';

const VIRAL_CATEGORIES = [
  { id: 'all', name: 'All', icon: '🎬' },
  { id: 'listing', name: 'Listing Tours', icon: '🏡' },
  { id: 'lifestyle', name: 'Lifestyle / POV', icon: '🌅' },
  { id: 'education', name: 'Education / Spicy', icon: '🧠' },
  { id: 'social_proof', name: 'Social Proof', icon: '✅' },
  { id: 'day_in_life', name: 'Day in the Life', icon: '☀️' },
  { id: 'comparison', name: 'Comparisons', icon: '⚖️' },
  { id: 'trend', name: 'Trend-Jacks', icon: '🎵' },
];

const VIRAL_TEMPLATES = [
  {
    id: 'pov_immersive',
    name: 'POV: You Just Walked Into…',
    category: 'lifestyle',
    icon: '👀',
    hookPattern: 'POV: You just walked into a ${price} home in {neighborhood}',
    altHooks: [
      'POV: It\'s Sunday morning in downtown {city}',
      'POV: You bought the {feature} home in {neighborhood}',
    ],
    whyItWorks: 'Drops the viewer into a first-person fantasy — identification + escapism. The POV trend offers an interactive, relatable experience that the algorithm rewards with high completion rates.',
    realExample: 'Rochelle Maize\'s POV-style luxury kitchen tour (Beverly Hills) → 9M+ views, listing went into escrow within 2 weeks',
    format: 'Vertical 9:16, 10-25 sec, captions ON, hook text overlaid in first frame',
    structure: ['Sec 0-3: Hero shot + bold POV text', 'Sec 3-15: Walking-through reveal (kitchen → living → showpiece)', 'Sec 15-25: Wow moment + CTA'],
    bestFor: 'Listing tours, Sunday-morning lifestyle, downtown Plymouth/Northville scenes, lake-town content',
    expectedOutcome: '5-50K views local, 100K+ if hyper-local + a wow feature',
    source: 'Luxury Presence, Rochelle Maize blog',
  },
  {
    id: 'price_comparison',
    name: 'Houses You Can Buy With $X (3-way)',
    category: 'comparison',
    icon: '💰',
    hookPattern: 'Here\'s what ${price} gets you in {city1} vs. {city2} vs. {city3}',
    altHooks: [
      '${price} in Livonia vs. Plymouth vs. Northville — and only one is worth it',
      'What does $500K really buy in the I-275 corridor?',
    ],
    whyItWorks: 'Specificity signals expertise; numbers stop the scroll. Three-way comparisons trigger save-and-share ("I have to show my husband"). Comment bait: "Which would you pick?"',
    realExample: '"What $500K gets you in each state" — an established viral genre with millions of cumulative views per category on TikTok',
    format: 'Vertical 9:16, 20-35 sec, three quick cuts (~7s each), price-overlay graphics',
    structure: ['Sec 0-3: "$450K in three Metro Detroit suburbs"', 'Sec 3-10: Home #1 (Livonia)', 'Sec 10-17: Home #2 (Plymouth)', 'Sec 17-25: Home #3 (Northville) — save the best for last', 'Sec 25-30: "Which would you pick? 👇"'],
    bestFor: 'Weekly signature franchise. Build a repeatable format ("Comparison Wednesdays")',
    expectedOutcome: 'High save rate; builds a warm audience faster than any other format',
    source: 'TikTok discovery page',
  },
  {
    id: 'most_expensive',
    name: 'Touring The Most Expensive Home In…',
    category: 'listing',
    icon: '🏰',
    hookPattern: 'I\'m touring the most expensive house currently for sale in {area} — and the {wow feature} will surprise you',
    altHooks: [
      'The priciest listing in {neighborhood} right now — wait for the {feature}',
      'Inside ${price}: {neighborhood}\'s record-setting listing',
    ],
    whyItWorks: 'Curiosity gap + voyeurism + delayed reveal. The viewer can\'t look away because they\'re promised a reveal that hasn\'t come yet.',
    realExample: 'Josh Altman\'s pool-of-a-listing video → 4M+ views in days using this exact curiosity-of-extremes formula',
    format: 'Vertical 9:16, 30-60 sec; tease the wow feature in the hook, deliver it at 80% mark',
    structure: ['Sec 0-3: Hook with curiosity tease ("…and the closet will surprise you")', 'Sec 3-25: Walk through the property at pace, building anticipation', 'Sec 25-45: Reveal the wow feature', 'Sec 45-55: Price + CTA'],
    bestFor: 'Whenever a top-of-market listing comes on the market in Northville/Bloomfield/Birmingham',
    expectedOutcome: '50K-1M+ views depending on the property',
    source: 'Luxury Presence TikTok guide',
  },
  {
    id: 'spicy_take',
    name: 'Spicy Take / Contrarian',
    category: 'education',
    icon: '🌶',
    hookPattern: 'Stop trusting {thing}. Here\'s what they got wrong about {your city}.',
    altHooks: [
      'Zillow said this Northville home was worth $385K. I sold it for $419K.',
      'Most agents will lie to you about {topic}. Here\'s the truth.',
    ],
    whyItWorks: 'BAM (Eric Simon / The Broke Agent): "The spicy take hook tells your audience you\'re about to say something spicy" — sustained watch time spikes when controversy is teased.',
    realExample: 'BAM documented spicy-take Reels with 3-5x typical watch time. Show Zestimate ($X) vs. actual sale price ($Y), explain why.',
    format: 'Talking head, 30-45s, captions critical, screenshot/data overlay',
    structure: ['Sec 0-3: Bold contrarian claim', 'Sec 3-15: Setup the conventional wisdom', 'Sec 15-35: Your evidence (screenshot, data, story)', 'Sec 35-45: Lesson + CTA ("save this before you list")'],
    bestFor: 'Establishing market authority, building seller-lead trust',
    expectedOutcome: 'High saves + comments; positions you as the data-driven local expert',
    source: 'BAM viral hooks playbook',
  },
  {
    id: 'dog_whistle',
    name: 'Dog Whistle (Hyper-Targeted)',
    category: 'education',
    icon: '📍',
    hookPattern: 'If you live in {subdivision} near {landmark}, this message is for you.',
    altHooks: [
      'Bradford of Northville homeowners — listen up.',
      'If you bought in Plymouth Crossings between 2010 and 2018, you need to see this.',
    ],
    whyItWorks: 'Counter-intuitively NARROWS the audience, which increases watch-through among the right people, which signals quality to the algorithm. Eric Simon teaches this verbatim — narrow audience = quality signal.',
    realExample: 'BAM Eric Simon hook: "If you know anybody who lives in the Belle Oaks neighborhood right by 46 and Blanco, this message is for you." Documented engagement spike.',
    format: 'Talking head, 20-30s, very local visuals',
    structure: ['Sec 0-3: Hyper-specific callout', 'Sec 3-20: The market-specific insight only that neighborhood needs', 'Sec 20-30: CTA — DM for their custom number'],
    bestFor: 'Sub-targeting wealthy or quietly-curious sellers in specific Metro Detroit subdivisions',
    expectedOutcome: 'Low view count, very high lead quality — exactly what $350K+ needs',
    source: 'BAM',
  },
  {
    id: 'mistakes',
    name: 'X Mistakes Buyers/Sellers Make',
    category: 'education',
    icon: '⚠️',
    hookPattern: '{N} mistakes I\'d never make as a {buyer|seller} in {market} — and #{X} will save you ${amount}',
    altHooks: [
      '3 things buyers always get wrong in Plymouth-Canton',
      'The $30K mistake I see every seller make in this market',
    ],
    whyItWorks: 'Open loop ("#2 will save you $20K") creates a curiosity gap that forces viewers to watch to the end. Specificity ($20K, not "money") makes it credible.',
    realExample: 'Luxury Presence hook catalog confirms list-with-tease formats drive saves. Lists are inherently saveable content.',
    format: 'Talking head, 30-45s, deliver #2 last',
    structure: ['Sec 0-3: "3 mistakes — #2 will save you $30K"', 'Sec 3-12: Mistake #1', 'Sec 12-25: Mistake #3 (out of order to keep #2 last)', 'Sec 25-40: Mistake #2 (the big one)', 'Sec 40-45: CTA — "save this before your next showing"'],
    bestFor: 'Top-of-funnel education that builds warm audience',
    expectedOutcome: 'Highest save rate of any format — saves are the strongest IG signal in 2025',
    source: 'Luxury Presence + Mosseri 2025 algorithm update',
  },
  {
    id: 'breaking_news',
    name: 'Breaking News Style',
    category: 'social_proof',
    icon: '📰',
    hookPattern: 'Breaking: A {N}-bedroom in {neighborhood} just sold ${amount} over asking in {N} days.',
    altHooks: [
      'Breaking: ${price} listing in Northville closed in 4 days, multiple offers',
      'Just in: Plymouth\'s newest listing hit the market this morning',
    ],
    whyItWorks: 'Mimics TV news cadence — tension before context. The "breaking" framing primes attention. Pairs naturally with lower-third graphics that feel authoritative.',
    realExample: 'BAM documented a specific Reel that went viral using breaking-news framing pattern; the agent\'s engagement spiked 8x typical.',
    format: 'Talking head + "Breaking News" lower-third in CapCut, 25-40s',
    structure: ['Sec 0-3: "Breaking:" + the news', 'Sec 3-20: Context (specs, sale story)', 'Sec 20-35: What it means for sellers/buyers in the corridor', 'Sec 35-40: CTA'],
    bestFor: 'Every just-sold + every just-listed at a notable price point',
    expectedOutcome: 'Establishes market authority; ideal for seller-lead attraction',
    source: 'BAM breaking-news case study',
  },
  {
    id: 'staging',
    name: 'Before / After Staging Reveal',
    category: 'social_proof',
    icon: '🎨',
    hookPattern: 'We had {N} days to make this {city} listing sell. Here\'s what we changed.',
    altHooks: [
      '{N} cheap fixes that added ${amount} to this sale',
      'This staging cost ${low} and added ${high} to the offer',
    ],
    whyItWorks: 'Transformation content is one of the most-SAVED categories on IG (Coffee & Contracts 2025). Pairs with the "Glow-up" trending audio cycle. Visual payoff is instant.',
    realExample: 'Coffee & Contracts cites staging transformations among top-performing 2025 formats',
    format: 'Split-screen or back-and-forth cuts, 20-30s, trending audio (no voice needed)',
    structure: ['Sec 0-3: Before shot with text overlay', 'Sec 3-15: Quick cuts between before/after', 'Sec 15-25: Final reveal', 'Sec 25-30: Result ("sold $38K over list in 4 days")'],
    bestFor: 'Active listings, builds seller-lead trust',
    expectedOutcome: 'Very high save rate from owners considering listing',
    source: 'Coffee & Contracts 2025 Reels guide',
  },
  {
    id: 'closing_day',
    name: 'Closing Day Joy',
    category: 'social_proof',
    icon: '🎉',
    hookPattern: '[No words at first — film clients getting keys, hugging, walking through empty rooms] + text overlay: "She thought she\'d be renting forever."',
    altHooks: [
      '"They told her she\'d never qualify."',
      '"Her first home — at 28."',
    ],
    whyItWorks: 'Pure emotion + social proof. Coffee & Contracts: "Shows them what\'s possible — invites them to be part of it." Triggers DM sends — the strongest 2025 IG distribution signal per Mosseri.',
    realExample: 'Coffee & Contracts viral listing guide; multiple agents document closing-day Reels as their highest-DM-generating posts',
    format: 'B-roll heavy, 25-40s, emotional/cinematic audio, single sentence text overlays',
    structure: ['Sec 0-5: Anticipation (key in hand, door opening)', 'Sec 5-20: Emotional moments (hug, walk-through, smile)', 'Sec 20-35: Quick story text overlays', 'Sec 35-40: "Ready for yours?" CTA'],
    bestFor: 'After every close (with client permission)',
    expectedOutcome: 'Highest DM-to-DM conversion of any format — DMs are the #1 2025 IG distribution signal',
    source: 'Mosseri December 2025 IG algorithm update',
  },
  {
    id: 'day_in_life',
    name: 'Day in the Life',
    category: 'day_in_life',
    icon: '☀️',
    hookPattern: 'POV: A day in the life of a real estate agent in {market}',
    altHooks: [
      'My Monday as a Metro Detroit Realtor: 3 showings, 1 closing, 14 hours',
      'A Tuesday in the I-275 corridor',
    ],
    whyItWorks: 'Behind-the-scenes is one of the highest-completion categories. Builds parasocial trust at scale. Viewers feel like they "know" you after 3-5 of these.',
    realExample: 'Social Marketing Nut + multiple agent case studies confirm day-in-life as a reliable repeatable franchise',
    format: '30-60s, time-stamped cuts ("7:45 AM," "11:30 AM"), upbeat audio',
    structure: ['Sec 0-3: Time stamp + activity ("7:45 AM — coffee + listings")', 'Sec 3-50: 8-12 timestamped clips throughout the day', 'Sec 50-60: End-of-day reflection + CTA'],
    bestFor: 'Building brand familiarity, attracting referrals',
    expectedOutcome: 'Compounds — by post #10 of this format, you have a loyal local audience',
    source: 'Social Marketing Nut',
  },
  {
    id: 'question_hook',
    name: 'Question Hook on Tour',
    category: 'listing',
    icon: '❓',
    hookPattern: 'Would you live here for ${price}? (with bold question overlay at sec 0)',
    altHooks: [
      'Is this {city} home overpriced at ${price}?',
      'Worth ${price}? You decide.',
    ],
    whyItWorks: 'BAM teaches this exactly: "Overlaying a question from the POV of a buyer at the start of home tour reels — and answering it towards the end — with a related question in the caption to invite responses." Drives COMMENTS, which extend watch sessions, which boost reach.',
    realExample: 'BAM 6 Viral Hooks playbook documents this as one of their top-performing patterns in 2024-2025',
    format: '15-25s, in-app captions, comment-bait caption',
    structure: ['Sec 0-3: Bold question overlay', 'Sec 3-15: Quick tour with key features', 'Sec 15-20: Reveal your answer', 'Sec 20-25: Caption asks them — drives comments'],
    bestFor: 'Every listing tour — works regardless of price point',
    expectedOutcome: 'Highest comment rate of any tour format',
    source: 'BAM',
  },
  {
    id: 'myth_buster',
    name: 'The Truth About / Myth-Buster',
    category: 'education',
    icon: '🔍',
    hookPattern: 'The truth about {topic} nobody tells you',
    altHooks: [
      'What Realtors won\'t tell you about buying new construction in Canton',
      'The Plymouth-Canton vs. Novi truth your other agent skipped',
    ],
    whyItWorks: 'Insider-knowledge framing. "Nobody tells you" + your name attached = high save rate. Positions you as the agent who tells the truth.',
    realExample: 'Common viral pattern documented across multiple real estate creators in 2024-2025',
    format: 'Talking head, 30-45s',
    structure: ['Sec 0-3: "The truth about X nobody tells you"', 'Sec 3-15: The conventional wisdom', 'Sec 15-35: The hidden truth + your evidence', 'Sec 35-45: "Save this if you\'re thinking about {action}"'],
    bestFor: 'Educational content that builds long-term trust',
    expectedOutcome: 'Strong save rate + DM-to-consult conversion over 30-60 days',
    source: 'DMR Media + Marketeze',
  },
  {
    id: 'trend_jack',
    name: 'Trend-Jack with Trending Audio',
    category: 'trend',
    icon: '🎵',
    hookPattern: '[Layer current trending audio over listing/lifestyle B-roll; clever caption ties audio to visual]',
    altHooks: [
      'No voice — let the audio + caption do everything',
    ],
    whyItWorks: 'Inherits the trending audio\'s velocity. Best ROI per minute filmed. Use sounds within 3-5 days of seeing them peak ("use this sound" counter under 50K = sweet spot).',
    realExample: 'Daniel Heider built a 3.7M+ follower TikTok audience using this exact pattern. When "Hard Knock Life" trended, he layered it on a listing video with a caption tying audio to visual → millions of views.',
    format: '10-20s, no voice needed, full visual + audio + caption',
    structure: ['Pure visual storytelling matched to audio beats', 'Caption does the heavy lifting'],
    bestFor: 'Easy weekly habit — film once, tie to whatever\'s trending Friday',
    expectedOutcome: 'Fastest reach-multiplier per minute filmed',
    source: 'Luxury Presence TikTok guide',
  },
  {
    id: 'stitch_response',
    name: 'Stitch / Duet Response',
    category: 'trend',
    icon: '🎬',
    hookPattern: '[Stitch a viral home-buying complaint or finance influencer\'s housing take] → your local angle / correction',
    whyItWorks: 'Inherits the original video\'s velocity; you ride a wave you didn\'t start. Stitches surface in the FYP of the original creator\'s audience.',
    realExample: 'Common high-leverage tactic on TikTok; multiple agents document major reach spikes from well-timed stitches',
    format: '15-30s, original clip + your local correction or addition',
    structure: ['Sec 0-3: Original viral clip plays', 'Sec 3-25: Your reaction + local-angle correction', 'Sec 25-30: CTA'],
    bestFor: 'When something housing-related is trending — react fast (within 24 hrs)',
    expectedOutcome: 'Potential for 10x typical reach if the original was viral',
    source: 'Industry consensus 2024-2025',
  },
  {
    id: 'aggressive_tour',
    name: 'Aggressive / Personality-Forward Tour',
    category: 'listing',
    icon: '🔥',
    hookPattern: '[Walk in fast, react in real time, no script — "Are you KIDDING me with this {feature}?"]',
    whyItWorks: 'Personality + pattern interrupt beats production value. Brad Scott ("the Unprofessional Realtor") built a viral following on San Antonio tours with rapid-fire unfiltered reactions.',
    realExample: 'Brad Scott / Unprofessional Realtor case studied by BAM — millions of cumulative views from raw, reaction-based tours',
    format: 'Handheld vertical, 25-45s, one continuous tour, jump cuts only',
    structure: ['Sec 0-3: Walk in mid-reaction', 'Sec 3-35: Tour at speed with running commentary', 'Sec 35-45: Final price reveal + reaction'],
    bestFor: 'When a listing has wow features and you want to show personality, not polish',
    expectedOutcome: 'Polarizing — strong personality content gets either huge views or modest views; rarely middle',
    source: 'BAM Unprofessional Realtor profile',
  },
];

// ── COMPONENT ────────────────────────────────────────────────────────────────
const ViralStudio = ({ setPage, toast }) => {
  const [category, setCategory] = useState('all');
  const [openTemplate, setOpenTemplate] = useState(null); // template id when modal open
  const [genInput, setGenInput] = useState({ topic: '', listing: '', city: '', price: '' });
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState(null);
  const [profile] = useLS('re_profile', { name: 'Monica Iskra' });
  const [agentVoice] = useLS('agent_voice', '');

  const filtered = category === 'all'
    ? VIRAL_TEMPLATES
    : VIRAL_TEMPLATES.filter(t => t.category === category);

  const template = openTemplate ? VIRAL_TEMPLATES.find(t => t.id === openTemplate) : null;

  const copy = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const generate = async () => {
    if (!template) return;
    setGenerating(true);
    setDraft(null);
    try {
      const sys = `You are a viral real-estate content scriptwriter for Instagram Reels / TikTok / YouTube Shorts. The agent is ${profile.name || 'Monica Iskra'} in the I-275 corridor (Livonia, Plymouth, Novi, Northville, Farmington, Farmington Hills, Canton). ${agentVoice ? `Brand voice: ${agentVoice}` : 'Warm, confident, real, never salesy. Local landmarks > generic phrases.'} You PERSONALIZE proven viral templates rather than inventing from scratch.

Output rules:
- Hook (sec 0-3): The most aggressive scroll-stop you can write within the proven pattern. Use specifics — neighborhoods, dollar amounts, days, percentages.
- Body / script (sec 3-25): What she SAYS or films. Tight. Concrete.
- CTA (sec 25-30): One clear ask — "save this," "DM me '${"{city}"}'," "comment your zip", etc.
- Caption: 80-125 chars, hashtag-free at the end (we'll add hashtags separately).
- Hashtags: 3-5 niche + 1 broad. Real ones, not made-up.
- Filming notes: literally what to point the camera at, second by second.
- Trending audio suggestion: if applicable.

Return STRICT JSON only:
{
  "hook": "...",
  "script": "...",
  "cta": "...",
  "caption": "...",
  "hashtags": ["#realestate", "..."],
  "filmingNotes": "step-by-step shot list",
  "trendingAudio": "suggestion or 'No specific audio — use voice over'"
}`;

      const prompt = `Personalize this VIRAL TEMPLATE for the user's specific topic.

TEMPLATE: ${template.name}
HOOK PATTERN: ${template.hookPattern}
WHY IT WORKS: ${template.whyItWorks}
FORMAT: ${template.format}
EXPECTED STRUCTURE:
${template.structure.map((s, i) => `  ${i+1}. ${s}`).join('\n')}

USER'S INPUTS:
${genInput.topic ? `Topic / message: ${genInput.topic}` : ''}
${genInput.listing ? `Listing details: ${genInput.listing}` : ''}
${genInput.city ? `City / neighborhood: ${genInput.city}` : ''}
${genInput.price ? `Price: $${genInput.price}` : ''}

Personalize the hook pattern with the user's specifics. Don't invent a new structure — evolve this one.`;

      const r = await fetch('/api/claude/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system: sys,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      const text = (d.content?.[0]?.text || '').trim();
      const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(jsonText);
      setDraft(parsed);
      toast.success('Script generated — review below');
    } catch (e) {
      console.error(e);
      toast.error(`AI generation failed: ${e.message}`);
    }
    setGenerating(false);
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <TrendingUp size={22} color="#ec4899" />
          <h1 style={{ margin: 0, fontFamily: "'DM Serif Display',serif", fontSize: 28, fontWeight: 900, color: '#fff' }}>Viral Studio</h1>
          <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 8, background: 'rgba(236,72,153,.15)', color: '#ec4899' }}>15 PROVEN TEMPLATES</span>
        </div>
        <div style={{ fontSize: 14, color: '#94a3b8', maxWidth: 760 }}>
          Documented viral hooks for Instagram Reels, TikTok, and YouTube Shorts. Each template has a real-world example with view counts, the format spec, and the second-by-second structure. Click any one to personalize for your listing/topic.
        </div>
      </div>

      {/* Why-it-works summary card */}
      <div className="glass-card" style={{ marginBottom: 18, background: 'linear-gradient(135deg, rgba(236,72,153,.06), rgba(167,139,250,.04))', borderColor: 'rgba(236,72,153,.2)' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#ec4899', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>What the algorithm rewards in 2025</div>
            <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
              <strong>Watch time</strong> (Mosseri Jan 2025) → <strong>DM sends per reach</strong> (Mosseri Dec 2025) → saves & shares are "heavy" interactions; likes are "light"
            </div>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Sweet-spot length</div>
            <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
              <strong>Reels:</strong> 7-30s · <strong>TikTok:</strong> 21-34s · <strong>Shorts:</strong> 25-35s · Hook in first 3 sec, no exceptions
            </div>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Post cadence</div>
            <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
              <strong>3-5 Reels/week</strong> is the growth threshold · Best times: Thu 9am, Wed 12pm, Wed 6pm
            </div>
          </div>
        </div>
      </div>

      {/* Category filter chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {VIRAL_CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            style={{
              padding: '8px 14px', borderRadius: 99, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              border: `1px solid ${category === c.id ? '#ec4899' : 'rgba(255,255,255,.1)'}`,
              background: category === c.id ? 'rgba(236,72,153,.12)' : 'rgba(255,255,255,.02)',
              color: category === c.id ? '#ec4899' : '#94a3b8',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <span>{c.icon}</span> {c.name}
          </button>
        ))}
      </div>

      {/* Template grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {filtered.map(t => (
          <button
            key={t.id}
            onClick={() => { setOpenTemplate(t.id); setDraft(null); setGenInput({ topic: '', listing: '', city: '', price: '' }); }}
            className="glass-card"
            style={{ padding: 16, cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid rgba(255,255,255,.06)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 28 }}>{t.icon}</div>
              <ChevronRight size={16} color="#475569" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>{t.name}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5, flex: 1 }}>
              {t.whyItWorks.length > 110 ? t.whyItWorks.slice(0, 110) + '…' : t.whyItWorks}
            </div>
            <div style={{ fontSize: 11, color: '#ec4899', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,.04)' }}>
              <Eye size={11} /> {t.realExample.length > 80 ? t.realExample.slice(0, 80) + '…' : t.realExample}
            </div>
          </button>
        ))}
      </div>

      {/* Template detail / generate modal */}
      {template && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => { setOpenTemplate(null); setDraft(null); }}
        >
          <div
            style={{ background: '#0d1117', borderRadius: 16, padding: '24px 28px', maxWidth: 760, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid rgba(255,255,255,.1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 32 }}>{template.icon}</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#ec4899', textTransform: 'uppercase', letterSpacing: '.5px' }}>Viral Template</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', fontFamily: "'DM Serif Display',serif" }}>{template.name}</div>
                </div>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setOpenTemplate(null); setDraft(null); }}><X size={14} /></button>
            </div>

            {/* Template details */}
            <div style={{ padding: '12px 14px', background: 'rgba(236,72,153,.06)', borderRadius: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#ec4899', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Why it works</div>
              <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>{template.whyItWorks}</div>
            </div>

            <div style={{ padding: '12px 14px', background: 'rgba(126,184,247,.06)', borderRadius: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#7eb8f7', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Real-world example</div>
              <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>{template.realExample}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Source: {template.source}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,.03)', borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>Format</div>
                <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>{template.format}</div>
              </div>
              <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,.03)', borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>Expected outcome</div>
                <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>{template.expectedOutcome}</div>
              </div>
            </div>

            <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,.03)', borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Second-by-second structure</div>
              <ol style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.7, paddingLeft: 22, margin: 0 }}>
                {template.structure.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>

            <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,.03)', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Hook pattern</div>
              <div style={{ fontSize: 13, color: '#fff', fontFamily: 'monospace', padding: '6px 0' }}>{template.hookPattern}</div>
              {template.altHooks && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                  Alt patterns:
                  <ul style={{ paddingLeft: 16, margin: '4px 0 0' }}>
                    {template.altHooks.map((h, i) => <li key={i} style={{ marginBottom: 2 }}>{h}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {/* Generate form */}
            <div style={{ paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.08)' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 10 }}>✨ Generate YOUR version with AI</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input className="input" placeholder="City / neighborhood (e.g. Northville)" value={genInput.city} onChange={(e) => setGenInput((p) => ({ ...p, city: e.target.value }))} />
                <input className="input" placeholder="Price (e.g. 549000)" value={genInput.price} onChange={(e) => setGenInput((p) => ({ ...p, price: e.target.value }))} />
              </div>
              <input className="input" placeholder="Listing details (e.g. 4 bed 3 bath colonial, updated kitchen)" value={genInput.listing} onChange={(e) => setGenInput((p) => ({ ...p, listing: e.target.value }))} style={{ marginBottom: 8 }} />
              <textarea className="textarea" style={{ minHeight: 60, marginBottom: 10 }} placeholder="Topic / message / what you want to talk about (optional but helps)" value={genInput.topic} onChange={(e) => setGenInput((p) => ({ ...p, topic: e.target.value }))} />
              <button className="btn btn-blue" onClick={generate} disabled={generating} style={{ width: '100%', padding: '12px 14px' }}>
                {generating ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</> : <><Sparkles size={13} /> Personalize for me</>}
              </button>
            </div>

            {/* Generated script */}
            {draft && (
              <div style={{ marginTop: 16, padding: '14px 16px', background: 'rgba(16,185,129,.06)', borderRadius: 10, border: '1px solid rgba(16,185,129,.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#10b981' }}>📋 Your personalized script</div>
                  <button className="btn btn-ghost btn-xs" onClick={() => copy(`HOOK: ${draft.hook}\n\nSCRIPT: ${draft.script}\n\nCTA: ${draft.cta}\n\nCAPTION: ${draft.caption}\n\nHASHTAGS: ${(draft.hashtags || []).join(' ')}\n\nFILMING: ${draft.filmingNotes}\n\nAUDIO: ${draft.trendingAudio}`, 'Full script')}><Copy size={11} /> Copy all</button>
                </div>

                <Block label="Hook (sec 0-3)" value={draft.hook} onCopy={(v) => copy(v, 'Hook')} />
                <Block label="Script (sec 3-25)" value={draft.script} onCopy={(v) => copy(v, 'Script')} />
                <Block label="CTA" value={draft.cta} onCopy={(v) => copy(v, 'CTA')} />
                <Block label="Caption (for post)" value={draft.caption} onCopy={(v) => copy(v, 'Caption')} />
                {draft.hashtags?.length > 0 && (
                  <Block label="Hashtags" value={draft.hashtags.join(' ')} onCopy={(v) => copy(v, 'Hashtags')} />
                )}
                <Block label="Filming notes" value={draft.filmingNotes} onCopy={(v) => copy(v, 'Filming notes')} />
                {draft.trendingAudio && (
                  <Block label="Trending audio" value={draft.trendingAudio} />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const Block = ({ label, value, onCopy }) => (
  <div style={{ marginBottom: 8 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</span>
      {onCopy && <button className="btn btn-ghost btn-xs" onClick={() => onCopy(value)}><Copy size={10} /></button>}
    </div>
    <div style={{ fontSize: 13, color: '#fff', padding: '8px 10px', background: 'rgba(255,255,255,.03)', borderRadius: 6, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{value}</div>
  </div>
);

export default ViralStudio;
