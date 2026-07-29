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
| 2 | 52-Week High Effect in Stocks | A | (this commit) | George & Hwang single-stock nearness-to-52wk-high signal. Sanity-checked at defaults (lookback 252): 0 trades on TCS.NS/2y (never came back within 15% of its trailing high after declining — confirmed not a bug by re-running with lookback=60, which traded normally: 7 trades, -28.8%) and 2 trades on RELIANCE.NS/2y. |
