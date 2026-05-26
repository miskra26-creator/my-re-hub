# Trading Strategy Backtester

A self-contained tool for **researching trading strategies against historical
data with fake money**. This is step 1 of a trading research platform —
separate from any other project, with its own dependencies (actually: *no*
dependencies — it runs on plain Node.js).

> **Research & education only. Not financial advice.** A backtest that looks
> profitable can still lose money live. Backtesting is the easiest place in all
> of finance to fool yourself. Treat good results as "worth paper-trading next,"
> never as "guaranteed money."

## Run it

```bash
cd trading-platform
npm start
```

Then open **http://localhost:4000**. No install, no API keys.

- Type `DEMO` as the symbol to run **fully offline** on a built-in simulated
  price series.
- Type a real ticker (`AAPL`, `SPY`, `MSFT`, …) to pull **free end-of-day data**
  from Stooq (needs internet; data may be delayed).

## Run the tests

```bash
npm test
```

Uses Node's built-in test runner — no extra tooling.

## What's inside

| File | Purpose |
|------|---------|
| `server.js` | Tiny zero-dependency HTTP server (static UI + `/api/backtest`). |
| `src/indicators.js` | SMA and Wilder's RSI. |
| `src/strategies.js` | Strategies: SMA crossover, RSI mean-reversion, buy & hold. |
| `src/backtest.js` | The simulation engine + performance metrics. |
| `src/dataSource.js` | Demo data generator + free Stooq fetcher. |
| `public/` | The browser UI with canvas charts. |

## Metrics explained

- **Total return** — how much the strategy made/lost over the period.
- **Buy & hold** — what you'd have made by just buying and holding. *The number
  that matters most:* if a strategy can't beat buy & hold, it isn't adding value.
- **Max drawdown** — the worst peak-to-trough drop. This is the pain you'd have
  to sit through. Big returns with a 60% drawdown are usually unlivable.
- **Win rate** — % of trades that were profitable.
- **Sharpe (annualized)** — return per unit of volatility. Higher is steadier.
- **Time in market** — how often you were holding vs. in cash.

## Honest limitations (read this)

- **No slippage / spread.** Real fills are worse than backtested fills.
- **End-of-day data only.** This can't model intraday day-trading yet.
- **Long-only, all-in.** No shorting, no position sizing, no options yet.
- **Overfitting risk.** Tuning parameters until the backtest looks great almost
  always produces a strategy that fails on new data.

## Roadmap (suggested next steps)

1. **Live paper trading** via a free [Alpaca](https://alpaca.markets) paper
   account (real simulated order execution, $0). Robinhood has no public API, so
   Alpaca is the practical choice for hooking up live data + simulated trades.
2. **Options probability tools** — probability of profit, Greeks, expected value.
3. **Position sizing & risk controls** — stop losses, % risk per trade.
4. **Intraday data** for actual day-trading research (requires a paid feed).
