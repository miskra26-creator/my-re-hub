'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { decideAction, targetExposure, runBotTick } = require('../src/bot');
const { generateDemoBars } = require('../src/dataSource');

test('decideAction covers all four cases', () => {
  assert.strictEqual(decideAction(true, false), 'BUY'); // want in, currently flat
  assert.strictEqual(decideAction(false, true), 'SELL'); // want out, currently long
  assert.strictEqual(decideAction(true, true), 'HOLD'); // already long
  assert.strictEqual(decideAction(false, false), 'HOLD'); // already flat
});

test('targetExposure(buy_hold) is always long on the latest bar', () => {
  const bars = generateDemoBars();
  const { target, strategyName } = targetExposure(bars, 'buy_hold', {});
  assert.strictEqual(target, 1);
  assert.strictEqual(strategyName, 'Buy & Hold');
});

test('targetExposure throws on unknown strategy', () => {
  assert.throws(() => targetExposure(generateDemoBars(), 'nope', {}), /Unknown strategy/);
});

// A fake Alpaca client lets us test the bot loop without any network.
function fakeAlpaca({ position = null, isOpen = true } = {}) {
  const calls = { buy: [], close: [] };
  return {
    calls,
    getDailyBars: async () => generateDemoBars(),
    getPosition: async () => position,
    getClock: async () => ({ is_open: isOpen }),
    buyNotional: async (symbol, notional) => {
      calls.buy.push({ symbol, notional });
      return { id: 'order1', symbol, notional, side: 'buy' };
    },
    closePosition: async (symbol) => {
      calls.close.push({ symbol });
      return { id: 'order2', symbol, side: 'sell' };
    },
  };
}

test('dry run never places an order', async () => {
  const a = fakeAlpaca({ position: null });
  const entry = await runBotTick(a, { symbol: 'demo', strategy: 'buy_hold', dryRun: true });
  assert.strictEqual(entry.action, 'BUY');
  assert.strictEqual(entry.order, null);
  assert.strictEqual(a.calls.buy.length, 0);
});

test('buys when long signal and no position, during market hours', async () => {
  const a = fakeAlpaca({ position: null, isOpen: true });
  const entry = await runBotTick(a, { symbol: 'demo', strategy: 'buy_hold', notional: 500 });
  assert.strictEqual(entry.action, 'BUY');
  assert.strictEqual(a.calls.buy.length, 1);
  assert.strictEqual(a.calls.buy[0].notional, 500);
});

test('does not place an order while the market is closed', async () => {
  const a = fakeAlpaca({ position: null, isOpen: false });
  const entry = await runBotTick(a, { symbol: 'demo', strategy: 'buy_hold' });
  assert.strictEqual(entry.action, 'BUY');
  assert.strictEqual(a.calls.buy.length, 0);
  assert.match(entry.note, /closed/i);
});

test('holds when already long with a long signal', async () => {
  const a = fakeAlpaca({ position: { qty: '3' }, isOpen: true });
  const entry = await runBotTick(a, { symbol: 'demo', strategy: 'buy_hold' });
  assert.strictEqual(entry.action, 'HOLD');
  assert.strictEqual(a.calls.buy.length, 0);
  assert.strictEqual(a.calls.close.length, 0);
});
