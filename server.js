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
