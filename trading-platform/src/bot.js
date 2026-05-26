'use strict';

const { STRATEGIES } = require('./strategies');

// Pure: what should the bot do, given today's target exposure and whether
// we currently hold the stock?
function decideAction(targetLong, hasPosition) {
  if (targetLong && !hasPosition) return 'BUY';
  if (!targetLong && hasPosition) return 'SELL';
  return 'HOLD';
}

// Today's target exposure (1 = long, 0 = flat) from the latest bar's signal.
function targetExposure(bars, strategyKey, params) {
  const strat = STRATEGIES[strategyKey];
  if (!strat) throw new Error('Unknown strategy.');
  const merged = { ...strat.defaults, ...(params || {}) };
  const signals = strat.fn(bars, merged);
  return {
    target: signals[signals.length - 1] ? 1 : 0,
    strategyName: strat.name,
    params: merged,
  };
}

// One bot cycle: fetch data -> compute signal -> reconcile with the live
// (paper) position -> place an order if needed. `alpaca` is injected so this
// can be unit-tested with a fake client.
async function runBotTick(alpaca, { symbol, strategy, params, notional = 1000, dryRun = false }) {
  symbol = (symbol || '').trim().toUpperCase();
  if (!symbol) throw new Error('Symbol is required.');

  const bars = await alpaca.getDailyBars(symbol);
  if (!bars || bars.length < 30) {
    throw new Error('Not enough price history from the data feed for this symbol.');
  }

  const { target, strategyName, params: usedParams } = targetExposure(bars, strategy, params);

  const position = await alpaca.getPosition(symbol);
  const hasPosition = Boolean(position && parseFloat(position.qty) > 0);
  const action = decideAction(target === 1, hasPosition);

  const clock = await alpaca.getClock();
  const last = bars[bars.length - 1];

  const entry = {
    time: new Date().toISOString(),
    symbol,
    strategy: strategyName,
    params: usedParams,
    signal: target === 1 ? 'LONG' : 'FLAT',
    hadPosition: hasPosition,
    action,
    marketOpen: Boolean(clock.is_open),
    lastClose: last.close,
    asOf: last.date,
    order: null,
    dryRun: Boolean(dryRun),
    note: '',
  };

  if (action === 'HOLD') {
    entry.note = hasPosition ? 'Already long — holding.' : 'No position — staying flat.';
    return entry;
  }
  if (dryRun) {
    entry.note = `Dry run — would ${action} ${symbol} (no order placed).`;
    return entry;
  }
  if (!clock.is_open) {
    entry.note = 'Market closed — order not placed (it would be rejected). Run during market hours.';
    return entry;
  }

  if (action === 'BUY') {
    entry.order = await alpaca.buyNotional(symbol, notional);
    entry.note = `Placed market BUY for $${notional} of ${symbol} (paper).`;
  } else {
    entry.order = await alpaca.closePosition(symbol);
    entry.note = `Closed ${symbol} position (paper).`;
  }
  return entry;
}

module.exports = { decideAction, targetExposure, runBotTick };
