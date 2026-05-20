// GoogleBusiness.jsx — Read GBP reviews + insights, reply to reviews,
// draft posts (manual-post helper since Google killed the Posts API in 2023).
//
// OAuth scope: https://www.googleapis.com/auth/business.manage
// Storage: localStorage key `gbp_token` + `gbp_token_expiry`.
//
// Required Google Cloud setup (one-time, in the same GCP project as Gmail):
//   1. Enable APIs: "My Business Account Management API",
//      "My Business Business Information API", "Business Profile
//      Performance API", "My Business" (legacy v4 for reviews).
//   2. Request quota access for Business Profile API (Google form).
//   3. Add Monica's email as a test user on the OAuth consent screen
//      (until the app is verified; "business.manage" is a restricted scope).

import { useState, useEffect, useCallback } from 'react';
import { useLS } from './cloudHooks';
import {
  Globe, Star, Phone, Eye, MapPin, MessageSquare, RefreshCw, Copy, ExternalLink,
  CheckCircle, AlertCircle, Search,
} from 'lucide-react';

const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage';

// Reuse the GIS script loader pattern from App.js (Gmail flow loads it too,
// safe to call multiple times since we no-op when already present).
function loadGIS() {
  return new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve;
    s.onerror = resolve;
    document.head.appendChild(s);
  });
}

async function requestGbpToken(clientId) {
  await loadGIS();
  return new Promise((resolve, reject) => {
    try {
      const tc = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GBP_SCOPE,
        callback: (r) => r.error ? reject(new Error(r.error)) : resolve(r),
      });
      tc.requestAccessToken({ prompt: 'consent' });
    } catch (e) { reject(e); }
  });
}

// Get a saved + non-expired token, or null
function getStoredToken() {
  const tok = localStorage.getItem('gbp_token');
  const exp = parseInt(localStorage.getItem('gbp_token_expiry') || '0');
  if (!tok || Date.now() > exp) return null;
  return tok;
}

async function gbpFetch(path, opts = {}) {
  const token = getStoredToken();
  if (!token) throw new Error('Google Business not connected — see Settings');
  const r = await fetch(`/api/google-business${path}`, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    const msg = err.error?.message || err.error?.status || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return r.json();
}

const GoogleBusiness = ({ setPage, toast }) => {
  const [clientId, setClientId] = useLS('gmail_client_id', ''); // Reuse the GCP client ID from Gmail
  const [connected, setConnected] = useState(() => !!getStoredToken());
  const [accounts, setAccounts] = useState([]);
  const [account, setAccount] = useState(null); // { name, accountName, ... }
  const [locations, setLocations] = useState([]);
  const [location, setLocation] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [insights, setInsights] = useState(null);
  const [loadingPhase, setLoadingPhase] = useState(null); // accounts | locations | reviews | insights
  const [error, setError] = useState('');
  const [replyText, setReplyText] = useState({}); // reviewName -> draft text
  const [postDraft, setPostDraft] = useState('');

  const connect = async () => {
    const id = (clientId || '').trim();
    if (!id) return toast.error('Set your Google Cloud Client ID in Settings → Integrations → Gmail first (same Client ID).');
    try {
      const r = await requestGbpToken(id);
      localStorage.setItem('gbp_token', r.access_token);
      localStorage.setItem('gbp_token_expiry', String(Date.now() + (r.expires_in || 3600) * 1000));
      setConnected(true);
      toast.success('Google Business connected.');
    } catch (e) {
      toast.error(`Connection failed: ${e.message}. Make sure Business Profile API is enabled in Google Cloud + your email is added as a test user on the OAuth consent screen.`);
    }
  };

  const disconnect = () => {
    localStorage.removeItem('gbp_token');
    localStorage.removeItem('gbp_token_expiry');
    setConnected(false);
    setAccounts([]); setAccount(null);
    setLocations([]); setLocation(null);
    setReviews([]); setInsights(null);
    toast.success('Disconnected.');
  };

  // Load accounts after connect
  useEffect(() => {
    if (!connected) return;
    (async () => {
      setLoadingPhase('accounts'); setError('');
      try {
        const data = await gbpFetch('/accounts');
        const list = data.accounts || [];
        setAccounts(list);
        if (list.length) setAccount(list[0]);
      } catch (e) { setError(e.message); }
      setLoadingPhase(null);
    })();
  }, [connected]);

  // Load locations when account picked
  useEffect(() => {
    if (!account) return;
    (async () => {
      setLoadingPhase('locations'); setError('');
      try {
        const data = await gbpFetch(`/locations?account=${encodeURIComponent(account.name)}`);
        const list = data.locations || [];
        setLocations(list);
        if (list.length) setLocation(list[0]);
      } catch (e) { setError(e.message); }
      setLoadingPhase(null);
    })();
  }, [account]);

  // Load reviews + insights when location picked
  const loadReviewsAndInsights = useCallback(async () => {
    if (!account || !location) return;
    const acctParam = encodeURIComponent(account.name);
    const locShort = location.name.split('/').pop();
    const locParam = encodeURIComponent('locations/' + locShort);

    setLoadingPhase('reviews'); setError('');
    try {
      const data = await gbpFetch(`/reviews?account=${acctParam}&location=${locParam}`);
      setReviews(data.reviews || []);
    } catch (e) { setError(e.message); }

    setLoadingPhase('insights');
    try {
      const data = await gbpFetch(`/insights?location=${locParam}`);
      setInsights(data);
    } catch (e) { /* insights are optional; some accounts lack permission */ }

    setLoadingPhase(null);
  }, [account, location]);

  useEffect(() => { loadReviewsAndInsights(); }, [loadReviewsAndInsights]);

  const replyToReview = async (review) => {
    const text = (replyText[review.name] || '').trim();
    if (!text) return toast.error('Type a reply first');
    const acctParam = encodeURIComponent(account.name);
    const locShort = location.name.split('/').pop();
    const locParam = encodeURIComponent('locations/' + locShort);
    const reviewShort = review.name.split('/').pop();
    const reviewParam = encodeURIComponent('reviews/' + reviewShort);
    try {
      await gbpFetch(`/reviews/reply?account=${acctParam}&location=${locParam}&review=${reviewParam}`, {
        method: 'PUT',
        body: JSON.stringify({ comment: text }),
      });
      toast.success('Reply posted.');
      setReplyText(p => ({ ...p, [review.name]: '' }));
      loadReviewsAndInsights();
    } catch (e) {
      toast.error(`Reply failed: ${e.message}`);
    }
  };

  // Aggregate insight numbers from the daily metrics response
  const insightTotals = (() => {
    if (!insights?.multiDailyMetricTimeSeries) return null;
    const totals = {};
    insights.multiDailyMetricTimeSeries.forEach(metricSeries => {
      metricSeries.dailyMetricTimeSeries?.forEach(daily => {
        const metric = daily.dailyMetric;
        const sum = (daily.timeSeries?.datedValues || []).reduce(
          (s, dv) => s + (parseInt(dv.value) || 0), 0
        );
        totals[metric] = (totals[metric] || 0) + sum;
      });
    });
    return totals;
  })();

  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + ({ ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[r.starRating] || 0), 0) / reviews.length).toFixed(1)
    : null;

  const openGbpPostingPage = () => {
    const url = location?.name
      ? `https://business.google.com/n/${location.name.split('/').pop()}/posts`
      : 'https://business.google.com/posts';
    window.open(url, '_blank');
  };

  const copyDraftAndOpen = () => {
    if (!postDraft.trim()) return toast.error('Write the post body first');
    navigator.clipboard.writeText(postDraft);
    toast.success('Copied — opening Google Business Posts');
    openGbpPostingPage();
  };

  // ── Not-connected state ──
  if (!connected) {
    return (
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Globe size={22} color="#4285f4" />
          <h1 style={{ margin: 0, fontFamily: "'DM Serif Display',serif", fontSize: 28, fontWeight: 900, color: '#fff' }}>Google Business Profile</h1>
        </div>
        <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 22 }}>
          Read your reviews + insights from inside the hub. Reply to reviews. Draft posts (Google killed API posting in 2023 — posts are manual via a one-click handoff).
        </div>

        <div className="glass-card" style={{ maxWidth: 720 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 14 }}>Connect Google Business</div>

          <div style={{ marginBottom: 14 }}>
            <div className="label" style={{ marginBottom: 6 }}>Google Cloud OAuth Client ID</div>
            <input
              className="input"
              placeholder="e.g. 123456789-abcdefg.apps.googleusercontent.com"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              Same Client ID as Gmail (stored in localStorage). If empty, set it once at Settings → Integrations → Gmail.
            </div>
          </div>

          <button className="btn btn-blue" disabled={!clientId.trim()} onClick={connect} style={{ padding: '12px 18px' }}>
            <Globe size={13} /> Connect with Google
          </button>

          <div style={{ marginTop: 22, padding: 14, background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#fbbf24', marginBottom: 8 }}>One-time Google Cloud setup</div>
            <ol style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.7, paddingLeft: 22, margin: 0 }}>
              <li>In the Google Cloud Console project you use for Gmail, enable these APIs:
                <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                  <li>My Business Account Management API</li>
                  <li>My Business Business Information API</li>
                  <li>My Business (legacy v4 — for reviews)</li>
                  <li>Business Profile Performance API</li>
                </ul>
              </li>
              <li>The <code>business.manage</code> scope is restricted, so you need to request quota access via Google's form (linked from the API page in Cloud Console).</li>
              <li>On the OAuth consent screen, add your Google account email as a Test User (so unverified-app testing works).</li>
              <li>Then click <strong>Connect with Google</strong> above — it'll reuse the same Client ID you already set up for Gmail.</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  // ── Connected state ──
  return (
    <div className="page-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Globe size={22} color="#4285f4" />
            <h1 style={{ margin: 0, fontFamily: "'DM Serif Display',serif", fontSize: 28, fontWeight: 900, color: '#fff' }}>Google Business Profile</h1>
            <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 8, background: 'rgba(16,185,129,.15)', color: '#10b981' }}>CONNECTED</span>
          </div>
          {location && (
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              {location.title || '(unnamed location)'}
              {location.storefrontAddress?.locality && ` · ${location.storefrontAddress.locality}, ${location.storefrontAddress.administrativeArea}`}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={loadReviewsAndInsights} disabled={loadingPhase}>
            <RefreshCw size={11} style={loadingPhase ? { animation: 'spin 1s linear infinite' } : {}} /> Refresh
          </button>
          <button className="btn btn-ghost btn-sm" onClick={disconnect}>Disconnect</button>
        </div>
      </div>

      {error && (
        <div className="glass-card" style={{ marginBottom: 14, padding: '12px 14px', background: 'rgba(239,68,68,.08)', borderColor: 'rgba(239,68,68,.25)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#f87171', marginBottom: 4 }}>Error</div>
          <div style={{ fontSize: 12, color: '#cbd5e1', fontFamily: 'monospace' }}>{error}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            Common causes: Business Profile API not enabled, quota not granted yet, or your account doesn't manage any locations.
          </div>
        </div>
      )}

      {/* Account / location switcher */}
      {accounts.length > 1 && (
        <div style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select className="select" value={account?.name || ''} onChange={e => setAccount(accounts.find(a => a.name === e.target.value))}>
            {accounts.map(a => <option key={a.name} value={a.name}>{a.accountName || a.name}</option>)}
          </select>
        </div>
      )}
      {locations.length > 1 && (
        <div style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select className="select" value={location?.name || ''} onChange={e => setLocation(locations.find(l => l.name === e.target.value))}>
            {locations.map(l => <option key={l.name} value={l.name}>{l.title || l.name}</option>)}
          </select>
        </div>
      )}

      {/* Insights row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
        <InsightCard icon={<Star size={14} color="#fbbf24" />} label="Avg Rating" value={avgRating || '—'} sub={reviews.length ? `${reviews.length} reviews` : '—'} />
        <InsightCard icon={<Phone size={14} color="#10b981" />} label="Calls" value={insightTotals?.CALL_CLICKS ?? '—'} sub="last 30 days" />
        <InsightCard icon={<Search size={14} color="#7eb8f7" />} label="Search Views" value={(insightTotals?.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH || 0) + (insightTotals?.BUSINESS_IMPRESSIONS_MOBILE_SEARCH || 0) || '—'} sub="last 30 days" />
        <InsightCard icon={<MapPin size={14} color="#a78bfa" />} label="Maps Views" value={(insightTotals?.BUSINESS_IMPRESSIONS_DESKTOP_MAPS || 0) + (insightTotals?.BUSINESS_IMPRESSIONS_MOBILE_MAPS || 0) || '—'} sub="last 30 days" />
        <InsightCard icon={<Eye size={14} color="#f59e0b" />} label="Directions" value={insightTotals?.BUSINESS_DIRECTION_REQUESTS ?? '—'} sub="last 30 days" />
        <InsightCard icon={<Globe size={14} color="#10b981" />} label="Website Clicks" value={insightTotals?.WEBSITE_CLICKS ?? '—'} sub="last 30 days" />
      </div>

      {/* Two-column: Reviews + Draft Post */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        {/* Reviews */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Recent Reviews</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{reviews.length} loaded</div>
          </div>
          {loadingPhase === 'reviews' && (
            <div className="glass-card" style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
              <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 6 }} /> Loading reviews…
            </div>
          )}
          {!loadingPhase && reviews.length === 0 && (
            <div className="glass-card" style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              No reviews loaded. Either you have none yet, or the API didn't return any.
            </div>
          )}
          {reviews.map(r => {
            const stars = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[r.starRating] || 0;
            return (
              <div key={r.name} className="glass-card" style={{ padding: 14, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{r.reviewer?.displayName || 'Anonymous'}</span>
                      <span style={{ fontSize: 12, color: '#fbbf24' }}>{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {r.createTime ? new Date(r.createTime).toLocaleDateString() : ''}
                    </div>
                  </div>
                  {r.reviewReply && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'rgba(16,185,129,.15)', color: '#10b981' }}>
                      <CheckCircle size={9} style={{ verticalAlign: 'middle', marginRight: 2 }} /> Replied
                    </span>
                  )}
                </div>
                {r.comment && (
                  <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5, marginBottom: 10, padding: '8px 10px', background: 'rgba(255,255,255,.02)', borderRadius: 8 }}>
                    {r.comment}
                  </div>
                )}
                {r.reviewReply ? (
                  <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 10px', background: 'rgba(16,185,129,.05)', borderRadius: 8, borderLeft: '2px solid #10b981' }}>
                    <strong style={{ color: '#10b981' }}>Your reply:</strong> {r.reviewReply.comment}
                  </div>
                ) : (
                  <div>
                    <textarea
                      className="textarea"
                      placeholder="Type your reply… keep it professional, name-specific, and avoid getting defensive on negative reviews."
                      value={replyText[r.name] || ''}
                      onChange={e => setReplyText(p => ({ ...p, [r.name]: e.target.value }))}
                      style={{ minHeight: 70, fontSize: 12 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                      <button className="btn btn-blue btn-sm" onClick={() => replyToReview(r)} disabled={!(replyText[r.name] || '').trim()}>
                        <MessageSquare size={11} /> Post Reply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Draft Post (manual handoff since API posting is gone) */}
        <div>
          <div className="glass-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <ExternalLink size={14} color="#fbbf24" />
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Draft a Post</div>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>
              Google removed API posting in 2023. Write your post here → click below to copy + open the GBP posting page → paste.
            </div>
            <textarea
              className="textarea"
              placeholder="Just listed in Northville: 4-bed colonial, $549k. DM for showing. Open Saturday 1-3."
              value={postDraft}
              onChange={e => setPostDraft(e.target.value)}
              style={{ minHeight: 140 }}
            />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, marginBottom: 10 }}>
              {postDraft.length} / 1500 chars (GBP recommended ≤1500)
            </div>
            <button className="btn btn-blue" onClick={copyDraftAndOpen} disabled={!postDraft.trim()} style={{ width: '100%' }}>
              <Copy size={12} /> Copy + Open Google Business Posts
            </button>
          </div>

          <div className="glass-card" style={{ marginTop: 12, background: 'rgba(245,158,11,.04)', borderColor: 'rgba(245,158,11,.2)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertCircle size={14} color="#fbbf24" style={{ marginTop: 2 }} />
              <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
                <strong style={{ color: '#fff' }}>Why no auto-posting?</strong> Google deprecated the Local Posts API in 2023. Posts must be created in the Business Profile dashboard or mobile app. The button above is the fastest manual path.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const InsightCard = ({ icon, label, value, sub }) => (
  <div className="glass-card" style={{ padding: 14, textAlign: 'center' }}>
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5, marginBottom: 4 }}>
      {icon}
      <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</span>
    </div>
    <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', fontFamily: "'DM Serif Display',serif" }}>
      {typeof value === 'number' ? value.toLocaleString() : value}
    </div>
    <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>
  </div>
);

export default GoogleBusiness;
