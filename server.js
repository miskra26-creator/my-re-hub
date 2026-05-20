/**
 * RE Hub — Lead Capture Server  (port 3001)
 * Receives webhooks from Homes.com, Zillow, Realtor.com, Facebook, Zapier, etc.
 * React app polls /api/inbox every 30s and imports new leads automatically.
 */
const express = require("express");
const cors    = require("cors");
const fs      = require("fs");
const path    = require("path");

const app   = express();
const PORT  = 3001;
const INBOX = path.join(__dirname, "leads-inbox.json");

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ── helpers ──────────────────────────────────────────────────────────────────
const readInbox  = () => { try { return JSON.parse(fs.readFileSync(INBOX,"utf8")); } catch { return []; } };
const writeInbox = d  => fs.writeFileSync(INBOX, JSON.stringify(d, null, 2));
const push       = lead => {
  const inbox = readInbox();
  inbox.unshift({ ...lead, receivedAt: new Date().toISOString(), id: `inb_${Date.now()}_${Math.random().toString(36).slice(2,6)}` });
  writeInbox(inbox);
  console.log(`[LEAD] ${lead.source} → ${lead.name} | ${lead.email || lead.phone}`);
};

const extractPhone = t => (t||"").match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0] || "";
const extractEmail = t => (t||"").match(/[\w.+%-]+@[\w-]+\.[a-z]{2,}/i)?.[0] || "";
const extractName  = t => {
  const m = (t||"").match(/(?:name|contact|from)[:\s]+([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)/i);
  return m?.[1] || "";
};

const detectSource = (subject="", from="") => {
  const s = (subject + " " + from).toLowerCase();
  if (s.includes("homes.com"))     return "Homes.com";
  if (s.includes("zillow"))        return "Zillow";
  if (s.includes("realtor.com"))   return "Realtor.com";
  if (s.includes("trulia"))        return "Trulia";
  if (s.includes("redfin"))        return "Redfin";
  if (s.includes("movoto"))        return "Movoto";
  if (s.includes("facebook") || s.includes("meta")) return "Facebook";
  if (s.includes("instagram"))     return "Instagram";
  if (s.includes("opcity"))        return "OpCity";
  if (s.includes("boldleads"))     return "BoldLeads";
  if (s.includes("ylopo"))         return "Ylopo";
  return "Web";
};

// ── GENERIC WEBHOOK (Zapier, Make, custom) ───────────────────────────────────
// POST /webhook/lead?source=Homes.com
// Body: { name, email, phone, message, address, city, budget, ... }
app.post("/webhook/lead", (req, res) => {
  const b = req.body;
  const source = req.query.source || b.source || b.platform || "Webhook";
  push({
    name:    (b.name || b.contact_name || b.full_name || `${b.first_name||""} ${b.last_name||""}`.trim() || "New Lead").slice(0,80),
    email:   (b.email || b.contact_email || b.email_address || "").slice(0,100),
    phone:   (b.phone || b.phone_number || b.contact_phone || b.mobile || "").slice(0,30),
    notes:   (b.message || b.comments || b.note || b.body || "").slice(0,500),
    area:    (b.city || b.area || b.location || b.zip || "").slice(0,60),
    budget:  (b.price || b.budget || b.listing_price || "").toString().slice(0,20),
    address: (b.address || b.property_address || b.listing_address || "").slice(0,120),
    source,
    status: "Hot Prospect",
    type: "Buyer",
  });
  res.json({ ok: true });
});

// ── ZILLOW PREMIER AGENT WEBHOOK ─────────────────────────────────────────────
app.post("/webhook/zillow", (req, res) => {
  const b = req.body;
  const c = b.buyerAgent?.contact || b.contact || {};
  const prop = b.listingDetails || {};
  push({
    name:    (c.name || c.displayName || "Zillow Lead").slice(0,80),
    email:   (c.email || "").slice(0,100),
    phone:   (c.phone || "").slice(0,30),
    notes:   (b.buyerAgent?.message || b.message || "").slice(0,500),
    address: (prop.address || prop.streetAddress || "").slice(0,120),
    area:    (prop.city || "").slice(0,60),
    budget:  (prop.price || "").toString().slice(0,20),
    source:  "Zillow",
    status:  "Hot Prospect",
    type:    "Buyer",
  });
  res.json({ ok: true });
});

// ── FACEBOOK LEAD ADS WEBHOOK ─────────────────────────────────────────────────
app.post("/webhook/facebook-lead", (req, res) => {
  const entry = req.body?.entry?.[0];
  const change = entry?.changes?.[0]?.value;
  if (!change?.leadgen_id) { res.json({ ok: true }); return; }
  const fields = {};
  (change.field_data || []).forEach(f => { fields[f.name] = f.values?.[0] || ""; });
  push({
    name:   (fields.full_name || `${fields.first_name||""} ${fields.last_name||""}`.trim() || "Facebook Lead").slice(0,80),
    email:  (fields.email || "").slice(0,100),
    phone:  (fields.phone_number || fields.phone || "").slice(0,30),
    notes:  `FB Lead Form: ${change.form_id || ""}`,
    area:   (fields.city || fields.zip_code || "").slice(0,60),
    budget: (fields.price_range || "").slice(0,20),
    source: "Facebook Lead Ads",
    status: "Hot Prospect",
    type:   "Buyer",
  });
  res.json({ ok: true });
});

// Facebook webhook verification challenge
app.get("/webhook/facebook-lead", (req, res) => {
  const VERIFY_TOKEN = "re_hub_fb_verify";
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

// ── EMAIL WEBHOOK (Mailgun Inbound / Zapier Email Parser / SendGrid) ──────────
// POST /webhook/email
// Body: { from, subject, text, html, stripped-text }
app.post("/webhook/email", (req, res) => {
  const b      = req.body;
  const from   = b.from || b.sender || b.From || "";
  const subj   = b.subject || b.Subject || "";
  const body   = b["stripped-text"] || b.text || b.plain || b.body || b.html || b.Body || "";
  const source = detectSource(subj, from);

  // --- Homes.com email parser ---
  // "New Lead - John Smith is interested in 123 Main St"
  let name    = extractName(body) || extractName(subj);
  let email   = extractEmail(body);
  if (!email || email.includes("noreply") || email.includes("notification")) email = "";
  let phone   = extractPhone(body);
  let address = "";

  // Homes.com format: "Property: 123 Main St..."
  const addrM = body.match(/(?:property|address|listing)[:\s]+([^\n\r]{5,80})/i);
  if (addrM) address = addrM[1].trim();

  // Fallback name from email From header: "John Smith <john@email.com>"
  if (!name) {
    const fromName = from.match(/^([^<@"]+?)\s*(?:<|$)/);
    if (fromName && !fromName[1].toLowerCase().includes("noreply") && !fromName[1].toLowerCase().includes("notification")) {
      name = fromName[1].trim();
    }
  }

  push({
    name:    (name || "Email Lead").slice(0,80),
    email:   email.slice(0,100),
    phone:   phone.slice(0,30),
    notes:   `Subject: ${subj}\n\n${body.slice(0,400)}`.slice(0,500),
    address: address.slice(0,120),
    area:    "",
    budget:  "",
    source,
    status:  "Hot Prospect",
    type:    "Buyer",
  });
  res.json({ ok: true });
});

// ── REALTOR.COM WEBHOOK ───────────────────────────────────────────────────────
app.post("/webhook/realtor", (req, res) => {
  const b = req.body;
  const c = b.contact || b.lead || b;
  push({
    name:    (c.name || c.full_name || `${c.first_name||""} ${c.last_name||""}`.trim() || "Realtor.com Lead").slice(0,80),
    email:   (c.email || "").slice(0,100),
    phone:   (c.phone || c.phone_number || "").slice(0,30),
    notes:   (c.message || b.message || "").slice(0,500),
    address: (b.property?.address || b.listing_address || "").slice(0,120),
    area:    (b.property?.city || c.city || "").slice(0,60),
    budget:  (b.property?.list_price || "").toString().slice(0,20),
    source:  "Realtor.com",
    status:  "Hot Prospect",
    type:    "Buyer",
  });
  res.json({ ok: true });
});

// ── API: React polls this ─────────────────────────────────────────────────────
app.get("/api/inbox", (_req, res) => res.json(readInbox()));

// ── API: React removes imported leads ────────────────────────────────────────
app.post("/api/inbox/remove", (req, res) => {
  const ids = req.body?.ids || [];
  writeInbox(readInbox().filter(l => !ids.includes(l.id)));
  res.json({ ok: true });
});

// ── API: AI proxy — Anthropic with auto-Ollama fallback ─────────────────────
// Tries (in order):
//   1. Anthropic API if ANTHROPIC_API_KEY is set (best quality)
//   2. Local Ollama at OLLAMA_URL (default http://localhost:11434) if running
// Either way the response shape matches Anthropic so the React client code
// (callClaude in App.js, callClaudeLocal in VideoAuto.jsx, fetch in AIStudio.jsx)
// doesn't have to know which backend served it.
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
// Models we'll prefer when picking from whatever Ollama has installed.
const OLLAMA_PREFERRED = [
  "llama3.3", "qwen2.5:32b", "qwen2.5:14b", "llama3.1:8b",
  "qwen2.5:7b", "llama3.2", "mistral", "gemma2", "phi3",
];

async function callOllama(reqBody) {
  // Probe — is Ollama running and does it have any models?
  const tagsRes = await fetch(`${OLLAMA_URL}/api/tags`, {
    signal: AbortSignal.timeout(2000),
  }).catch(() => null);
  if (!tagsRes || !tagsRes.ok) throw new Error("Ollama not reachable at " + OLLAMA_URL);
  const { models } = await tagsRes.json();
  if (!models?.length) {
    throw new Error("Ollama is running but has no models — run: ollama pull llama3.2");
  }
  // Pick best available model from our preference list, else first installed.
  let modelToUse = null;
  for (const pref of OLLAMA_PREFERRED) {
    const match = models.find(m => m.name === pref || m.name.startsWith(pref + ":"));
    if (match) { modelToUse = match.name; break; }
  }
  if (!modelToUse) modelToUse = models[0].name;

  // Translate Anthropic's messages+system into Ollama's chat format.
  const { messages = [], system, max_tokens = 1500 } = reqBody;
  const ollamaMessages = [];
  if (system) ollamaMessages.push({ role: "system", content: system });
  for (const m of messages) {
    const text = typeof m.content === "string"
      ? m.content
      : (Array.isArray(m.content) ? m.content.map(c => c.text || "").join("\n") : "");
    ollamaMessages.push({ role: m.role, content: text });
  }

  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelToUse,
      messages: ollamaMessages,
      stream: false,
      options: { num_predict: max_tokens },
    }),
  });
  if (!r.ok) throw new Error(`Ollama returned ${r.status}`);
  const data = await r.json();

  // Shape-match Anthropic so client code keeps working unchanged.
  return {
    content: [{ type: "text", text: data.message?.content || "" }],
    model: modelToUse,
    stop_reason: "end_turn",
    _provider: "ollama",
  };
}

app.post("/api/claude/messages", async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  // 1. Try Anthropic if we have a key
  if (key) {
    try {
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(req.body),
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      console.warn("[ai-proxy] Anthropic failed, trying Ollama:", err.message);
    }
  }
  // 2. Fall back to Ollama (only reachable from local server.js, NOT from Vercel)
  try {
    const data = await callOllama(req.body);
    return res.json(data);
  } catch (err) {
    const msg = key
      ? `Anthropic + Ollama both failed. Ollama said: ${err.message}`
      : `No ANTHROPIC_API_KEY set and Ollama is not running. Install Ollama (ollama.com) and run: ollama pull llama3.2 — or add ANTHROPIC_API_KEY to .env.local`;
    return res.status(500).json({ error: { message: msg } });
  }
});

// ── API: ElevenLabs proxy — voices + text-to-speech ──────────────────────────
// Free tier: 10k chars/month, all preset voices, NO custom voice cloning.
// Cloning requires Starter plan ($5/mo). We expose both endpoints; the API
// rejects clone calls on free tier with a clear error and we surface it.
const ELEVENLABS_URL = "https://api.elevenlabs.io/v1";

app.get("/api/elevenlabs/voices", async (_req, res) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(400).json({ error: { message: "ELEVENLABS_API_KEY not set in .env.local. Get a free key at elevenlabs.io → Settings → API Keys." } });
  try {
    const r = await fetch(`${ELEVENLABS_URL}/voices`, { headers: { "xi-api-key": key } });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: { message: "ElevenLabs voices error: " + err.message } });
  }
});

// GET subscription info — tells the UI how many chars are left this month.
app.get("/api/elevenlabs/usage", async (_req, res) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(400).json({ error: { message: "ELEVENLABS_API_KEY not set" } });
  try {
    const r = await fetch(`${ELEVENLABS_URL}/user/subscription`, { headers: { "xi-api-key": key } });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: { message: err.message } });
  }
});

app.post("/api/elevenlabs/tts", async (req, res) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(400).json({ error: { message: "ELEVENLABS_API_KEY not set in .env.local. Sign up free at elevenlabs.io." } });
  const { voiceId, text, model_id = "eleven_turbo_v2_5", stability = 0.5, similarity_boost = 0.75 } = req.body || {};
  if (!voiceId || !text) return res.status(400).json({ error: { message: "voiceId and text are required" } });
  try {
    const r = await fetch(`${ELEVENLABS_URL}/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg" },
      body: JSON.stringify({ text, model_id, voice_settings: { stability, similarity_boost } }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      const msg = err.detail?.message || err.detail || err.message || `ElevenLabs returned ${r.status}`;
      return res.status(r.status).json({ error: { message: typeof msg === "string" ? msg : JSON.stringify(msg) } });
    }
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-cache");
    const buf = Buffer.from(await r.arrayBuffer());
    return res.send(buf);
  } catch (err) {
    return res.status(502).json({ error: { message: "ElevenLabs TTS error: " + err.message } });
  }
});

// ── API: Meta Ads — one-click campaign launch ────────────────────────────────
// Creates campaign + ad set + creative + ad in PAUSED state via Meta Marketing
// API. User reviews + activates in Ads Manager. Housing SAC auto-applied for
// real estate compliance. TRAFFIC objective (LEADS requires Lead Form setup).
const META_GRAPH = "https://graph.facebook.com/v19.0";

// Map AI-Composer objective strings to Meta API objective enums.
function mapObjective(objective) {
  switch ((objective || "").toUpperCase()) {
    case "LEADS":      return "OUTCOME_TRAFFIC"; // TRAFFIC for now; LEADS needs Lead Form (phase 2)
    case "TRAFFIC":    return "OUTCOME_TRAFFIC";
    case "AWARENESS":  return "OUTCOME_AWARENESS";
    case "ENGAGEMENT": return "OUTCOME_ENGAGEMENT";
    default:           return "OUTCOME_TRAFFIC";
  }
}

// Map composer CTA strings to FB CTA type enums.
function mapCtaButton(cta) {
  const map = {
    "Learn More":  "LEARN_MORE",
    "Sign Up":     "SIGN_UP",
    "Get Quote":   "GET_QUOTE",
    "Get Offer":   "GET_OFFER",
    "Apply Now":   "APPLY_NOW",
    "Contact Us":  "CONTACT_US",
    "Download":    "DOWNLOAD",
    "Book Now":    "BOOK_TRAVEL",
    "Send Message":"MESSAGE_PAGE",
  };
  return map[cta] || "LEARN_MORE";
}

// POST /api/meta-ads/launch
// Body: { campaign, accessToken, adAccountId, pageId, landingPageUrl }
app.post("/api/meta-ads/launch", async (req, res) => {
  const { campaign, accessToken, adAccountId, pageId, landingPageUrl } = req.body || {};
  if (!accessToken) return res.status(400).json({ error: { message: "Missing accessToken — paste a long-lived User Access Token with ads_management scope in Settings" } });
  if (!adAccountId) return res.status(400).json({ error: { message: "Missing adAccountId — set your act_XXXXX in Settings" } });
  if (!pageId)      return res.status(400).json({ error: { message: "Missing pageId — connect your Facebook Page in Integrations" } });
  if (!campaign)    return res.status(400).json({ error: { message: "Missing campaign data" } });

  const acct = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const steps = [];

  try {
    // ── 1. Create Campaign (PAUSED, Housing SAC) ─────────────────────────
    steps.push({ step: "campaign", status: "running" });
    const campaignBody = {
      name: campaign.campaignName || campaign.brief?.title || "RE Hub Campaign",
      objective: mapObjective(campaign.objective),
      status: "PAUSED",
      special_ad_categories: ["HOUSING"],
      access_token: accessToken,
    };
    const cRes = await fetch(`${META_GRAPH}/${acct}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(campaignBody),
    });
    const cData = await cRes.json();
    if (cData.error) throw new Error(`Campaign creation failed: ${cData.error.message}`);
    steps[0] = { step: "campaign", status: "done", id: cData.id };

    // ── 2. Resolve interest names → IDs via Targeting Search ────────────
    steps.push({ step: "targeting", status: "running" });
    const interestIds = [];
    const interestNames = (campaign.audience?.interests || []).slice(0, 10);
    for (const name of interestNames) {
      try {
        const sRes = await fetch(
          `${META_GRAPH}/search?type=adinterest&q=${encodeURIComponent(name)}&limit=1&access_token=${accessToken}`
        );
        const sData = await sRes.json();
        if (sData.data?.[0]?.id) {
          interestIds.push({ id: sData.data[0].id, name: sData.data[0].name });
        }
      } catch { /* skip unresolvable interests */ }
    }
    // Resolve city names to geo IDs (or fall back to country US for unresolved)
    const cityKeys = [];
    const cityNames = (campaign.audience?.locations || []).slice(0, 25);
    for (const cityName of cityNames) {
      try {
        const cleaned = cityName.replace(/,\s*MI/i, "").trim();
        const gRes = await fetch(
          `${META_GRAPH}/search?type=adgeolocation&location_types=["city"]&q=${encodeURIComponent(cleaned)}&country_code=US&limit=1&access_token=${accessToken}`
        );
        const gData = await gRes.json();
        if (gData.data?.[0]?.key) {
          cityKeys.push({
            key: gData.data[0].key,
            radius: campaign.audience?.radiusMiles || 15,
            distance_unit: "mile",
          });
        }
      } catch { /* skip */ }
    }
    steps[1] = { step: "targeting", status: "done", resolvedInterests: interestIds.length, resolvedCities: cityKeys.length };

    // ── 3. Create Ad Set ─────────────────────────────────────────────────
    steps.push({ step: "adset", status: "running" });
    const targeting = {
      // Housing SAC: age 18-65+, gender all, min radius 15mi
      age_min: 18,
      age_max: 65,
      geo_locations: cityKeys.length > 0
        ? { cities: cityKeys }
        : { countries: ["US"] },
    };
    if (interestIds.length > 0) {
      targeting.flexible_spec = [{ interests: interestIds }];
    }
    const dailyBudgetCents = Math.max(100, Math.round((campaign.budget?.daily || 10) * 100));
    const durationDays = Math.max(1, Math.min(60, campaign.budget?.totalDays || 7));
    const adSetBody = {
      name: `${campaignBody.name} — Ad Set`,
      campaign_id: cData.id,
      daily_budget: dailyBudgetCents,
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      targeting: JSON.stringify(targeting),
      status: "PAUSED",
      start_time: new Date(Date.now() + 60_000).toISOString(),
      end_time: new Date(Date.now() + durationDays * 86_400_000).toISOString(),
      access_token: accessToken,
    };
    const asRes = await fetch(`${META_GRAPH}/${acct}/adsets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adSetBody),
    });
    const asData = await asRes.json();
    if (asData.error) throw new Error(`Ad Set creation failed: ${asData.error.message}`);
    steps[2] = { step: "adset", status: "done", id: asData.id };

    // ── 4. Create Ad Creative ────────────────────────────────────────────
    steps.push({ step: "creative", status: "running" });
    const landingUrl = landingPageUrl || campaign.landingPageCopy?.url || `https://facebook.com/${pageId}`;
    const creativeBody = {
      name: `${campaignBody.name} — Creative`,
      object_story_spec: {
        page_id: pageId,
        link_data: {
          message:     campaign.primaryTexts?.[0] || "",
          link:        landingUrl,
          name:        (campaign.headlines?.[0] || campaignBody.name).slice(0, 40),
          description: (campaign.descriptions?.[0] || "").slice(0, 30),
          call_to_action: { type: mapCtaButton(campaign.ctaButton) },
        },
      },
      access_token: accessToken,
    };
    const cvRes = await fetch(`${META_GRAPH}/${acct}/adcreatives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creativeBody),
    });
    const cvData = await cvRes.json();
    if (cvData.error) throw new Error(`Creative creation failed: ${cvData.error.message}. Note: ads need an image/video uploaded in Ads Manager before activation.`);
    steps[3] = { step: "creative", status: "done", id: cvData.id };

    // ── 5. Create Ad ─────────────────────────────────────────────────────
    steps.push({ step: "ad", status: "running" });
    const adBody = {
      name: `${campaignBody.name} — Ad`,
      adset_id: asData.id,
      creative: { creative_id: cvData.id },
      status: "PAUSED",
      access_token: accessToken,
    };
    const adRes = await fetch(`${META_GRAPH}/${acct}/ads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adBody),
    });
    const adData = await adRes.json();
    if (adData.error) throw new Error(`Ad creation failed: ${adData.error.message}`);
    steps[4] = { step: "ad", status: "done", id: adData.id };

    return res.json({
      ok: true,
      steps,
      campaignId: cData.id,
      adSetId: asData.id,
      creativeId: cvData.id,
      adId: adData.id,
      adsManagerUrl: `https://www.facebook.com/adsmanager/manage/campaigns?act=${acct.replace("act_", "")}&selected_campaign_ids=${cData.id}`,
      notes: [
        "Campaign created in PAUSED state — review + activate in Ads Manager.",
        "Attach an image or video creative before activating (text-only ads don't run).",
        "Housing Special Ad Category was applied (required for real estate).",
        `${interestIds.length}/${interestNames.length} interests resolved, ${cityKeys.length}/${cityNames.length} cities resolved.`,
      ],
    });
  } catch (err) {
    return res.status(500).json({ error: { message: err.message }, steps });
  }
});

// ── API: Google Business Profile proxy ────────────────────────────────────────
// The browser passes the user's OAuth access token as Bearer; we forward to
// Google's Business Profile APIs. We don't store the token server-side because
// it's per-user — the React app holds it in localStorage and sends on each call.
const GBP_ACCOUNT_BASE  = "https://mybusinessaccountmanagement.googleapis.com/v1";
const GBP_INFO_BASE     = "https://mybusinessbusinessinformation.googleapis.com/v1";
const GBP_REVIEWS_BASE  = "https://mybusiness.googleapis.com/v4"; // legacy v4 still serves reviews
const GBP_PERF_BASE     = "https://businessprofileperformance.googleapis.com/v1";

function gbpProxy(targetUrl) {
  return async (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: { message: "Missing Bearer token — re-connect Google Business in Settings" } });
    }
    try {
      const url = typeof targetUrl === "function" ? targetUrl(req) : targetUrl;
      const opts = {
        method: req.method,
        headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
      };
      if (["POST", "PUT", "PATCH"].includes(req.method) && req.body) {
        opts.body = JSON.stringify(req.body);
      }
      const r = await fetch(url, opts);
      const text = await r.text();
      res.setHeader("Content-Type", "application/json");
      res.status(r.status).send(text || "{}");
    } catch (err) {
      res.status(502).json({ error: { message: "Google Business proxy error: " + err.message } });
    }
  };
}

// List GBP accounts (one per business identity the user manages)
app.get("/api/google-business/accounts", gbpProxy(`${GBP_ACCOUNT_BASE}/accounts`));

// List locations under an account (?account=accounts/{accountId})
app.get("/api/google-business/locations", gbpProxy((req) => {
  const acct = req.query.account || "";
  const fields = "name,title,storefrontAddress,phoneNumbers,websiteUri,categories,profile,metadata,regularHours";
  return `${GBP_INFO_BASE}/${encodeURI(acct)}/locations?readMask=${encodeURIComponent(fields)}&pageSize=10`;
}));

// List reviews for a location (?account=accounts/{id}&location=locations/{id})
app.get("/api/google-business/reviews", gbpProxy((req) => {
  const acct = req.query.account || "";
  const loc  = req.query.location || "";
  return `${GBP_REVIEWS_BASE}/${encodeURI(acct)}/${encodeURI(loc)}/reviews?pageSize=20`;
}));

// Reply to a review (POST body: { comment: "..." })
app.put("/api/google-business/reviews/reply", gbpProxy((req) => {
  const acct = req.query.account || "";
  const loc  = req.query.location || "";
  const review = req.query.review || ""; // reviews/{reviewId}
  return `${GBP_REVIEWS_BASE}/${encodeURI(acct)}/${encodeURI(loc)}/${encodeURI(review)}/reply`;
}));

// Performance / insights (?location=locations/{id}&start=YYYY-MM-DD&end=YYYY-MM-DD)
app.get("/api/google-business/insights", gbpProxy((req) => {
  const loc = req.query.location || "";
  const start = req.query.start || new Date(Date.now() - 30*24*3600*1000).toISOString().slice(0,10);
  const end   = req.query.end   || new Date().toISOString().slice(0,10);
  const [sy, sm, sd] = start.split("-");
  const [ey, em, ed] = end.split("-");
  const metrics = [
    "WEBSITE_CLICKS",
    "CALL_CLICKS",
    "BUSINESS_DIRECTION_REQUESTS",
    "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
    "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
    "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
    "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  ].map(m => `dailyMetrics=${m}`).join("&");
  const range = `dailyRange.start_date.year=${sy}&dailyRange.start_date.month=${parseInt(sm)}&dailyRange.start_date.day=${parseInt(sd)}&dailyRange.end_date.year=${ey}&dailyRange.end_date.month=${parseInt(em)}&dailyRange.end_date.day=${parseInt(ed)}`;
  return `${GBP_PERF_BASE}/${encodeURI(loc)}:fetchMultiDailyMetricsTimeSeries?${metrics}&${range}`;
}));

// ── API: health check ─────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ── INIT ──────────────────────────────────────────────────────────────────────
if (!fs.existsSync(INBOX)) writeInbox([]);

app.listen(PORT, () => {
  console.log(`\n✅  RE Hub Lead Capture Server running on http://localhost:${PORT}`);
  console.log(`\nWebhook endpoints:`);
  console.log(`  Generic/Zapier : POST http://localhost:${PORT}/webhook/lead`);
  console.log(`  Email parser   : POST http://localhost:${PORT}/webhook/email`);
  console.log(`  Zillow         : POST http://localhost:${PORT}/webhook/zillow`);
  console.log(`  Realtor.com    : POST http://localhost:${PORT}/webhook/realtor`);
  console.log(`  Facebook Leads : POST http://localhost:${PORT}/webhook/facebook-lead`);
  console.log(`\nTo expose publicly: npx ngrok http ${PORT}\n`);
});
