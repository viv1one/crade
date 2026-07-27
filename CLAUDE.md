# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Crade is a personal research-and-alerts PWA for Indian equities: watchlists, technical/fundamental
screens, an AI chat layer that explains moves or summarizes a stock, push notifications when a watched
condition triggers, and a **paper-trading** portfolio for practicing buy/sell decisions with fake money.
It is explicitly **not** a real-money trading system — there is no broker integration and no order
routing. The user's actual broker (Groww) is a separate app entirely; Crade's "Buy"/"Sell" only ever
simulate a fill at the last fetched quote. Real order placement is a deliberately deferred, much heavier
compliance surface (SEBI's algo-trading framework became mandatory April 1, 2026 — see `docs/plan.md`
§7 before ever wiring up an actual broker API).

The original product plan (tech-stack rationale, MongoDB schema, market-data licensing constraints,
phased roadmap) lives in `docs/plan.md`. Read it before making architectural decisions — this file
covers only what the plan doesn't: how the code that now exists is actually organized.

## Commands

- `npm run dev` — start dev server (Turbopack) at http://localhost:3000
- `npm run build` — production build (Turbopack)
- `npm start` — run a production build
- `npm run lint` — ESLint (flat config in `eslint.config.mjs`, extends `next/core-web-vitals` + `next/typescript`)
- `npx tsc --noEmit` — type-check without emitting (no separate `typecheck` script yet)
- `npm test` — runs `vitest run` (currently covers `lib/paper-trading/store.test.ts`)
- `npx vitest run lib/paper-trading/store.test.ts -t "rejects a buy"` — run a single test by name

Requires a populated `.env.local` (see `.env.example`) — at minimum `MONGODB_URI` — before `dev`/`build`
will run without throwing (every API route under `app/api/` touches Mongo via `lib/db`). AI chat
(`app/api/chat`) additionally needs at least one working provider key (`NIM_API_KEY`, `ANTHROPIC_API_KEY`,
or `OPENAI_API_KEY`) — without one, `/api/chat` returns a 502 with a clear error rather than failing
silently, and the chat panel surfaces that error in the UI.

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
    every Mongo collection: `users`, `watchlists`, `paper_portfolios`, `alerts`, `price_cache`,
    `ai_sessions`, `push_subscriptions`, `journal_entries`. `watchlists` and `paper_portfolios` are keyed
    by `ownerId` — currently the anonymous device id from `lib/identity/`, not a real `User._id` (see
    below). `price_cache.fetchedAt` is meant to be a **TTL-indexed** field (create that index in Atlas /
    a migration script — it's not created automatically here) so cached candles expire instead of
    growing forever; `lib/market-data/cache.ts` also enforces a 5-minute TTL in application code as a
    stopgap.

- **`lib/identity/device-id.ts`** — `getOrCreateDeviceId()` issues/reads an httpOnly `crade_device_id`
  cookie. This is **not real authentication** — there's no login, no password, nothing to distinguish
  one visitor from another beyond "same browser, same cookie." It exists purely so `watchlists` and
  `paper_portfolios` have something to key documents on before real auth is built. Only callable from
  Route Handlers / Server Actions (`cookies()` is read-only in Server Components). When real auth lands,
  swap `ownerId` to a `User._id.toString()` and this module goes away.

- **`lib/market-data/`**
  - `types.ts` — the `MarketDataProvider` interface: `getQuote`, `getHistorical`, `getFundamentals`.
    Any new data source (Kite Connect, a licensed vendor) implements this interface.
  - `providers/yahoo-free.ts` — the only real implementation: an unauthenticated Yahoo Finance chart-API
    fallback. **Prototyping only** — NSE/Yahoo terms don't permit redistributing this data to other
    users. Do not build multi-user features on top of it without swapping in a licensed provider first.
  - `cache.ts` / `cached-provider.ts` — `withHistoricalCache()` wraps a provider so `getHistorical`
    reads/writes through the `price_cache` Mongo collection (5-minute TTL). `getQuote` is deliberately
    **not** cached — paper-trading fills use the live quote price, so a stale cached quote would mean a
    simulated trade at a misleading price.
  - `index.ts` — exports `marketData`, the currently-active (cached) provider. Swap the implementation
    here, not at call sites.

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
  - `app/api/chat/route.ts` + `app/chat-panel.tsx` — the UI: free-text symbol field, a `ChatTask`
    selector, and message history kept in component state only (not persisted to `ai_sessions` yet,
    unlike watchlist/portfolio).

- **`lib/push/send.ts`** — `sendPushNotification(subscription, payload)`, thin wrapper around
  `web-push` configured from `VAPID_*` env vars. Called by whatever background job evaluates alerts
  (not yet implemented — see plan §6/§8: a cron or queue worker is meant to run this on each
  price-cache refresh).

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

### PWA / push plumbing

- `public/manifest.json`, `public/sw.js` — service worker handles `push` and `notificationclick` only;
  it does not currently do any asset caching/offline strategy.
- `app/register-sw.tsx` — client component, registers `/sw.js` on mount; included once in
  `app/layout.tsx`.
- iOS Safari only receives web push once the PWA is added to the home screen (iOS 16.4+) — test this
  path explicitly, don't assume desktop Chrome behavior generalizes.

### App structure

`app/page.tsx` is a client component (`"use client"`) that owns the single `usePaperPortfolio()` hook
instance and passes trade handlers/state down to `Watchlist` (fetch quotes, place simulated buy/sell,
backed by `use-watchlist.ts`) and `Portfolio` (holdings, live unrealized P&L, trade history), plus
mounts `ChatPanel` standalone. This is the one place in `app/` that isn't a server component —
everything here is client-fetched state, not data-heavy server rendering. `app/error.tsx` is the
route-segment error boundary (Next.js convention) for anything that throws during render.

### What's not built yet

Per the roadmap in `docs/plan.md` §8: real auth (still just the anonymous device-id cookie — see
`lib/identity/`), alert UI/API routes and the alert-evaluation background job (so push notifications
are wired end-to-end but nothing ever triggers `lib/push/send.ts`), AI chat history persistence to
`ai_sessions`, and technical indicator/screening logic are all unimplemented. The `lib/` interfaces
exist specifically so that work can build on stable seams rather than needing this document rewritten
each time a data source or AI provider changes.
