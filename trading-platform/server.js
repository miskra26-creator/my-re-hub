'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const { getDailyBars } = require('./src/dataSource');
const { STRATEGIES } = require('./src/strategies');
const { runBacktest } = require('./src/backtest');
const alpaca = require('./src/alpaca');
const { runBotTick } = require('./src/bot');

// --- Minimal .env loader (no dependency on dotenv) ---
function loadEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnv();

const PORT = process.env.PORT || 4000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// --- In-memory bot state (resets when the server restarts) ---
const botLog = [];
let autoTimer = null;
let autoState = { enabled: false, minutes: 60, config: null };

function pushLog(entry) {
  botLog.unshift(entry);
  if (botLog.length > 200) botLog.length = 200;
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) {
        req.destroy();
        reject(new Error('Request body too large.'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

async function handleBacktest(req, res) {
  try {
    const body = await readBody(req);
    const strat = STRATEGIES[body.strategy || 'sma_crossover'];
    if (!strat) return sendJson(res, 400, { error: 'Unknown strategy.' });

    const params = { ...strat.defaults, ...(body.params || {}) };
    const { symbol, source, bars } = await getDailyBars(body.symbol, { years: Number(body.years) || 2 });
    if (bars.length < 30) {
      return sendJson(res, 400, { error: 'Not enough price history to backtest (need 30+ days).' });
    }
    const signals = strat.fn(bars, params);
    const result = runBacktest(bars, signals, {
      startCash: Number(body.startCash) || 10000,
      commission: Number(body.commission) || 0,
    });
    sendJson(res, 200, {
      symbol,
      source,
      strategy: strat.name,
      params,
      ...result,
      priceSeries: bars.map((b) => ({ date: b.date, close: b.close })),
    });
  } catch (err) {
    sendJson(res, 400, { error: err.message || 'Backtest failed.' });
  }
}

async function handleBotAccount(req, res) {
  try {
    const [account, positions, clock] = await Promise.all([
      alpaca.getAccount(),
      alpaca.getPositions(),
      alpaca.getClock(),
    ]);
    sendJson(res, 200, { account, positions, clock });
  } catch (err) {
    sendJson(res, err.code === 'NO_KEYS' ? 200 : 400, { error: err.message, noKeys: err.code === 'NO_KEYS' });
  }
}

async function handleBotRun(req, res) {
  try {
    const body = await readBody(req);
    const entry = await runBotTick(alpaca, {
      symbol: body.symbol,
      strategy: body.strategy || 'sma_crossover',
      params: body.params,
      notional: Number(body.notional) || 1000,
      dryRun: Boolean(body.dryRun),
    });
    pushLog(entry);
    sendJson(res, 200, { entry, log: botLog });
  } catch (err) {
    sendJson(res, 400, { error: err.message || 'Bot run failed.', noKeys: err.code === 'NO_KEYS' });
  }
}

function stopAuto() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
  autoState = { ...autoState, enabled: false };
}

async function tickAuto() {
  if (!autoState.config) return;
  try {
    const entry = await runBotTick(alpaca, autoState.config);
    pushLog(entry);
  } catch (err) {
    pushLog({ time: new Date().toISOString(), action: 'ERROR', note: err.message, symbol: autoState.config.symbol });
  }
}

async function handleBotAuto(req, res) {
  try {
    const body = await readBody(req);
    if (body.enabled) {
      const minutes = Math.max(1, Number(body.minutes) || 60);
      autoState = {
        enabled: true,
        minutes,
        config: {
          symbol: body.symbol,
          strategy: body.strategy || 'sma_crossover',
          params: body.params,
          notional: Number(body.notional) || 1000,
          dryRun: Boolean(body.dryRun),
        },
      };
      if (autoTimer) clearInterval(autoTimer);
      autoTimer = setInterval(tickAuto, minutes * 60 * 1000);
      tickAuto(); // run one immediately
    } else {
      stopAuto();
    }
    sendJson(res, 200, { auto: { enabled: autoState.enabled, minutes: autoState.minutes, config: autoState.config } });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

function serveStatic(req, res) {
  let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (req.method === 'POST' && url === '/api/backtest') return handleBacktest(req, res);
  if (req.method === 'POST' && url === '/api/bot/run') return handleBotRun(req, res);
  if (req.method === 'POST' && url === '/api/bot/auto') return handleBotAuto(req, res);

  if (req.method === 'GET' && url === '/api/strategies') {
    return sendJson(
      res,
      200,
      Object.entries(STRATEGIES).map(([key, v]) => ({ key, name: v.name, defaults: v.defaults, blurb: v.blurb }))
    );
  }
  if (req.method === 'GET' && url === '/api/bot/status') {
    return sendJson(res, 200, {
      hasKeys: alpaca.hasKeys(),
      auto: { enabled: autoState.enabled, minutes: autoState.minutes, config: autoState.config },
      log: botLog,
    });
  }
  if (req.method === 'GET' && url === '/api/bot/account') return handleBotAccount(req, res);

  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405);
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Trading research platform running at http://localhost:${PORT}`);
  console.log(`Alpaca keys detected: ${alpaca.hasKeys() ? 'yes' : 'no (paper bot disabled until set)'}`);
});
