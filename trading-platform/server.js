'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const { getDailyBars } = require('./src/dataSource');
const { STRATEGIES } = require('./src/strategies');
const { runBacktest } = require('./src/backtest');

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

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function handleBacktest(req, res) {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 1e6) req.destroy(); // guard against oversized bodies
  });
  req.on('end', async () => {
    try {
      const body = JSON.parse(raw || '{}');
      const strat = STRATEGIES[body.strategy || 'sma_crossover'];
      if (!strat) return sendJson(res, 400, { error: 'Unknown strategy.' });

      const params = { ...strat.defaults, ...(body.params || {}) };
      const { symbol, source, bars } = await getDailyBars(body.symbol, {
        years: Number(body.years) || 2,
      });
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
  });
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
  if (req.method === 'POST' && req.url === '/api/backtest') return handleBacktest(req, res);
  if (req.method === 'GET' && req.url === '/api/strategies') {
    return sendJson(
      res,
      200,
      Object.entries(STRATEGIES).map(([key, v]) => ({
        key,
        name: v.name,
        defaults: v.defaults,
        blurb: v.blurb,
      }))
    );
  }
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405);
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Trading research platform running at http://localhost:${PORT}`);
});
