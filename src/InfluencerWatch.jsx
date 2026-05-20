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
  const [tab, setTab] = useState('feed'); // feed | directory | youtube | inspiration | library
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
