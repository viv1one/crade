# Loop Engineering Prompt — Crade Strategy Library Expansion

Paste this into Claude Code (or any agentic coding loop) at the root of the Crade repo.
It is written to be run unattended across many iterations. Each iteration should end in a
committed, tested, working state — never leave the repo mid-change between iterations.

---

## 0. Mission

Expand `lib/backtest/strategies.ts` by implementing strategies from the list in
**Section 2 (the queue)** below, one at a time, in priority order. Each strategy becomes
a new entry in `STRATEGIES`, backed by any new indicator logic it needs in
`lib/backtest/indicators.ts`, exercised by a runnable backtest, and covered by a unit test.

Do not start on strategy N+1 until strategy N is implemented, tested, passing, and committed.

## 1. Non-negotiable constraints (from the existing codebase)

- **No fabrication.** If a strategy needs data Crade's providers don't reliably return
  (see Tier C in the queue), do not approximate it with a plausible-sounding stand-in and
  present it as the real thing. Skip it, log why in `docs/strategy-library-log.md` (create
  if absent), and move to the next item. This is the same discipline already enforced in
  `lib/ai/context.ts` and `app/api/digest/route.ts` — apply it to strategy design, not just
  AI text generation.
- **Respect the provider-agnostic seams.** New data needs go through
  `lib/market-data/types.ts`'s `MarketDataProvider` interface, not a one-off fetch bolted
  onto a strategy file. If a strategy needs something no current provider exposes (e.g.
  options data, short interest, filings text), that's a Tier C signal, not a reason to add
  a fragile scrape.
- **Universe is NIFTY_50** (`lib/screener/universe.ts`) unless a strategy is explicitly
  single-symbol. Cross-sectional strategies (size, sector rotation, low-vol) rank across
  this fixed list, not "all NSE stocks" — that data source doesn't exist here.
- **Pure functions first.** Signal/weight logic belongs in testable, framework-free
  functions (mirror `lib/paper-trading/store.ts`'s pattern) — not inline in a route handler.
- **No real-money framing.** Every new strategy is for the existing paper-trading /
  backtest surfaces only. Do not add anything that reads as investment advice with a
  confidence claim about future returns — the screener AI-query route already draws this
  line explicitly; hold it here too.
- **Test before commit.** `npm test` and `npx tsc --noEmit` clean before every commit.
  Add the new strategy's test alongside it, don't batch tests for later.
- **Small commits.** One strategy (or one explicitly-logged skip) per commit. Commit
  message: `strategy: <name> (Tier A/B)` or `strategy: skip <name> (Tier C, reason)`.

## 2. The queue

Source: paperswithbacktest/awesome-systematic-trading, Equities section (filtered from
bonds/commodities/currencies/crypto strategies, which don't fit Crade's NSE-equities scope).
Triaged against what `lib/market-data/` actually returns today: OHLCV history, live quote,
and (unreliable) P/E / market cap / dividend yield fundamentals — no EPS, book value,
options data, short interest, filings text, ESG scores, or analyst estimates.

### Tier A — implement directly, price/volume/fundamentals-you-have only

Work top to bottom; these need nothing beyond what Crade already fetches.

1. Trend-following Effect in Stocks
2. 52-Week High Effect in Stocks
3. Momentum Factor Effect in Stocks
4. Consistent Momentum Strategy
5. Short Term Reversal Effect in Stocks (weekly)
6. Low Volatility Factor Effect in Stocks (cross-sectional, NIFTY_50)
7. Betting Against Beta Factor in Stocks (beta vs. index from price history)
8. Size Factor — Small-Cap Premium (uses `marketCap` from fundamentals)
9. Sector Momentum — Rotational System (uses the `sector` field already in `universe.ts`)
10. Turn-of-the-Month in Equity Indexes (calendar + index price)
11. Payday Anomaly (calendar + price)
12. January Barometer (calendar + index price)
13. 12-Month Cycle in Cross-Section of Stock Returns
14. Market Sentiment and an Overnight Anomaly (overnight vs. intraday return split)
15. Pairs Trading with Stocks (cointegrated pairs within NIFTY_50)
16. Residual Momentum Factor (momentum after regressing out market beta)
17. Momentum and Reversal Combined with Volatility Effect in Stocks
18. Combining Smart Factors Momentum and Market Portfolio (composite of #3/#6/#9)

### Tier B — implementable only as a flagged approximation

Build these, but the strategy card / backtest result UI must visibly label them as
approximated (e.g. a small "proxy" badge) — don't let them look identical to Tier A.

19. Value (Book-to-Market) Factor → proxy with inverse P/E + dividend yield from
    screener-in (no book value available); label clearly as a P/E-based value proxy.
20. Momentum Factor and Style Rotation Effect → split value/growth using the same P/E
    proxy as #19.
21. Option-Expiration Week Effect → use NSE's public monthly F&O expiry calendar (dates
    only) as the calendar signal; no options pricing/volume involved or implied.
22. Crude Oil Predicts Equity Returns → cross-asset signal from a commodity ticker via
    the existing yahoo-free provider (e.g. `CL=F`); verify it's actually reachable before
    building on it — don't assume, test the fetch first per `providers/yahoo-free.ts`'s
    documented reliability caveats.

### Tier C — do not implement; log and skip

Data these need doesn't exist in Crade's providers today. Log each with the specific gap:

- Asset Growth Effect / Momentum Factor Combined with Asset Growth Effect (needs balance-sheet asset data)
- Accrual Anomaly / Earnings Quality Factor / ROA Effect within Stocks (needs detailed financial-statement line items)
- R&D Expenditures and Stock Returns (needs R&D spend)
- Earnings Announcement Premium / Reversal During Earnings-Announcements (needs earnings dates + surprise data)
- Short Interest Effect (needs short-interest data; not published free for NSE)
- Combining Fundamental FSCORE and Equity Short-Term Reversals (needs Piotroski F-Score inputs)
- How to Use Lexical Density of Company Filings (needs filings full text)
- Synthetic Lending Rates Predict Subsequent Market Return (needs securities-lending data)
- Momentum in Mutual Fund Returns (needs mutual fund holdings data)
- ESG Factor Momentum Strategy (needs ESG scores)
- Volatility Risk Premium Effect / Dispersion Trading (need options/implied-vol data)
- Value Factor — CAPE Effect within Countries / Betting Against Beta in International Equities (cross-country strategies; out of scope for a single-market app)
- Pairs Trading with Country ETFs / Soccer Clubs' Stocks Arbitrage (universe doesn't apply to NIFTY_50 single-stock scope)

## 3. Per-iteration protocol

For the next un-started item in the queue (Tier A first, then B; skip-and-log Tier C):

1. **Restate the strategy** in 2–3 sentences from the paper/description above — what
   signal, what direction, what rebalance cadence.
2. **Check data feasibility** against `lib/market-data/types.ts` and
   `lib/screener/universe.ts` before writing any code. If it turns out to need something
   not actually available, downgrade it to Tier C now, log it, and move on — don't force it.
3. **Implement the signal** as a pure function first (inputs: price/volume/fundamentals
   arrays; output: position weights or buy/sell signal), unit-testable without I/O.
4. **Wire it into `STRATEGIES`** in `lib/backtest/strategies.ts`, following the existing
   shape used by current entries.
5. **Add any new indicator** it needs to `lib/backtest/indicators.ts` if the primitive
   (e.g. rolling beta, cross-sectional rank) doesn't exist yet — check first, don't
   duplicate `sma`/`rsi`/rolling-high-low if an equivalent already exists.
6. **Write the test** next to the existing backtest tests, covering at minimum: a basic
   signal-correctness case and one edge case (insufficient history, missing fundamentals).
7. **Run `npm test` and `npx tsc --noEmit`.** Both must be clean.
8. **Manually sanity-check one backtest run** against a real NIFTY_50 symbol and glance at
   whether the output is directionally plausible (not a rigorous validation — just a
   smell test that it isn't inverted or off by a rebalance period).
9. **Commit** with the message format from Section 1.
10. **Append one line** to `docs/strategy-library-log.md`: strategy name, tier, commit
    hash, and (for Tier B) the specific approximation made or (for Tier C) the specific
    data gap.
11. Move to the next queue item.

## 4. Stopping conditions

Stop and report back to the user (don't keep going) if:

- You hit three consecutive Tier C skips in a row — that's a signal the remaining queue
  may need re-triaging rather than mechanical skipping.
- A test fails twice in a row for the same strategy after genuine debugging attempts —
  flag it as blocked rather than committing something broken or quietly weakening the test.
- You reach the end of Tier A and B.
- You're about to touch `lib/market-data/`'s provider chain itself (adding a new provider,
  changing fallback order) — that's an architectural change this loop shouldn't make
  unsupervised; surface it as a recommendation instead.

## 5. End-of-run report

When stopping (for any reason above), summarize: how many strategies shipped (Tier A/B
split), how many skipped (with the one-line reason each), and the current state of
`docs/strategy-library-log.md`. Don't just say "done" — list what's actually in
`STRATEGIES` now versus the queue.
