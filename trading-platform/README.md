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

## Deploy the backtester to a live URL (Vercel)

The backtester runs great on Vercel as a static site + serverless functions
(the `api/` folder). The paper-trading bot is intentionally **not** exposed on
the public URL — it needs your API keys and shouldn't live behind an
unauthenticated public endpoint. Follow these clicks once and every future
`git push` auto-deploys:

1. Log into [vercel.com](https://vercel.com) with your GitHub account.
2. Click **Add New → Project**.
3. Import the `miskra26-creator/my-re-hub` repository.
4. **Important:** click **Edit** next to Root Directory and set it to
   `trading-platform`. Otherwise Vercel will try to build the real-estate CRM.
5. Framework preset: **Other**. Leave Build/Output settings as-is.
6. Click **Deploy**. In ~1 minute you'll get a live URL like
   `https://my-re-hub-trading.vercel.app`.

That URL will show the Backtester ready to use from any device. The "Live Bot"
tab will render a friendly notice that the bot only runs locally.

## Live paper-trading bot

Open **http://localhost:4000/bot.html** (or click "Live Bot" in the nav). The
bot runs a strategy on recent data and **auto-places simulated orders** through
Alpaca's paper API — fake money, $0 risk.

### One-time setup

1. Make a free account at [alpaca.markets](https://alpaca.markets) → **Paper Trading**.
2. Generate paper API keys (Key ID + Secret).
3. Copy `.env.example` to `.env` and paste your keys:
   ```
   APCA_API_KEY_ID=your_key_id
   APCA_API_SECRET_KEY=your_secret_key
   ```
4. `npm start` again. The bot page will show your paper account.

### How the bot decides

On each "tick" it pulls recent daily bars, computes the strategy's signal for
the latest bar (LONG or FLAT), checks your current paper position, and:

- wants LONG + no position → **BUY** (market order, `$ per trade`)
- wants FLAT + holding → **SELL** (close the position)
- otherwise → **HOLD**

Use **Dry run** to see the decision without placing an order. **Auto-run**
re-checks on an interval while the app stays open (orders only go through during
market hours).

> The keys live only in your local `.env` and are used server-side — they are
> never exposed to the browser. The bot only ever calls Alpaca's *paper*
> endpoint, so real money is never at risk.

## Roadmap (suggested next steps)

1. ~~Live paper trading via Alpaca~~ ✅ done (see above).
2. **Options probability tools** — probability of profit, Greeks, expected value.
3. **Position sizing & risk controls** — stop losses, % risk per trade.
4. **Intraday data + faster bot loop** for real day-trading research (paid feed).
5. **Persistence** — the bot log/auto-run state is in-memory and resets on
   restart; add a small store if you want history to survive restarts.
