'use strict';

// Deterministic PRNG so the DEMO dataset is identical every run.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds a synthetic but realistic-looking daily price series ending today.
// Clearly labeled as simulated — it is NOT a real security.
function generateDemoBars(days = 504, seed = 42) {
  const rand = mulberry32(seed);

  const dates = [];
  let d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  while (dates.length < days) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) dates.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() - 86400000);
  }
  dates.reverse();

  const bars = [];
  let price = 100;
  const drift = 0.0004;
  const vol = 0.018;
  for (const date of dates) {
    const shock = (rand() - 0.5) * 2 * vol + drift;
    const open = price;
    const close = Math.max(1, open * (1 + shock));
    const high = Math.max(open, close) * (1 + rand() * 0.01);
    const low = Math.min(open, close) * (1 - rand() * 0.01);
    bars.push({
      date,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume: Math.round(1e6 + rand() * 5e5),
    });
    price = close;
  }
  return bars;
}

function parseCsv(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2 || !/date/i.test(lines[0])) {
    throw new Error('No data returned for that symbol (it may be invalid or unsupported).');
  }
  const bars = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const [date, open, high, low, close, volume] = cols;
    const c = parseFloat(close);
    if (!date || Number.isNaN(c)) continue;
    bars.push({
      date,
      open: parseFloat(open) || c,
      high: parseFloat(high) || c,
      low: parseFloat(low) || c,
      close: c,
      volume: parseInt(volume, 10) || 0,
    });
  }
  if (bars.length === 0) throw new Error('No usable rows found for that symbol.');
  return bars;
}

// Free end-of-day data from Stooq. No API key required.
async function fetchStooq(symbol) {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol.toLowerCase())}.us&i=d`;
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  } catch (err) {
    throw new Error(
      'Could not reach the data provider (no internet access in this environment?). Try symbol "DEMO" to run offline.'
    );
  }
  if (!res.ok) throw new Error(`Data provider returned HTTP ${res.status}.`);
  return parseCsv(await res.text());
}

async function getDailyBars(symbol, { years = 2 } = {}) {
  const sym = (symbol || 'DEMO').trim().toUpperCase();

  if (sym === 'DEMO') {
    return { symbol: sym, source: 'Simulated demo data (not a real security)', bars: generateDemoBars() };
  }

  let bars = await fetchStooq(sym);
  if (years && years > 0) {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);
    const iso = cutoff.toISOString().slice(0, 10);
    bars = bars.filter((b) => b.date >= iso);
  }
  return { symbol: sym, source: 'Stooq (free end-of-day data, may be delayed)', bars };
}

module.exports = { getDailyBars, generateDemoBars, parseCsv };
