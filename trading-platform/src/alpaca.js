'use strict';

// Thin Alpaca PAPER-trading client. No SDK, just fetch.
// Keys are read from the environment (never sent to the browser).
// Supports both APCA_* and ALPACA_* naming.

const PAPER_URL = 'https://paper-api.alpaca.markets';
const DATA_URL = 'https://data.alpaca.markets';

function keyId() {
  return process.env.APCA_API_KEY_ID || process.env.ALPACA_API_KEY_ID || process.env.ALPACA_KEY_ID;
}
function secretKey() {
  return (
    process.env.APCA_API_SECRET_KEY || process.env.ALPACA_API_SECRET_KEY || process.env.ALPACA_SECRET_KEY
  );
}
function hasKeys() {
  return Boolean(keyId() && secretKey());
}

function headers() {
  if (!hasKeys()) {
    const e = new Error(
      'Alpaca API keys are not set. Add APCA_API_KEY_ID and APCA_API_SECRET_KEY to trading-platform/.env (see .env.example).'
    );
    e.code = 'NO_KEYS';
    throw e;
  }
  return {
    'APCA-API-KEY-ID': keyId(),
    'APCA-API-SECRET-KEY': secretKey(),
    'Content-Type': 'application/json',
  };
}

async function api(base, pathStr, { method = 'GET', body } = {}) {
  const h = headers();
  let res;
  try {
    res = await fetch(base + pathStr, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  } catch (err) {
    throw new Error('Could not reach Alpaca (network blocked or offline).');
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = (data && data.message) || `Alpaca HTTP ${res.status}`;
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }
  return data;
}

const getAccount = () => api(PAPER_URL, '/v2/account');
const getClock = () => api(PAPER_URL, '/v2/clock');
const getPositions = () => api(PAPER_URL, '/v2/positions');

async function getPosition(symbol) {
  try {
    return await api(PAPER_URL, `/v2/positions/${encodeURIComponent(symbol)}`);
  } catch (e) {
    if (e.status === 404) return null; // no open position is a normal case
    throw e;
  }
}

function buyNotional(symbol, notional) {
  return api(PAPER_URL, '/v2/orders', {
    method: 'POST',
    body: {
      symbol,
      notional: Number(notional).toFixed(2),
      side: 'buy',
      type: 'market',
      time_in_force: 'day',
    },
  });
}

function closePosition(symbol) {
  return api(PAPER_URL, `/v2/positions/${encodeURIComponent(symbol)}`, { method: 'DELETE' });
}

// Recent daily bars (free IEX feed). Returns ascending, ending at the latest bar.
async function getDailyBars(symbol) {
  const start = new Date();
  start.setDate(start.getDate() - 400);
  const qs = new URLSearchParams({
    symbols: symbol,
    timeframe: '1Day',
    start: start.toISOString().slice(0, 10),
    limit: '1000',
    adjustment: 'all',
    feed: 'iex',
  });
  const data = await api(DATA_URL, `/v2/stocks/bars?${qs.toString()}`);
  const raw = (data.bars && data.bars[symbol]) || [];
  return raw.map((b) => ({
    date: b.t.slice(0, 10),
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: b.v,
  }));
}

module.exports = {
  hasKeys,
  getAccount,
  getClock,
  getPositions,
  getPosition,
  buyNotional,
  closePosition,
  getDailyBars,
};
