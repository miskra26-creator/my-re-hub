'use strict';

function round(x, dp = 2) {
  if (x == null || Number.isNaN(x)) return x;
  const f = Math.pow(10, dp);
  return Math.round(x * f) / f;
}

// Long-only, all-in simulator. On each bar we look at the PREVIOUS bar's
// signal and execute at the current bar's open. This avoids look-ahead bias
// (you can't trade on a signal before the bar that produced it has closed).
//
// Assumptions (kept simple on purpose, stated honestly):
//  - One position at a time, full cash committed (fractional shares allowed).
//  - Fills at the open price, no slippage modeled.
//  - Optional flat commission per trade leg.
function runBacktest(bars, signals, { startCash = 10000, commission = 0 } = {}) {
  if (!Array.isArray(bars) || bars.length < 2) {
    throw new Error('Need at least 2 bars to run a backtest.');
  }

  let cash = startCash;
  let shares = 0;
  let pos = 0;
  let inMarketBars = 0;
  const trades = [];
  let openTrade = null;

  const bhShares = startCash / bars[0].close; // buy & hold baseline
  const equityCurve = [{ date: bars[0].date, equity: round(startCash), bh: round(startCash) }];

  for (let t = 1; t < bars.length; t++) {
    const desired = signals[t - 1] ? 1 : 0;
    const execPrice = bars[t].open || bars[t].close;

    if (desired === 1 && pos === 0) {
      const cost = cash; // commit everything
      shares = (cash - commission) / execPrice;
      cash = 0;
      pos = 1;
      openTrade = { entryDate: bars[t].date, entryPrice: execPrice, shares, cost };
    } else if (desired === 0 && pos === 1) {
      const proceeds = shares * execPrice - commission;
      const pnl = proceeds - openTrade.cost;
      trades.push({
        entryDate: openTrade.entryDate,
        entryPrice: round(openTrade.entryPrice),
        exitDate: bars[t].date,
        exitPrice: round(execPrice),
        shares: round(openTrade.shares, 4),
        pnl: round(pnl),
        returnPct: round((pnl / openTrade.cost) * 100, 2),
        win: pnl > 0,
        open: false,
      });
      cash = proceeds;
      shares = 0;
      pos = 0;
      openTrade = null;
    }

    if (pos === 1) inMarketBars++;
    const equity = cash + shares * bars[t].close;
    equityCurve.push({
      date: bars[t].date,
      equity: round(equity),
      bh: round(bhShares * bars[t].close),
    });
  }

  // If still holding at the end, mark to market so it shows in the trade log.
  if (openTrade) {
    const lastClose = bars[bars.length - 1].close;
    const proceeds = openTrade.shares * lastClose;
    const pnl = proceeds - openTrade.cost;
    trades.push({
      entryDate: openTrade.entryDate,
      entryPrice: round(openTrade.entryPrice),
      exitDate: null,
      exitPrice: round(lastClose),
      shares: round(openTrade.shares, 4),
      pnl: round(pnl),
      returnPct: round((pnl / openTrade.cost) * 100, 2),
      win: pnl > 0,
      open: true,
    });
  }

  const last = equityCurve[equityCurve.length - 1];
  const finalEquity = last.equity;
  const bhFinal = last.bh;

  // Max drawdown (largest peak-to-trough drop in equity).
  let peak = -Infinity;
  let maxDd = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak > 0 ? (peak - p.equity) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }

  // Annualized Sharpe-style ratio (risk-free rate assumed 0).
  const rets = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    if (prev > 0) rets.push(equityCurve[i].equity / prev - 1);
  }
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const variance =
    rets.length > 1 ? rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1) : 0;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

  const years = bars.length / 252;
  const cagr =
    years > 0 && finalEquity > 0 ? (Math.pow(finalEquity / startCash, 1 / years) - 1) * 100 : 0;

  const wins = trades.filter((t) => t.win).length;

  const metrics = {
    startCash: round(startCash),
    finalEquity: round(finalEquity),
    totalReturnPct: round((finalEquity / startCash - 1) * 100, 2),
    buyHoldFinal: round(bhFinal),
    buyHoldReturnPct: round((bhFinal / startCash - 1) * 100, 2),
    numTrades: trades.length,
    wins,
    winRatePct: trades.length ? round((wins / trades.length) * 100, 1) : 0,
    maxDrawdownPct: round(maxDd * 100, 2),
    cagrPct: round(cagr, 2),
    sharpe: round(sharpe, 2),
    exposurePct: round((inMarketBars / (bars.length - 1)) * 100, 1),
    bars: bars.length,
    fromDate: bars[0].date,
    toDate: bars[bars.length - 1].date,
  };

  return { equityCurve, trades, metrics };
}

module.exports = { runBacktest, round };
