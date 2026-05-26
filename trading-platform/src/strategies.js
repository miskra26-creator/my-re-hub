'use strict';

const { sma, rsi } = require('./indicators');

// Each strategy takes the bar array and params, and returns a "signals"
// array of 0/1 per bar: 1 = want to be long (in the market) based on
// information known AT THE CLOSE of that bar. The backtester executes
// the change on the NEXT bar's open, which avoids look-ahead bias.

function smaCrossover(bars, { fast = 20, slow = 50 } = {}) {
  const close = bars.map((b) => b.close);
  const f = sma(close, fast);
  const s = sma(close, slow);
  return close.map((_, i) => (f[i] != null && s[i] != null && f[i] > s[i] ? 1 : 0));
}

function rsiReversion(bars, { period = 14, oversold = 30, overbought = 70 } = {}) {
  const close = bars.map((b) => b.close);
  const r = rsi(close, period);
  const signals = new Array(bars.length).fill(0);
  let pos = 0;
  for (let i = 0; i < bars.length; i++) {
    if (r[i] != null) {
      if (pos === 0 && r[i] < oversold) pos = 1;
      else if (pos === 1 && r[i] > overbought) pos = 0;
    }
    signals[i] = pos;
  }
  return signals;
}

function buyHold(bars) {
  // Always long, so the entry happens at the earliest possible bar (bar 1's open).
  return bars.map(() => 1);
}

const STRATEGIES = {
  sma_crossover: {
    name: 'SMA Crossover',
    fn: smaCrossover,
    defaults: { fast: 20, slow: 50 },
    blurb: 'Go long when the fast moving average is above the slow one. A classic trend-following idea.',
  },
  rsi_reversion: {
    name: 'RSI Mean Reversion',
    fn: rsiReversion,
    defaults: { period: 14, oversold: 30, overbought: 70 },
    blurb: 'Buy when RSI is oversold, sell when it becomes overbought. A simple "buy the dip" idea.',
  },
  buy_hold: {
    name: 'Buy & Hold',
    fn: buyHold,
    defaults: {},
    blurb: 'Buy once and never sell. The baseline every strategy should be compared against.',
  },
};

module.exports = { smaCrossover, rsiReversion, buyHold, STRATEGIES };
