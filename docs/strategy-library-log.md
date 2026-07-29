# Strategy library log

Tracks progress against the queue in `crade-strategy-loop-prompt.md`, one
line per item as it's implemented or skipped. Commit hash is the strategy's
own commit (not the infra commits that came before it).

Infra note: the single-symbol-only engine couldn't express 8 of the 18
Tier A items (cross-sectional ranking / two-symbol pairs trading), so a
cross-sectional engine and a pairs engine were built first — see the infra
commits before `20c44bd`..`78085c2` on `main` and the "Three backtest
kinds" section of `CLAUDE.md`.

| # | Strategy | Tier | Commit | Notes |
|---|---|---|---|---|
| 15 | Pairs Trading with Stocks | A (infra) | `7e0594e` | User-chosen pair, not an automated cointegration scan across all NIFTY_50 pairs — see CLAUDE.md. |
| 1 | Trend-following Effect in Stocks | A | `f514da3` | Single-symbol time-series trend (trailing-return sign), distinct from the existing SMA Crossover strategy. Sanity-checked against RELIANCE.NS (1y, daily): 12 trades, -12.4% return vs. -10.0% buy-and-hold — directionally plausible. |
| 2 | 52-Week High Effect in Stocks | A | `453b75b` | George & Hwang single-stock nearness-to-52wk-high signal. Sanity-checked at defaults (lookback 252): 0 trades on TCS.NS/2y (never came back within 15% of its trailing high after declining — confirmed not a bug by re-running with lookback=60, which traded normally: 7 trades, -28.8%) and 2 trades on RELIANCE.NS/2y. |
| 3 | Momentum Factor Effect in Stocks | A | `7538847` | First strategy through the cross-sectional engine — surfaced a real engine bug (see cross-sectional-engine.ts fix in this same commit): buyHoldReturnPct locked onto the very first rebalance attempt even when it produced an empty target (not enough warmup history yet for a 126-bar lookback), freezing the benchmark at 0 forever. Fixed to wait for the first rebalance that actually picks something; added a regression test. Sanity-checked live against the full NIFTY 50 (1y, daily, topN=5): 27 trades, -4.3% return vs. +28.6% buy-and-hold (momentum underperformed this particular year — plausible, not evidence of an inverted signal). |
| 4 | Consistent Momentum Strategy | A | `5321f25` | Cross-sectional momentum filtered to symbols positive in ≥minPositiveMonths of the last lookbackMonths calendar months, ranked by total window return among eligible symbols. Test demonstrates the filter rejecting a one-spike-then-decline symbol (+20% raw return, 1/3 positive months) in favor of a steadier one (+15% raw return, 3/3 positive months). Sanity-checked live against the full NIFTY 50 (1y, daily): 43 trades, -6.6% return vs. +14.9% buy-and-hold. |
| 5 | Short Term Reversal Effect in Stocks (weekly) | A | `d65537a` | Cross-sectional reversal: ranks by worst trailing 5-bar (weekly) return, holds top topN, rebalanced weekly (StrategyDef.rebalanceFrequency). Sanity-checked live against the full NIFTY 50 (6mo, daily): 207 trades (high turnover expected from weekly rebalancing), -14.0% return vs. -15.1% buy-and-hold. |
| 6 | Low Volatility Factor Effect in Stocks | A | `2baf849` | Cross-sectional: ranks by negative trailing volatility (new volatility() indicator, population stdev of daily log returns), holds the calmest topN. Sanity-checked live against the full NIFTY 50 (1y, daily): 45 trades, -2.1% return vs. -10.7% buy-and-hold — the strategy's lower drawdown (14.6% max) than the broad decline is the expected defensive behavior of this anomaly, not a red flag. |
| 7 | Betting Against Beta Factor in Stocks | A | (this commit) | Long-only low-beta tilt (relabeled — no short-selling available, see CLAUDE.md/plan): ranks by negative rolling beta vs. an in-process equal-weight universe return (no extra index fetch needed), holds lowest-beta topN. dailyReturns/equalWeightMarketReturns/rollingBeta helpers reused by Residual Momentum. Sanity-checked live against the full NIFTY 50 (1y, daily): 31 trades, -24.6% return vs. -6.4% buy-and-hold — underperformed this period, a plausible factor-tilt outcome in any single window; the beta-ranking mechanism itself is verified correct by the unit test (lowest-amplitude mover scores highest). |
