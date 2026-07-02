'use strict';

const { getDailyBars } = require('../src/dataSource');
const { STRATEGIES } = require('../src/strategies');
const { runBacktest } = require('../src/backtest');

// POST /api/backtest — run a strategy over historical data.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }
  try {
    // Vercel parses JSON bodies automatically for the Node runtime; be
    // defensive in case the body arrives as a raw string.
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    const strat = STRATEGIES[body.strategy || 'sma_crossover'];
    if (!strat) return res.status(400).json({ error: 'Unknown strategy.' });

    const params = { ...strat.defaults, ...(body.params || {}) };
    const { symbol, source, bars } = await getDailyBars(body.symbol, {
      years: Number(body.years) || 2,
    });
    if (bars.length < 30) {
      return res.status(400).json({ error: 'Not enough price history to backtest (need 30+ days).' });
    }
    const signals = strat.fn(bars, params);
    const result = runBacktest(bars, signals, {
      startCash: Number(body.startCash) || 10000,
      commission: Number(body.commission) || 0,
    });
    res.status(200).json({
      symbol,
      source,
      strategy: strat.name,
      params,
      ...result,
      priceSeries: bars.map((b) => ({ date: b.date, close: b.close })),
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Backtest failed.' });
  }
};
