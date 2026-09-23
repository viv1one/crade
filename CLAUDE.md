# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Crade is a personal research-and-alerts PWA for Indian equities: real email/password accounts,
watchlists, an AI chat layer (grounded in real price data) that explains moves or summarizes a stock,
price/RSI/volume alerts that push a browser notification when triggered, strategy backtesting, and a
**paper-trading** portfolio for practicing buy/sell decisions with fake money. It is explicitly **not**
a real-money trading system — there is no broker integration and no order routing. The user's actual
broker (Groww) is a separate app entirely; Crade's "Buy"/"Sell" only ever simulate a fill at the last
fetched quote. Real order placement is a deliberately deferred, much heavier compliance surface (SEBI's
algo-trading framework became mandatory April 1, 2026 — see `docs/plan.md` §7 before ever wiring up an
actual broker API).

The original product plan (tech-stack rationale, MongoDB schema, market-data licensing constraints,
phased roadmap) lives in `docs/plan.md`. Read it before making architectural decisions — this file
covers only what the plan doesn't: how the code that now exists is actually organized.

## Commands

- `npm run dev` — start dev server (Turbopack) at http://localhost:3000
- `npm run build` — production build (Turbopack)
- `npm start` — run a production build
- `npm run lint` — ESLint (flat config in `eslint.config.mjs`, extends `next/core-web-vitals` + `next/typescript`)
- `npx tsc --noEmit` — type-check without emitting (no separate `typecheck` script yet)
- `npm test` — runs `vitest run` (paper-trading, market-data fallback, backtest engine/indicators/ML, event engine)
- `npx vitest run lib/paper-trading/store.test.ts -t "rejects a buy"` — run a single test by name

Requires a populated `.env.local` (see `.env.example`) — at minimum `MONGODB_URI` — before `dev`/`build`
will run without throwing (every API route under `app/api/` touches Mongo via `lib/db`). AI chat
(`app/api/chat`) additionally needs at least one working provider key (`NIM_API_KEY`, `ANTHROPIC_API_KEY`,
or `OPENAI_API_KEY`) — without one, `/api/chat` returns a 502 with a clear error rather than failing
silently, and the chat panel surfaces that error in the UI. Push notifications need `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (a real `mailto:`/`https:` URI — no angle brackets, `web-push`
rejects those) plus `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (same value as `VAPID_PUBLIC_KEY`, browser-exposed).
The alert cron endpoint needs `CRON_SECRET` if you want it to reject unauthenticated callers (see below).
Email alerts need `RESEND_API_KEY` (optionally `RESEND_FROM_EMAIL`) — without one, alerts created with
the email channel just fail to send per-alert rather than breaking anything else (see `lib/email/`).
Optional, dev-only: `pip install -r requirements.txt` (a local `python3` with `jugaad-data` on its
`PATH`) enables the `jugaad-data` market-data provider — see `lib/market-data/` below. Nothing else in
the app needs Python; skip this and everything still works off the existing free HTTP providers.

## Architecture

Single Next.js 15 App Router deployable — no separate backend. Server work happens in server
components, API routes, and server actions under `app/`.

### `lib/` — the provider-agnostic core

The plan's central architectural idea is that **market data and AI are both swappable providers behind
a stable interface**, so the free/prototype backend can be replaced with a licensed one without
touching call sites.

- **`lib/db/`**
  - `mongodb.ts` — singleton `MongoClient` promise (`clientPromise`), cached on `global` in dev to
    survive HMR reloads. Import this, never construct a new client elsewhere.
  - `collections.ts` — typed collection accessors (`getCollections()`) and the document interfaces for
    every Mongo collection: `users`, `sessions`, `watchlists`, `paper_portfolios`, `alerts`, `price_cache`,
    `backtests`, `portfolio_backtests`, `ai_sessions`, `push_subscriptions`, `journal_entries`.
    `watchlists`, `paper_portfolios`, `backtests`, and `portfolio_backtests` are all keyed by `ownerId:
    string`, which is `User._id.toString()`; `alerts`, `ai_sessions`, and `push_subscriptions` are keyed
    by `userId: ObjectId` directly. `price_cache.fetchedAt` is meant to be a **TTL-indexed** field
    (create that index in Atlas / a migration script — it's not created automatically here) so cached
    candles expire instead of growing forever; `lib/market-data/cache.ts` also enforces a 5-minute TTL in
    application code as a stopgap.

- **`lib/auth/`** — real auth, hand-rolled rather than a library (Auth.js v5 was considered but skipped
  to avoid its beta-version and Edge-runtime friction; this app's existing patterns are already
  lightweight/hand-rolled, e.g. the old device-id cookie this replaced).
  - `password.ts` — `hashPassword`/`verifyPassword` using Node's built-in `crypto.scrypt` (no native
    deps, unlike bcrypt). Stored as `"saltHex:hashHex"`.
  - `session.ts` — `createSession(userId)` inserts a `sessions` doc (`tokenHash` = SHA-256 of a random
    32-byte token; the raw token is what actually lives in the `crade_session` httpOnly cookie, so a DB
    read alone can't be replayed as a valid cookie) and sets the cookie. `getCurrentUser()` returns
    `SessionUser | null`; `requireUser()` throws `UnauthorizedError` instead. Both only work from Route
    Handlers / Server Actions (`cookies()` is read-only in Server Components).
  - `api.ts` — `requireUserOrResponse()`: the Route Handler idiom used everywhere per-user data is
    touched — `const user = await requireUserOrResponse(); if (user instanceof NextResponse) return
    user;` — turns "not logged in" into a 401 in one line instead of a repeated try/catch per route.
  - `app/api/auth/{signup,login,logout,me}/route.ts` + `app/login/page.tsx` + `app/signup/page.tsx` +
    `app/account-nav.tsx` (email + logout, shown in the main page nav).
  - `proxy.ts` (project root — renamed from `middleware.ts`/`export function middleware` in the
    Next.js 16 upgrade; same file, same `matcher`) redirects to `/login` when the `crade_session` cookie
    is *absent*. This is a fast UX redirect only, **not** the authoritative check — it never touches
    Mongo, so an expired/invalid-but-present cookie still gets past it. `requireUserOrResponse()` in
    each Route Handler is what actually enforces access control. API routes are excluded from the
    matcher; they gate themselves individually (`/api/quote`, `/api/history` intentionally stay public —
    stateless market-data lookups, no per-user data involved).

- **`lib/market-data/`**
  - `types.ts` — the `MarketDataProvider` interface: `getQuote`, `getHistorical`, `getFundamentals`.
    Any new data source (Kite Connect, a licensed vendor) implements this interface.
  - `providers/jugaad-data.ts` — wraps the `jugaad-data` Python library (`scripts/jugaad_bridge.py`,
    shelled out to via `node:child_process`) against NSE's current site. Verified live from a dev
    environment to actually get through where `nse-free.ts`'s own hand-rolled session-cookie handling
    (below) was observed blocked: quotes, historical bars, and real P/E + market cap (straight from
    NSE's own `secInfo`/`tradeInfo` response fields, no HTML scrape) all worked in ~1-2s. Listed first
    in the fallback chain by data quality, not availability — this only works where a local `python3`
    has `jugaad-data` installed (`pip install -r requirements.txt`, optional, dev-only; see Commands
    above), which Vercel's Node serverless functions don't have. In production the first call fails
    fast (`ENOENT`) and `withFallback()` just moves on to the next provider — nothing here needs an
    explicit prod/dev branch, the fallback chain already handles "not available" for free. A sibling
    Node-only package (`nse-bse-api`) was evaluated as a production-viable alternative but rejected:
    its quote endpoint hit the same NSE block `nse-free.ts` already documents (no improvement there),
    and its one working method (historical data) came with an unfixable high-severity transitive
    vulnerability (`adm-zip`, `npm audit` `fixAvailable: false`) for a narrow, non-essential gain — not
    worth the standing supply-chain risk.
  - `providers/yahoo-free.ts` — unauthenticated Yahoo Finance chart-API. **Prototyping only** — NSE/Yahoo
    terms don't permit redistributing this data to other users. Do not build multi-user features on top
    of it without swapping in a licensed provider first. Uses `fetch-with-retry.ts`
    (`fetchWithRetry`) instead of raw `fetch`: retries 2x with short exponential backoff, but *only* on
    `429`/network errors — anything else (404, bad response shape) fails immediately since retrying
    those just wastes time. This meaningfully helps `getQuote`/`getHistorical` (the `chart` endpoint),
    which has been observed 429-ing in short, recoverable bursts. `getFundamentals` (the separate
    `quoteSummary` endpoint) has been observed under a *harder*, longer-lived block that 2 retries don't
    clear — confirmed independent of this app's traffic (a single manual curl to the bare endpoint fails
    the same way). Treat fundamentals (P/E, market cap, dividend yield, EPS) as the least reliable data
    this provider returns; callers must degrade gracefully when they're missing rather than failing
    outright (see `lib/screener/fetch.ts`).
  - `providers/nse-free.ts` — NSE's own JSON endpoints as a fallback, fronted by an anti-bot cookie
    check (`getSessionCookie()`). Also observed fully blocked at Akamai's edge (`403` on the homepage
    itself, before a cookie can even be obtained) — this looks like a straight IP-range block on NSE's
    side (common for cloud/datacenter egress IPs) rather than something retries fix; may behave
    differently once deployed off a sandbox IP, but don't assume it works without checking.
  - `providers/screener-in.ts` — scrapes screener.in's public company page for `getFundamentals` only
    (`peRatio`, `marketCap`, `dividendYield`; no EPS). Added because Yahoo's fundamentals endpoint was
    the least reliable data source in the app (see above) — this was reachable when Yahoo/NSE weren't,
    confirmed by live-testing all three back to back. Same "not licensed for redistribution, scraped
    HTML not a stable contract" caveat as the other two free providers — screener.in can change its
    page structure without notice, and `extractRatio()`'s label-then-nearest-number matching is
    intentionally loose (handles the site's irregular internal whitespace) but has no way to know if
    the page structure changes entirely; if fundamentals silently stop appearing again, check this
    first, not just Yahoo/NSE. `getQuote`/`getHistorical` reject immediately (no network call) since
    this provider only covers fundamentals — see `fallback-provider.ts` below for why it's still safe
    to list first in the chain.
  - `fallback-provider.ts` — `withFallback([jugaad-data, screener-in, yahoo, nse])`: tries each
    provider in order per-method independently (a quote can succeed on yahoo while fundamentals come
    from screener-in). jugaad-data is listed first per above (dev-only, best when available).
    screener-in is listed next specifically to prioritize it for `getFundamentals` (currently the most
    reliable free HTTP source for that one method) — this costs nothing for `getQuote`/`getHistorical`
    since its versions of those reject immediately, so the chain moves on to yahoo essentially
    instantly for everything except fundamentals.
  - `cache.ts` / `cached-provider.ts` — two independent cache wrappers: `withHistoricalCache()` for
    `getHistorical` (5-minute TTL, `price_cache` collection) and `withFundamentalsCache()` for
    `getFundamentals` (6-hour TTL, `fundamentals_cache` collection — much longer, since P/E/market cap
    move slowly and the endpoint backing them is the fragile one; a failed fetch is never cached, so
    the very next call after the endpoint recovers repopulates it). `getQuote` is deliberately **not**
    cached at all as a primary path — paper-trading fills use the live quote price, so a stale cached
    quote presented as fresh would mean a simulated trade at a misleading price.
  - `coalesce.ts` — `withCoalescing()`: dedupes identical *concurrent* calls (same symbol/args) onto
    one in-flight promise, per-process only, not a durable cache. Free reliability win — e.g. the
    dashboard's watchlist and market-movers widgets both requesting the same symbol's quote at page
    load become one network call. Does not cache a rejection; a failed call doesn't poison the next one
    (see `coalesce.test.ts`).
  - `stale-fallback.ts` — `withStaleQuoteFallback()`: the one exception to "`getQuote` is never
    cached." On a **successful** live quote, stashes it as "last known good" (fire-and-forget, doesn't
    block the response). On a **failed** live fetch, falls back to that last-known quote instead of a
    hard error — but marks it `stale: true` (see `types.ts`) and caps it at 24h old (older than that,
    it's not used and the original error surfaces instead). This is read-only resilience for an
    outage, not a way to make degraded data look fresh: `app/watchlist.tsx` checks `quote.stale` and
    disables Buy/Sell on that row rather than letting a trade price off it silently.
  - `index.ts` — exports `marketData`, the fully-composed provider, outer to inner: `withCoalescing(
    withFundamentalsCache(withHistoricalCache(withStaleQuoteFallback(withFallback([jugaad-data,
    screener-in, yahoo, nse])))))`. Swap/extend the chain here, not at call sites.

- **`lib/ai/`**
  - `types.ts` — `ChatMessage`, `ChatTask` (`explain_move` | `summarize` | `chat` | `digest`),
    `AiProviderConfig`.
  - `router.ts` — `chat(messages, { task })`. All providers (NVIDIA NIM, Anthropic, OpenAI) are called
    through OpenAI-compatible `/chat/completions` endpoints, so adding a provider is a base-URL +
    model-name entry in the `providers` map. Each `ChatTask` has its own fallback order in
    `chainByTask` — cost/latency-tolerant tasks (`digest`, `summarize`) try NIM first; user-facing chat
    tries the paid tier first. Providers without an API key configured are skipped, not errored — but if
    *every* configured key fails or none are configured, `chat()` throws and `app/api/chat/route.ts`
    turns that into a 502 with the underlying error message.
  - `app/api/chat/route.ts` + `app/chat-panel.tsx` — free-text symbol field, a `ChatTask` selector, and
    message history. History is **persisted per (user, symbol)** to `ai_sessions` — one growing
    document per symbol you've chatted about (empty-string symbol = the general/no-symbol bucket), not
    one-doc-per-conversation. `app/api/chat/history/route.ts` (`GET ?symbol=`) loads it; the chat panel
    loads on mount and again whenever the symbol field is blurred (not on every keystroke). The client
    still sends the full running `messages` array on each turn (needed for LLM context) and the server
    just persists whatever array results after appending the assistant reply — the client remains the
    source of truth for a single in-flight conversation, Mongo is just where it's saved across reloads.
  - `lib/ai/context.ts` — `buildMarketContext(symbol)` fetches a real quote + 3-month historical
    candles, fundamentals (P/E, market cap, EPS, dividend yield), plus recent news headlines
    (`lib/news/`, see below), and formats them into the system prompt so the model reasons from actual
    data instead of guessing — the system prompt explicitly tells it to weigh trend + fundamentals +
    headlines together for growth/strategy questions, not just price movement alone. Fundamentals are
    the most fragile field on this provider (see `lib/market-data/` below) so they're included only
    when actually available; when not, the model has been verified to say so plainly ("I don't have
    the current P/E ratio...") rather than inventing a number — same discipline as the news section.
    Chat responses render through `app/markdown-content.tsx` (`react-markdown` + app-styled
    components), not raw text — model output routinely includes markdown (bold, lists) that showed as
    literal `**`/`-` characters before this. Reused for every place AI text is displayed: the main
    chat, `/help`'s chat, the backtest AI review, and the market digest — if you add another AI-output
    render point, use this component rather than dropping `{result.content}` directly into JSX.
    **Fabrication is a real,
    observed risk, not a theoretical one** — even with an explicit "say you don't know" instruction,
    `meta/llama-3.1-8b-instruct` was caught inventing plausible-sounding fake headlines (complete with
    sources and dates) when the underlying data fetch had silently failed and no context was passed at
    all. Two things fixed it: (1) when `buildMarketContext` returns `null` because the data source
    failed outright for a requested symbol, `app/api/chat/route.ts` now says so *explicitly and
    forcefully* in the system prompt ("no data could be retrieved... do not state or imply any price,
    trend, headline, or fact") rather than silently falling back to the bare system prompt and leaving
    a gap for the model to fill in; (2) the base system prompt's anti-fabrication line was strengthened
    from a soft suggestion to "a plausible-sounding guess is not an acceptable substitute." If you touch
    this flow again, re-test the failure path specifically (a symbol whose `getQuote`/`getHistorical`
    both fail — not just the happy path), since that's exactly where this broke last time.

- **`lib/news/`** — `getNews(query)` (cached, `news_cache`, 30-min TTL) backed by `google-news.ts`,
  which scrapes Google News RSS (free, keyless, unofficial — no stable contract, Google can change the
  feed shape without notice). Chosen specifically because, unlike Yahoo/NSE (see `lib/market-data/`
  above), it has not been observed rate-limited or IP-blocked from this app's environment. Only
  headlines/source/date are extracted, never full article text — `buildMarketContext` passes that
  through to the model with an explicit "titles only, don't claim to know more than a headline states"
  instruction. `newsQueryFor(symbol)` in `context.ts` resolves a company name via `NIFTY_50` for a more
  relevant search query, falling back to the bare ticker for symbols outside that list.

- **`lib/push/`**
  - `send.ts` — `sendPushNotification(subscription, payload)`, thin wrapper around `web-push` configured
    from `VAPID_*` env vars.
  - `subscribe-client.ts` (client-only) + `app/push-subscribe-button.tsx` — `enablePushNotifications()`
    requests browser notification permission, subscribes via the service worker's `PushManager`, and
    POSTs the subscription to `app/api/push/subscribe/route.ts`, which upserts it into
    `push_subscriptions` keyed by `userId`. Shown on `/alerts`.
  - `app/api/cron/evaluate-alerts/route.ts` — the job that actually triggers `sendPushNotification`.
    Loads all `status: "active"` alerts, groups by symbol to avoid redundant fetches, evaluates each
    condition (`price_above`/`price_below` against the live quote; `rsi_below` via
    `lib/backtest/indicators.ts`'s `rsi()` over 3 months of daily bars; `volume_spike` as today's volume
    vs. the 20-day average), and on trigger sets `status: "triggered"` + `lastTriggeredAt` and pushes to
    every subscription for that user (pruning subscriptions that come back 404/410 — expired/unregistered
    endpoints). The other channel — `lib/email/send.ts`'s `sendEmailNotification`, a thin wrapper
    around the `resend` SDK configured from `RESEND_API_KEY`/`RESEND_FROM_EMAIL` (defaults to Resend's
    own sandbox sender, no domain verification needed) — is tried for `channel: "email"` alerts,
    looking up the recipient via `users.findOne` (there's no separate email-subscriptions collection,
    unlike push). Wrapped in its own try/catch (`notifyUserByEmail`) so a bounce or unset API key
    degrades that one alert's delivery rather than 500ing the whole evaluation run. Chosen at
    alert-creation time via `alerts-panel.tsx`'s channel select, defaulting to push. Gated by
    `CRON_SECRET` (`Authorization: Bearer <secret>`) when that env var is set.
    Scheduled via `.github/workflows/evaluate-alerts.yml` (GitHub Actions, `*/5 * * * *`) rather than
    Vercel's own `crons` in `vercel.json` — Vercel Hobby-tier projects reject any cron schedule more
    frequent than once/day, and this endpoint needs 5-minute granularity to be useful, so a GitHub
    Actions schedule pings it instead, sending the same `Authorization: Bearer` header Vercel Cron
    would have. Needs two GitHub repo secrets (Settings > Secrets and variables > Actions):
    `CRON_SECRET` (same value as the Vercel env var) and `CRADE_DEPLOYMENT_URL` (the deployed origin,
    no trailing slash). If the project ever moves to Vercel Pro, `vercel.json`'s `crons` config could
    replace this workflow — not required, just an option. Locally, hit the route manually with the
    same header to test. A "triggered" alert stays that way until the user flips it back to
    active/paused from `app/alerts/alerts-panel.tsx` (`PATCH app/api/alerts/[id]/route.ts`).
  - `app/api/alerts/route.ts` (list/create) + `app/api/alerts/[id]/route.ts` (pause/resume/delete) —
    plain CRUD over the `alerts` collection, `userId`-scoped.

- **`lib/paper-trading/`**
  - `types.ts` / `store.ts` — pure, framework-free simulation logic: `Holding`, `Trade`,
    `PortfolioState`, and `applyBuy`/`applySell`, which validate cash/quantity and update average cost
    basis and realized P&L. No I/O — unit tested directly in `store.test.ts` (`npm test`).
  - `app/api/portfolio/route.ts` is the only caller of `applyBuy`/`applySell` — it's **server-
    authoritative**: the client posts an intent (`{ action: "buy"|"sell"|"reset", symbol, qty, price }`),
    never a pre-computed state, so the server always loads the current `paper_portfolios` doc, applies
    the pure function, and persists the result. This avoids two concurrent trades racing on
    client-computed state. `app/use-paper-portfolio.ts` is a thin client hook around this API — no
    business logic lives there anymore.
  - **`equityCurve`** (`PaperPortfolio.equityCurve`, optional — `lib/backtest/types.ts`'s `EquityPoint`
    shape, reused as-is) gives the Portfolio page a real performance chart via the *same*
    `EquityChart`/`useBenchmarkCurve` components `app/backtest/` already built, with zero changes to
    either — deliberately kept out of `PortfolioState`/`store.ts` itself (those stay pure/I-O-free;
    computing a point needs live quotes for every currently-held symbol, not just the one traded, which
    only the route can do). Two independent sources feed the same array, both idempotent-safe to run
    any number of times:
    - **Per-trade** (in `app/api/portfolio/route.ts`'s POST): after every buy/sell, `markToMarket()`
      fetches a live quote for each held symbol (degrading to `avgCost` on a failed fetch, same rule
      `app/portfolio.tsx`'s own client-side display already follows) and appends one point. A brand-new
      user's very first GET is pre-seeded with a single starting point (equity = starting cash) so their
      first trade already produces a real 2-point line, not a single dot.
    - **Daily mark-to-market** (`app/api/cron/snapshot-portfolios/route.ts`, `CRON_SECRET`-gated same as
      `evaluate-alerts`, scheduled via `.github/workflows/snapshot-portfolios.yml` at 10:15 UTC / 15:45
      IST on trading days, reusing the same `CRON_SECRET`/`CRADE_DEPLOYMENT_URL` secrets — no new ones
      needed): fills in the gaps between trades so a buy-and-hold portfolio still shows real day-to-day
      drift instead of a flat line. Batches quote fetches by symbol across *every* user's portfolio in
      one pass (same discipline `evaluate-alerts` already uses), skips cash-only portfolios (nothing to
      mark), and is idempotent per **IST calendar day** — a portfolio whose last point (from a trade or
      an earlier run) is already dated today gets skipped, so a manual re-run or a retried schedule tick
      never double-snapshots. This means the curve is deliberately *not* a smooth line: it moves at
      trade time and once more per trading day, not continuously.
  - `app/api/watchlist/route.ts` / `app/use-watchlist.ts` follow the same shape for the symbol list
    (full-array GET/POST, keyed by the same `ownerId`).
  - `app/watchlist.tsx` auto-fetches each symbol's quote the first time it appears (initial load or
    just added) via a `useEffect` gated by a `fetchedRef` Set, rather than requiring a manual click —
    the per-row button (labeled "Refresh") is for re-fetching, not the only way to get a quote at all
    anymore. If you add a new way symbols can enter the list, make sure it still funnels through this
    effect (keyed on the `symbols` array) rather than needing its own fetch call.

- **`lib/portfolio/`** — on-demand AI diagnostics, shared between the paper-trading portfolio
  (below) and the real-holdings tracker (`app/holdings/`, next section) — added because neither
  had a feature that looked at a user's *current holdings* (only raw P&L was ever shown).
  `diagnostics.ts` is pure/I/O-free (mirrors `lib/paper-trading/store.ts`'s convention):
  `computePortfolioDiagnostics()` turns `{ holdings, cash, prices, bars, fundamentals }` into
  allocation %, concentration (top-holding %, top-3 %, Herfindahl index), sector exposure (via
  `NIFTY_50`'s `sector` field, unmatched symbols bucketed as `"Other"`), and per-holding trailing
  6-month return / 60-day volatility — reusing `lib/backtest/indicators.ts`'s existing
  `trailingReturn`/`volatility` directly rather than duplicating that math. Its holdings param is
  typed `Record<string, PositionInput>` (`{qty, avgCost}`), a local type — **not** an import of
  `lib/paper-trading/types.ts`'s `Holding` — because real holdings and paper trading are
  deliberately kept logically separate elsewhere in this codebase (see `app/api/holdings/
  route.ts`'s comment on reimplementing weighted-average-cost rather than importing
  `lib/paper-trading/store.ts`'s version); `Holding` and `RealHolding` are both structurally
  assignable to `PositionInput`, so nothing about either feature needed to change. `cash` is
  `number | undefined` for the same reason — the real-holdings tracker has no cash concept at all,
  and `computePortfolioDiagnostics`/`formatDiagnosticsForPrompt` render "not tracked" rather than
  a misleading 0% when it's absent, never coercing a missing concept into a real-looking number.
  The **default** diagnostics path deliberately does not build a `RankContext` or call into
  `lib/backtest/cross-sectional-strategies.ts`'s `ScoreFn`s (rankings need the full NIFTY_50
  universe, `sectorMomentumScore` especially — fetching ~50 symbols to describe a handful of
  holdings isn't proportionate for every click). `factor-tilt.ts` is the **opt-in "deep analysis"**
  exception: `computeFactorTilts()` *does* build one `RankContext` covering the full universe and
  calls four existing `ScoreFn`s (`momentum_factor`, `low_volatility`, `sector_momentum`,
  `value_proxy` — no changes to that file, `getScoreFn` was already exported for exactly this kind
  of standalone lookup) to report each held symbol's **percentile rank** within the whole NIFTY 50
  distribution — gated behind an explicit UI checkbox precisely because it's meaningfully more
  expensive. `fetch.ts` has two I/O functions: `fetchHoldingsData()` (small worker pool, concurrency
  5, same shape as `lib/screener/fetch.ts`, fetches quote/history/fundamentals per *held* symbol
  only — degrading the same way `fetchScreenerData` does, a missing quote drops that symbol's
  price/bars, missing fundamentals leave fields `undefined`, never zero) and `fetchUniverseData()`
  (the same pool shape but over *all* of `NIFTY_50`, bars+fundamentals only, no quote — only ever
  called for the deep-analysis path, never the default one). Both diagnostics routes
  (`app/api/portfolio/diagnostics/route.ts`, `app/api/holdings/diagnostics/route.ts`) feed the
  formatted text through the `"portfolio_review"` `ChatTask` (`lib/ai/`), each with its own system
  prompt copying the exact anti-prediction discipline already proven in `app/api/screener/
  ai-query/route.ts`: explicitly forbidden from predicting returns or claiming a trade will
  maximize profit, only allowed to describe patterns in the numbers given (percentiles included —
  "relative standing," never a forecast). `app/portfolio-diagnostics.tsx` is the shared on-demand
  panel (same shape as `app/market-digest.tsx`), parameterized by an `endpoint` prop and an
  `allowDeepAnalysis` prop (only the real-holdings call site sets it — paper-trading's endpoint
  doesn't understand `{ deep: true }`, so its checkbox never renders). This exists to close a real
  gap without crossing into prescriptive rebalancing advice — exactly the "confidence about future
  returns" framing the screener AI-query route (and SEBI's Investment Adviser rules, `docs/plan.md`
  §7) already rule out elsewhere in this codebase.

### `app/holdings/` — manually-tracked real holdings, separate from paper trading

Lets a user record investments they already own (bought via their actual broker, e.g. Groww) for
research purposes only — no fake cash, no simulated fills, not the same thing as the home page's
`Portfolio`/`lib/paper-trading/` at all. `realHoldings` (`lib/db/collections.ts`'s `RealHolding`:
`{symbol, qty, avgCost, note?, purchasedAt?}`, `userId`-scoped) is a flat list, not keyed by a
single portfolio doc the way `paper_portfolios` is — `app/api/holdings/route.ts`'s `POST` merges
into an existing row by symbol (qty accumulates, `avgCost` becomes the new weighted average,
`purchasedAt` takes the earlier of the two dates) rather than creating duplicates, deliberately
reimplementing that averaging math instead of importing `lib/paper-trading/store.ts`'s version —
see that route's own comment on why the two features stay logically separate. `lib/holdings-
cagr.ts`'s `annualizedReturnPct()` is the one thing specific to this feature (paper trading has no
notion of "how long has this been held," since a simulated buy is always "now"). `app/holdings/
holdings-panel.tsx` supports both one-at-a-time and bulk add (`lib/holdings-bulk-parse.ts`, one
holding per line).

Three AI/convenience additions layer on top of the manual list, using data from `lib/portfolio/`
(see above) and the existing `/api/alerts` — none of them required any change to the core
add/edit/remove flow:
- **Diagnostics** — `app/api/holdings/diagnostics/route.ts` + the shared
  `<PortfolioDiagnostics endpoint="/api/holdings/diagnostics" allowDeepAnalysis />`.
- **Diversification suggestions** — `app/api/holdings/diversify/route.ts` +
  `app/holdings-diversify.tsx`: computes the portfolio's current sector exposure and which of
  `lib/screener/universe.ts`'s `SECTORS` have zero exposure, loads the same cached
  `screener_snapshots` doc `app/api/digest/route.ts` reads (same freshness gate, so this costs
  nothing beyond one chat call), and asks the model to suggest up to 5 real NIFTY 50 symbols
  (excluding ones already held) that would fill sector gaps — same anti-prediction, "pick only
  from the real table, exclude fabricated tickers" contract `ai-query` already uses.
  `lib/screener/format.ts`'s `formatScreenerRowsForPrompt()` is a small extraction from `ai-query`'s
  formerly-private CSV formatter, now shared verbatim by both routes rather than drifting into two
  copies.
- **Quick alert-from-holding** — a 🔔 button per holding row in `holdings-panel.tsx` that expands
  an inline mini-form (condition type + value, pre-filled 10% under the live price or `avgCost`)
  and posts straight to the existing `POST /api/alerts` — no backend changes, purely a shortcut so
  creating an alert doesn't require a separate trip to `/alerts` and retyping the symbol.
  `ConditionType`/`CONDITION_LABELS` moved to `lib/alerts/labels.ts` since this UI and
  `app/alerts/alerts-panel.tsx` both need the identical map.

### `app/journal/` — a personal trade journal, `docs/plan.md`'s V2 "shadow strategy" idea

Not a trade log (see `lib/paper-trading/`/`app/holdings/` for actual positions) — this is a place to
write down *why* before acting (or before deciding not to), then close the loop later. `JournalEntry`
(`lib/db/collections.ts`, `journal_entries`, `userId`-scoped like `RealHolding`) is
`{ symbol, action: "buy" | "sell" | "watch", reasoning, price?, outcome?, outcomeAt?, createdAt }`.
`app/api/journal/route.ts` (list/create) + `app/api/journal/[id]/route.ts` mirror
`app/api/holdings/`'s exact CRUD shape; the `PATCH` only ever sets `outcome`/`outcomeAt` — the
original symbol/action/reasoning are left as a record of what was actually thought at the time, not
editable after the fact. `app/api/journal/review/route.ts` is on-demand (a button, like
`MarketDigest`/`PortfolioDiagnostics`, not auto-run) and reuses the same anti-prediction contract as
`ai-query`/`holdings/diversify`: it describes patterns across the user's own entries (recurring
reasoning themes, whether stated theses tended to match recorded outcomes) and is explicitly told
never to predict returns or invent an entry not in the data given — new `"journal_review"` `ChatTask`
(`lib/ai/types.ts`/`router.ts`, same cost-tolerant chain as `portfolio_review`) and
`JOURNAL_REVIEW_NOT_ADVICE` disclaimer.

### Sharing (`shares` collection) — read-only peer invites, not a team/org model

Per `docs/enterprise-plan.md` Phase 1: any user can invite another person (by email) to view their
watchlist read-only. Deliberately **not** an organization/tenancy system — no shared workspace, no
roles, just per-resource, per-invitee grants. Currently only `resourceType: "watchlist"` exists;
`ShareResourceType` in `lib/db/collections.ts` is where a second resource type (e.g. `"alerts"`) would
get added.

- **Matched by email, not a userId link.** A `Share` doc only has `invitedEmail` — no acceptance step,
  no dependency on the invitee having an account yet at invite time. `app/api/shares/shared-with-me`
  resolves matches by comparing the *current* logged-in user's email against `invitedEmail` at read
  time. This means changing your account email changes what's shared with you — acceptable for now,
  but a real gap if email changes become common.
- **`app/api/shared/[ownerId]/watchlist/route.ts` is the one and only authoritative permission
  check** — it looks up a matching `Share` before returning anything, 403s otherwise. There's no other
  route that can reach another user's watchlist; if you add a new way to view shared data, it must go
  through an equivalent check, not assume the frontend won't render it.
  - Verified live: an invited viewer (matched by email) gets `200` with real data; an uninvited third
    account gets `403`; revoking the share (`DELETE app/api/shares/[id]/route.ts`) immediately cuts off
    access on the next request — there's no caching of the permission check.
- **`app/share-watchlist.tsx`** (on the home page, collapsed by default) — invite/list/revoke, owner's
  view. **`app/shared/page.tsx`** — "shared with me" list. **`app/shared/[ownerId]/watchlist/page.tsx`**
  — the actual read-only view, still fetches live quotes per symbol (via the public `/api/quote`), so a
  viewer's page load adds to the same free-provider request load as the owner's own watchlist would —
  relevant to the rate-limiting risk discussed in `docs/enterprise-plan.md` §1.

### `/help` — app-usage chatbot, deliberately separate from the stock-research chat

`app/api/help-chat/route.ts` is its own route with its own system prompt, not a mode of
`app/api/chat/route.ts`. It only knows a hardcoded feature list (kept in the system prompt itself,
duplicated in prose in `app/help/page.tsx`'s `SECTIONS` — if you add/change a feature, update both)
and is explicitly told to redirect stock-specific questions to the real AI Chat/Screener rather than
attempt them without market-data grounding. No chat history persistence — this doesn't need
`ai_sessions` the way per-symbol research conversations do. One thing worth knowing if you touch the
prompt again: the model initially invented plausible-but-wrong UI element names (a "Create Alert
button" that doesn't exist) when only given a prose description of the flow — fixed by explicitly
telling it not to reference button/field names beyond what's literally listed in the prompt. Same
family of issue as the market-data fabrication bug documented above; small models embellish specifics
that weren't given to them unless told not to, repeatedly, across different features.

### `lib/screener/` — Nifty 50 + all-NSE screener with AI-assisted filtering

- `universe.ts` — `NIFTY_50`: a **hand-curated snapshot** of Nifty 50 constituents
  (symbol/name/sector). Index composition drifts over time — re-verify against NSE's published
  list periodically, don't treat it as live/authoritative. Live check already caught real drift:
  NSE's current EQ-series listing is missing `TATAMOTORS.NS`/`LTIM.NS` under those exact symbols
  (most likely a corporate action/symbol change since this snapshot was curated), which is exactly
  why the union below never just re-exports the generated list.
  `nse-universe.ts` — **GENERATED FILE**, do not hand-edit — `ALL_NSE_STOCKS` (~2,000
  symbol/name pairs, no sector), regenerated via `npm run generate:nse-universe`
  (`scripts/generate-nse-universe.mjs`, which fetches NSE's public bulk equity-listing CSV at
  `nsearchives.nseindia.com/content/equities/EQUITY_L.csv` and filters to `SERIES === "EQ"` —
  normal rolling-settlement equities, excludes `BE`/`BZ` trade-to-trade/surveillance series). Same
  "unofficial, not licensed for redistribution, prototyping only" footing as every other free
  NSE/Yahoo integration here, and the same "may behave differently off this sandbox's egress IP,
  don't assume it works without checking" caveat already given to `nse-free.ts`.
  `ALL_NSE_UNIVERSE` — the actual universe most consumers should use: `NIFTY_50` **unioned** with
  `ALL_NSE_STOCKS` (deduped by symbol, Nifty 50 members keep their real curated sector, everything
  else gets `"Other"` — the same fallback `lib/portfolio/diagnostics.ts`'s `sectorFor()` already
  uses for any symbol outside the curated 50). Built as a union specifically so NSE's live listing
  drifting away from a NIFTY_50 symbol (see above) never silently regresses a consumer that used to
  work — `app/symbol-datalist.tsx` learned this the direct way during development.
- `fetch.ts` — `fetchScreenerData(universe: UniverseStock[])`: a small worker-pool (concurrency 5,
  not `Promise.all`) fetches quote + fundamentals per symbol in the *passed-in* universe. A missing
  quote drops the row; missing fundamentals just leave those fields `undefined` (see the Yahoo
  `getFundamentals` note above — this happens routinely). Deliberately takes the universe as a
  parameter rather than hardcoding one — the only caller that ever passes more than 50 symbols is
  the batched cron route below, never a synchronous request.
- **Two screener universes, two very different refresh strategies** — `app/api/screener/route.ts`:
  - `nifty50` (default, `?universe` omitted): unchanged from before — on-demand, synchronous,
    10-minute TTL in `screener_snapshots`, `?refresh=true` to force. Cheap enough (50 symbols) to
    fetch inside a single request.
  - `all_nse` (`?universe=all_nse`): **read-only from cache**, no synchronous fetch fallback, ever.
    Fetching all ~2,000 symbols inside one request would run well past any reasonable serverless
    timeout and burst-load the free provider in one continuous run — the same failure mode already
    documented for NSE/Yahoo under sustained load. Instead, `app/api/cron/refresh-screener/route.ts`
    (`CRON_SECRET`-gated, same fail-closed check as `evaluate-alerts`) fetches one small slice
    (`?offset=&limit=50`) per call and **merges** those rows into the snapshot by symbol, leaving
    every other symbol's row untouched — so the cache is never empty after the first cycle and
    reads don't need to know a refresh is mid-flight, just a mix of freshnesses.
    `.github/workflows/refresh-screener.yml` calls it with a sequence of offsets, hourly, covering
    the full universe over ~40 short requests per run instead of one giant one — reuses the same
    `CRON_SECRET`/`CRADE_DEPLOYMENT_URL` secrets `evaluate-alerts.yml` already needs, no new
    secrets required. **This workflow can only ever reach a public deployed URL, never
    `localhost`** — so in local dev the `all_nse` cache never fills up on its own, no matter how
    long the dev server runs. Run `npm run seed:screener-local`
    (`scripts/seed-screener-locally.mjs`) once against a running `npm run dev` to manually drive
    the same endpoint through every batch (reads `CRON_SECRET` from `.env.local`, ~2,079 of 2,081
    symbols land successfully — the 2 missing are the same `TATAMOTORS.NS`/`LTIM.NS` drift noted
    above, confirmed live: their quotes aren't fetchable under those tickers either, not just
    absent from the bulk listing). Verified end-to-end: full local run took a genuinely long time
    (tens of minutes, real network latency across ~2,000 sequential-ish requests) — expect that,
    it's not stuck.
  - Both public (no auth) — same reasoning as `/api/quote`/`/api/history`: stateless market data,
    not per-user.
- `app/screener/screener-panel.tsx` — a Nifty 50 / All NSE stocks tab toggle plus manual filters
  (sector, price range, max P/E, sort) and `ai-screener-query.tsx`. The All-NSE tab has no
  "Refresh" button (nothing safe to trigger on demand — see above), just a "Reload cached data"
  button and an "as of" caption instead.
- `app/api/screener/ai-query/route.ts` — natural-language filtering, but **deliberately not** a
  "which stocks will return well, how confident are you" feature: the system prompt explicitly forbids
  claiming confidence about future returns (no model can back that up, and it's the kind of output
  SEBI's Investment Adviser rules are about — see `docs/plan.md` §7 and the "no real trading" framing at
  the top of this file). Instead it translates the question into concrete criteria against the real data
  the client already has loaded, and every returned symbol is checked against that same dataset before
  being shown — a hallucinated ticker not in the table gets filtered out, not displayed. Requires auth
  (it's an AI-cost-incurring action, same as chat). `format.ts`'s `formatScreenerRowsForPrompt()` is
  the shared CSV-block formatter this route and `app/api/holdings/diversify/route.ts` both use, so
  they see the identical data contract rather than two independently-drifting copies. Works
  unchanged against whichever universe the client currently has loaded (Nifty 50 or All NSE) — it
  only ever reasons over the `rows` it's handed, no universe-specific logic of its own.
- **Deliberate scope boundary**: cross-sectional backtests (`app/api/backtest/cross-sectional/route.ts`)
  and the Holdings "deep factor analysis" toggle (`lib/portfolio/factor-tilt.ts`) **stay Nifty-50-only**,
  not expanded to `ALL_NSE_UNIVERSE`. Both are live, synchronous, user-triggered historical-bar
  fetches with no cache to fall back to — there's no safe way to run either over ~2,000 symbols
  inside one request without hitting the exact timeout/rate-limit problem the batched screener
  refresh above exists to avoid, and pre-materializing historical bars for the whole universe (the
  only way to make that safe) is a materially bigger project than what was asked. Revisit if
  backtesting/deep-analysis over the full universe becomes a real requirement — it would need its
  own cached, batch-refreshed historical-bars store, not just a bigger `universe` array passed into
  the existing live-fetch code path.

### PWA plumbing

- `public/manifest.json`, `public/sw.js` — service worker handles `push` and `notificationclick`
  (see `lib/push/` above) plus installability; no asset caching/offline strategy.
- `app/register-sw.tsx` — client component, registers `/sw.js` on mount; included once in
  `app/layout.tsx`.
- iOS Safari only receives web push once the PWA is added to the home screen (iOS 16.4+) — test this
  path explicitly, don't assume desktop Chrome behavior generalizes.

### `lib/backtest/` + `app/backtest/` — strategy backtesting

Not something I (this assistant) built — documented here so it isn't a surprise on the next pass.
Single-symbol (`lib/backtest/engine.ts`) and multi-symbol/portfolio (`portfolio-engine.ts`) backtest
runners over `STRATEGIES` (`strategies.ts`) and indicators (`indicators.ts`: `sma`, `rsi`, rolling
high/low), plus an ML strategy under `lib/backtest/ml/` (logistic regression over hand-built features).
Results persist to `backtests` / `portfolio_backtests` (`ownerId`-scoped, same as watchlist/portfolio),
with an optional AI-generated review (`app/api/backtest/[id]/review/route.ts`, `chat(..., { task:
"backtest_review" })`). UI lives at `/backtest` (`app/backtest/backtest-panel.tsx`,
`equity-chart.tsx`). `lib/events/engine.ts` is a small generic pub/sub (unrelated to price alerts)
used to fan out per-symbol backtest results to an aggregator.

**Three backtest "kinds," one shared `STRATEGIES` registry.** `StrategyDef.kind` (`types.ts`) is
`"single_symbol"` (the original engine above, unchanged) or `"cross_sectional"` — added to support
strategies from `crade-strategy-loop-prompt.md`'s queue that the single-symbol engine architecturally
can't express (ranking/comparing across many stocks, not just reading one stock's own OHLCV). A third
kind, pairs trading, deliberately isn't a `StrategyDef` at all (see below) since its config shape
(two symbols, not one/many) doesn't fit the same picker.

- **`cross-sectional-engine.ts`** (`runCrossSectionalBacktest`) ranks the *whole* universe at each
  rebalance date (monthly by default, weekly if `StrategyDef.rebalanceFrequency` says so) via a
  strategy-supplied `ScoreFn` (registered per `StrategyId` in `cross-sectional-strategies.ts`,
  mirroring `strategies.ts`'s `generateSignals` switch, just as a lookup map instead — populated one
  entry per strategy as `docs/strategy-library-log.md` strategies land), buys/holds the top
  `params.topN` equal-weighted, and reuses `applyBuy`/`applySell` from `lib/paper-trading/store.ts`
  against one shared `PortfolioState` — long-only ranking needs nothing that store doesn't already do,
  so it's untouched. Deliberately simpler than full rebalance-to-target-weight: only membership
  changes trade; a position that stays in the top-N isn't resized every rebalance. `RankContext` only
  ever exposes bars truncated to "as of now" per symbol (never the full series) so a strategy can't
  accidentally compare itself to another symbol's future price. The API route
  (`app/api/backtest/cross-sectional/route.ts`) fetches the full `NIFTY_50` universe with the same
  concurrency-5 worker pool as `lib/screener/fetch.ts`, fetching `Fundamentals` too only when
  `StrategyDef.needsFundamentals` is set (most cross-sectional strategies are price-only — skip the
  extra 50 requests when they're not needed).
- **`pairs-engine.ts`** (`runPairsBacktest`) trades a rolling z-score of `log(priceA/priceB)` between
  two user-chosen symbols — a market-neutral spread, not a `StrategyDef`/`STRATEGIES` entry (see
  `app/api/backtest/pairs/route.ts` and the "Pairs" mode in `backtest-panel.tsx`). **Deliberately does
  not touch `lib/paper-trading/store.ts`** — that store is shared with the live paper-trading feature
  and long-only by design (a short leg has no representation there), so this engine tracks its own
  cash/position ledger instead, with the standard short-sell accounting (short-open credits cash,
  buy-to-cover debits it). Reuses the existing `Trade[]` shape for the trade log (every leg of every
  open/close is its own row: short-open is a `"sell"`, its later buy-to-cover is a `"buy"` with
  `realizedPnl` — standard terminology, no pairs-specific UI needed) but does **not** feed that raw
  list to `computeMetrics()` — a short-open is technically a `"sell"` with no P&L yet, which would
  corrupt win-rate if counted as one. Metrics are computed from one synthetic entry per *closed round
  trip* instead (both legs' P&L combined), so win rate means "how many pair trades were profitable."
  Trades a chosen pair, not an automated cointegration scan across all NIFTY_50 pairs (noted as a
  possible future enhancement, not required for this to be a faithful pairs-trading implementation).
- **`StrategyDef.approximation`** (`types.ts`), when set, renders a visible "Proxy" badge next to the
  strategy name in `backtest-panel.tsx` plus the approximation text under the description — the
  labeling this app's Tier B strategies (ones that approximate data no current provider actually
  returns, e.g. book value) are required to have, per `crade-strategy-loop-prompt.md` §1.
  **`StrategyDef.auxiliary`** lets one single-symbol strategy receive a second real price series
  (e.g. crude oil) through `generateSignals`'s optional `auxiliaryBars` param without changing the
  signature every other strategy uses.
- **`lib/backtest/calendar.ts`** — pure calendar-date math (`isTurnOfMonth`, `isPaydayWindow`,
  `daysToMonthlyExpiry`/`isExpiryWeek`) shared by the calendar-effect strategies. No trading-calendar
  awareness (weekends/holidays aren't modeled — documented in the file header as a stated
  simplification, not a hidden one).
- **`docs/strategy-library-log.md`** (created once the first Phase 1 strategy lands) tracks what's
  been implemented from the loop file's queue vs. skipped, and why.

### `lib/agents/` + `lib/insider/` + `lib/sentiment/` + `app/trading-agents/` — multi-agent research pipeline

Modeled on TauricResearch's TradingAgents paper/repo (§4.3's quick/deep-thinking model split, the
Analyst Team → Researcher debate → Trader → Risk Management debate → Fund Manager role structure),
adapted onto Crade's already-integrated data sources rather than a new provider stack. **This is the
one AI surface in the entire app that deliberately ends in a directive buy/sell/hold call** — every
other surface (chat, screener AI-query, portfolio diagnostics, digest) is explicitly barred from doing
that; `lib/disclaimers.ts`'s `AGENT_DECISION_NOT_ADVICE` is correspondingly stronger and is shown
directly under the decision itself, not just once at the page bottom.

- **`lib/agents/pipeline.ts`** (`runTradingAgentsPipeline`) orchestrates the whole run for one symbol:
  `fetchPipelineData` fetches quote + 3mo bars (the one hard dependency), then fundamentals, news,
  Reddit sentiment, and insider activity in parallel, each independently `.catch()`-degraded to
  `null`/empty rather than failing the whole run over one fragile source — same discipline as
  `lib/ai/context.ts`'s `buildMarketContext`. Then: 4 analysts in parallel → one research debate → one
  trader plan → one risk debate ending in the final decision. ~12 `chat()` calls total (the paper
  reports ~11 per prediction, §5 footnote) — live-tested end-to-end against real free-tier NIM capacity
  at 4m43s, which is why `app/api/agents/run/route.ts` sets `export const maxDuration = 300` (Vercel's
  own ceiling outside Enterprise) rather than the default.
- **`lib/agents/analysts.ts`** — 4 analysts (Technical, Fundamentals, News, Sentiment), each one
  `chat()` call on task `"agent_report"` (fast tier first in `lib/ai/router.ts`) that only narrates
  data the caller already fetched — same anti-fabrication instruction proven in `buildMarketContext`
  ("only describe the data given, say so plainly if a section has none, never invent"). Fundamentals
  analyst prompt includes insider activity inline when available (recent NSE PIT disclosures, or an
  explicit "not available"/"none found" line otherwise).
- **`lib/agents/research-debate.ts`** (bull → bear → facilitator, all `"agent_reasoning"` task — deep
  tier first) and **`lib/agents/risk-debate.ts`** (risky/safe/neutral → Fund Manager final call, same
  task) are both single-round, not the paper's configurable n-round debate (deliberate v1
  simplification). Both prompts explicitly tell the model that debate disagreement alone is not a
  reason to default to hold — it must weigh which side the underlying data actually supports.
- **`lib/agents/parse-decision.ts`** — two ideas borrowed directly from TauricResearch's own
  `rating.py`/`schemas.py`: `extractAction` (labelled `"action: X"` line first, then a single
  unambiguous standalone action word, else `null` — never a guess) and `coerceOptionalPrice` (salvages
  a plain number from `"₹1,234.50"`-style strings, drops percentages/`"N/A"` rather than guessing a
  wrong absolute price). `TradeAction`'s `"review"` state (not a 4th real action) is what the
  Trader/Fund Manager decisions fall back to when their JSON can't be parsed and `extractAction` also
  comes up empty — deliberately **not** a silent "hold", since that would make a parsing failure
  indistinguishable from a genuine considered Hold. The research debate's facilitator has its own
  softer convention instead (defaults to `"bull"` but prefixes the summary with a visible
  `[couldn't be parsed]` note) since that output only feeds forward as context, not a persisted final
  call. The UI (`trading-agents-panel.tsx`) treats `"review"` as non-tradeable, same as `"hold"`, with
  its own distinct amber badge/notice so it never reads as a real Hold call.
- **`lib/insider/`** — `getInsiderActivity(symbol)` (6h cache, `insider_cache`, same TTL reasoning as
  `withFundamentalsCache`) wraps `nse-insider.ts`'s `fetchInsiderActivity`, which scrapes NSE's PIT
  (Prohibition of Insider Trading) disclosure endpoint — the Indian equivalent of the paper's US
  SEDI-style filings. **Explicitly not yet verified live** (unlike `nse-free.ts`'s quote/historical
  endpoints) — reverse-engineered from public documentation only; throws on failure, and
  `lib/agents/pipeline.ts` degrades that to `null` rather than failing the run.
- **`lib/sentiment/`** — `getSentiment(symbol)` (30min cache, `sentiment_cache`, same cadence as
  `lib/news/`) wraps `reddit.ts`'s `fetchRedditPosts` (Reddit's public search JSON, no OAuth, restricted
  to `r/IndianStreetBets+IndiaInvestments+IndianStockMarket` to keep a bare-ticker query relevant) and
  `score.ts`'s `scoreSentiment` — a small deterministic finance-slang lexicon scorer, **not** another
  LLM call, kept pure/I/O-free and unit-tested (`score.test.ts`) the same way
  `lib/portfolio/diagnostics.ts` is. Deliberately crude (word-count based, no negation handling) — it's
  meant to give the Sentiment Analyst a rough read to narrate, not a precise sentiment model; a
  `confidence` field (low/medium/high, based on post *count*, not sentiment direction) is threaded
  through so the analyst states plainly when a read is thin rather than projecting false certainty.
- **`agentRuns`** (`lib/db/collections.ts`'s `AgentRun`, `userId`-scoped, one doc per run — not
  upserted) is written by `app/api/agents/run/route.ts`'s `POST` and read back by its `GET` (added
  after the fact — for a while runs were persisted but never shown again, unlike every other AI feature
  in this app), rendered as a "Past analyses" list in `trading-agents-panel.tsx` matching
  `backtest-panel.tsx`'s past-runs pattern; clicking a row just calls `setResult` on that run's stored
  `result`, no refetch.
- **UI** (`app/trading-agents/trading-agents-panel.tsx`): the verdict renders as a full card (not a
  small badge) using `ACTION_STYLES`/`ACTION_LABELS`, includes a "Paper-trade this buy/sell" shortcut
  reusing `usePaperPortfolio` (fills at the live quote, not a stale price from the analysis — same
  discipline as every other Buy/Sell in the app) and a "Create alert if price drops below ₹X" shortcut
  reusing the existing `POST /api/alerts` when the trader's plan states a stop-loss. Analyst
  reports/debates render in collapsible `<details>` sections. A run takes up to ~5 minutes, so the page
  explicitly tells the user to leave the tab open rather than showing a bare spinner with no context.

### App structure

`app/page.tsx` is a client component (`"use client"`) that owns the single `usePaperPortfolio()` hook
instance and passes trade handlers/state down to `Watchlist` (fetch quotes, place simulated buy/sell,
backed by `use-watchlist.ts`) and `Portfolio` (holdings, live unrealized P&L, trade history), plus
mounts `ChatPanel` and `AccountNav` standalone. This is the one place in `app/` that isn't a server
component — everything here is client-fetched state, not data-heavy server rendering. `app/error.tsx`
is the route-segment error boundary (Next.js convention) for anything that throws during render.
`proxy.ts` gates every page except `/login` and `/signup` on the session cookie being present.

The top of the home page is a dashboard cluster (`alerts-summary.tsx` + `market-movers.tsx` +
`market-digest.tsx`) added so the most time-sensitive info doesn't require navigating to
`/alerts`/`/screener` first: `AlertsSummary` renders nothing if there's nothing to show, but surfaces
`status: "triggered"` alerts as a prominent banner (that's genuinely urgent — an alert fired) ahead of
a plain active-count line; `MarketMovers` pulls top-3 gainers/losers from the same cached
`/api/screener` data the full screener page uses. Both degrade to rendering nothing on failure rather
than showing an error — this is a summary widget, not the source of truth, so silence is the right
failure mode (the full page still has the real error state).

`MarketDigest` is on-demand (a button, not auto-generated on page load — no reason to spend a chat
call nobody asked for) and reuses the `"digest"` `ChatTask` that existed in `lib/ai/types.ts` but had
no caller until this. `app/api/digest/route.ts` reads the same `screener_snapshots` doc `/api/screener`
populates, but — unlike that route — enforces its own hour-old cutoff and refuses rather than silently
narrating stale data as "today's movement" (found this gap by testing it against a snapshot from
earlier in the session; it generated a plausible-sounding digest from hours-old data with no
indication anything was off, which is the same category of problem as the market-data/news/help-chat
fabrication issues elsewhere in this file — the fix here isn't a prompt change, it's not asking the
model to reason about freshness at all and just gating the data before it gets there).

### What's not built yet

Every item `docs/plan.md` §8's V1/V2 roadmap once listed here as missing is now built: technical
indicators are live on the watchlist itself (`watchlist.tsx`'s RSI/SMA toggle, not just backtesting),
multi-device push has a real view/revoke UI (`push-subscriptions-list.tsx`, on `/alerts`), email is a
real alert channel (`lib/email/send.ts`, see `lib/push/`), and the "shadow strategy" trade journal
idea is built (`app/journal/`). (Two of those three had quietly shipped without this section being
updated — a reminder to actually check the code before trusting this list, not just trust prose left
over from an earlier pass.)

The one deliberately-deferred item is real broker execution (`docs/plan.md`'s V3) — gated behind
SEBI's algo-trading framework (mandatory since April 1, 2026, see §7 and the top of this file), not a
capability gap. The `lib/` interfaces exist specifically so that work can build on stable seams
rather than needing this document rewritten each time a data source or AI provider changes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
