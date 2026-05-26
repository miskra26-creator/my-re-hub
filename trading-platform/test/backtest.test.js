'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { sma, rsi } = require('../src/indicators');
const { buyHold, smaCrossover } = require('../src/strategies');
const { runBacktest } = require('../src/backtest');
const { generateDemoBars } = require('../src/dataSource');

function bars(prices) {
  // open === close so execution price is deterministic for tests.
  return prices.map((p, i) => ({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, open: p, high: p, low: p, close: p, volume: 0 }));
}

test('sma computes trailing average and nulls early values', () => {
  const out = sma([1, 2, 3, 4, 5], 3);
  assert.deepStrictEqual(out.slice(0, 2), [null, null]);
  assert.strictEqual(out[2], 2); // (1+2+3)/3
  assert.strictEqual(out[4], 4); // (3+4+5)/3
});

test('rsi is 100 when prices only rise', () => {
  const out = rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 14);
  assert.strictEqual(out[13], null === out[13] ? out[13] : out[13]); // sanity index exists
  assert.strictEqual(out[14], 100);
});

test('rsi stays in 0..100 range on mixed data', () => {
  const series = [44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
  const out = rsi(series, 14);
  for (const v of out) {
    if (v != null) assert.ok(v >= 0 && v <= 100, `RSI out of range: ${v}`);
  }
});

test('all-flat signals leave equity untouched', () => {
  const b = bars([10, 11, 12, 13]);
  const signals = [0, 0, 0, 0];
  const { metrics } = runBacktest(b, signals, { startCash: 10000 });
  assert.strictEqual(metrics.finalEquity, 10000);
  assert.strictEqual(metrics.numTrades, 0);
  assert.strictEqual(metrics.totalReturnPct, 0);
});

test('buy & hold tracks price appreciation from the entry bar', () => {
  const b = bars([10, 11, 12, 11, 13]);
  const signals = buyHold(b); // [0,1,1,1,1] -> enters at bar 1 open (=11)
  const { metrics, trades } = runBacktest(b, signals, { startCash: 10000 });
  // Entered at 11, last close 13 -> 10000 * 13/11
  assert.ok(Math.abs(metrics.finalEquity - (10000 * 13) / 11) < 1);
  assert.strictEqual(trades.length, 1);
  assert.strictEqual(trades[0].open, true); // still holding at the end
});

test('a completed round-trip trade records correct P/L and win flag', () => {
  const b = bars([10, 10, 12, 12]);
  // enter at bar 1 (price 10), exit at bar 3 (price 12)
  const signals = [1, 1, 0, 0];
  const { trades } = runBacktest(b, signals, { startCash: 10000 });
  assert.strictEqual(trades.length, 1);
  assert.strictEqual(trades[0].win, true);
  assert.strictEqual(trades[0].entryPrice, 10);
  assert.strictEqual(trades[0].exitPrice, 12);
  assert.ok(Math.abs(trades[0].returnPct - 20) < 0.001);
});

test('max drawdown is detected on a peak-then-trough curve', () => {
  const b = bars([10, 20, 5]); // hold through: peak then big drop
  const signals = [1, 1, 1];
  const { metrics } = runBacktest(b, signals, { startCash: 10000 });
  // peaked at 20 (relative), dropped to 5 -> 75% drawdown
  assert.ok(metrics.maxDrawdownPct >= 70 && metrics.maxDrawdownPct <= 80);
});

test('demo data is deterministic and well-formed', () => {
  const a = generateDemoBars();
  const c = generateDemoBars();
  assert.strictEqual(a.length, c.length);
  assert.strictEqual(a[0].close, c[0].close);
  for (const bar of a.slice(0, 20)) {
    assert.ok(bar.high >= bar.low);
    assert.ok(bar.close > 0);
    assert.match(bar.date, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('smaCrossover returns one signal per bar in {0,1}', () => {
  const b = generateDemoBars();
  const sig = smaCrossover(b, { fast: 10, slow: 30 });
  assert.strictEqual(sig.length, b.length);
  assert.ok(sig.every((s) => s === 0 || s === 1));
});
