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
  - `middleware.ts` (project root) — redirects to `/login` when the `crade_session` cookie is *absent*.
    This is a fast, Edge-safe UX redirect only, **not** the authoritative check — it never touches Mongo,
    so an expired/invalid-but-present cookie still gets past it. `requireUserOrResponse()` in each Route
    Handler is what actually enforces access control. API routes are excluded from the middleware
    matcher; they gate themselves individually (`/api/quote`, `/api/history` intentionally stay public —
    stateless market-data lookups, no per-user data involved).

- **`lib/market-data/`**
  - `types.ts` — the `MarketDataProvider` interface: `getQuote`, `getHistorical`, `getFundamentals`.
    Any new data source (Kite Connect, a licensed vendor) implements this interface.
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
  - `fallback-provider.ts` — `withFallback([yahoo, nse])`: tries each provider in order per-method (a
    quote can succeed on yahoo while historical falls through to nse, independently).
  - `cache.ts` / `cached-provider.ts` — two independent cache wrappers, composed in `index.ts`:
    `withHistoricalCache()` for `getHistorical` (5-minute TTL, `price_cache` collection) and
    `withFundamentalsCache()` for `getFundamentals` (6-hour TTL, `fundamentals_cache` collection — much
    longer, since P/E/market cap move slowly and the endpoint backing them is the fragile one; a failed
    fetch is never cached, so the very next call after the endpoint recovers repopulates it). `getQuote`
    is deliberately **not** cached at all — paper-trading fills use the live quote price, so a stale
    cached quote would mean a simulated trade at a misleading price.
  - `index.ts` — exports `marketData`, the fully-composed provider (`withFundamentalsCache(
    withHistoricalCache(withFallback([yahoo, nse])))`). Swap/extend the chain here, not at call sites.

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
    candles, plus recent news headlines (`lib/news/`, see below), and formats them into the system
    prompt so the model reasons from actual data instead of guessing. **Fabrication is a real,
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
    endpoints). Gated by `CRON_SECRET` (`Authorization: Bearer <secret>`) when that env var is set — this
    is the header Vercel Cron sends automatically once you configure `CRON_SECRET` in the project's env
    vars. Scheduled via `vercel.json` (`*/5 * * * *`); locally, hit it manually with the same header to
    test. A "triggered" alert stays that way until the user flips it back to active/paused from
    `app/alerts/alerts-panel.tsx` (`PATCH app/api/alerts/[id]/route.ts`).
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
  - `app/api/watchlist/route.ts` / `app/use-watchlist.ts` follow the same shape for the symbol list
    (full-array GET/POST, keyed by the same `ownerId`).

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

### `lib/screener/` — Nifty 50 screener with AI-assisted filtering

- `universe.ts` — `NIFTY_50`: a **hardcoded snapshot** of Nifty 50 constituents (symbol/name/sector).
  There's no bulk "list all NSE stocks" data source wired in, so this is the stock universe until one
  exists. Index composition drifts over time — re-verify against NSE's published list periodically,
  don't treat it as live/authoritative.
- `fetch.ts` — `fetchScreenerData()`: a small worker-pool (concurrency 5, not `Promise.all` over all 50)
  fetches quote + fundamentals per symbol. A missing quote drops the row; missing fundamentals just
  leave those fields `undefined` (see the Yahoo `getFundamentals` note above — this happens routinely).
- `app/api/screener/route.ts` — cached in the `screener_snapshots` collection, 10-minute TTL, `?refresh=
  true` to force. Public (no auth) — same reasoning as `/api/quote`/`/api/history`: stateless market
  data, not per-user.
- `app/screener/screener-panel.tsx` — manual filters (sector, price range, max P/E, sort) plus
  `ai-screener-query.tsx`.
- `app/api/screener/ai-query/route.ts` — natural-language filtering, but **deliberately not** a
  "which stocks will return well, how confident are you" feature: the system prompt explicitly forbids
  claiming confidence about future returns (no model can back that up, and it's the kind of output
  SEBI's Investment Adviser rules are about — see `docs/plan.md` §7 and the "no real trading" framing at
  the top of this file). Instead it translates the question into concrete criteria against the real data
  the client already has loaded, and every returned symbol is checked against that same dataset before
  being shown — a hallucinated ticker not in the table gets filtered out, not displayed. Requires auth
  (it's an AI-cost-incurring action, same as chat).

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

### App structure

`app/page.tsx` is a client component (`"use client"`) that owns the single `usePaperPortfolio()` hook
instance and passes trade handlers/state down to `Watchlist` (fetch quotes, place simulated buy/sell,
backed by `use-watchlist.ts`) and `Portfolio` (holdings, live unrealized P&L, trade history), plus
mounts `ChatPanel` and `AccountNav` standalone. This is the one place in `app/` that isn't a server
component — everything here is client-fetched state, not data-heavy server rendering. `app/error.tsx`
is the route-segment error boundary (Next.js convention) for anything that throws during render.
`middleware.ts` gates every page except `/login` and `/signup` on the session cookie being present.

The top of the home page is a dashboard cluster (`alerts-summary.tsx` + `market-movers.tsx`) added so
the most time-sensitive info doesn't require navigating to `/alerts`/`/screener` first: `AlertsSummary`
renders nothing if there's nothing to show, but surfaces `status: "triggered"` alerts as a prominent
banner (that's genuinely urgent — an alert fired) ahead of a plain active-count line; `MarketMovers`
pulls top-3 gainers/losers from the same cached `/api/screener` data the full screener page uses. Both
degrade to rendering nothing on failure rather than showing an error — this is a summary widget, not
the source of truth, so silence is the right failure mode (the full page still has the real error
state).

### What's not built yet

Per the roadmap in `docs/plan.md` §8: technical indicator/screening logic on the watchlist itself
(exists for backtesting, not surfaced live), email as an alert channel (`Alert.channel: "email"` is
accepted by the API but nothing sends it — only `"push"` is wired), and multi-device push (a user can
subscribe multiple browsers/devices; nothing yet lets them view/revoke individual subscriptions). The
`lib/` interfaces exist specifically so that work can build on stable seams rather than needing this
document rewritten each time a data source or AI provider changes.
