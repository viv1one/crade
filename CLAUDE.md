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

There is no test runner configured yet. If you add one, wire a `test` script and document how to run a
single test here.

Requires a populated `.env.local` (see `.env.example`) — at minimum `MONGODB_URI` — before `dev`/`build`
will run without throwing.

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
    every Mongo collection: `users`, `watchlists`, `alerts`, `price_cache`, `ai_sessions`,
    `push_subscriptions`, `journal_entries`. `price_cache.fetchedAt` is meant to be a **TTL-indexed**
    field (create that index in Atlas / a migration script — it's not created automatically here) so
    cached candles expire instead of growing forever.

- **`lib/market-data/`**
  - `types.ts` — the `MarketDataProvider` interface: `getQuote`, `getHistorical`, `getFundamentals`.
    Any new data source (Kite Connect, a licensed vendor) implements this interface.
  - `providers/yahoo-free.ts` — the only implementation right now: an unauthenticated Yahoo Finance
    chart-API fallback. **Prototyping only** — NSE/Yahoo terms don't permit redistributing this data to
    other users. Do not build multi-user features on top of it without swapping in a licensed provider
    first.
  - `index.ts` — exports `marketData`, the currently-active provider. Swap the implementation here, not
    at call sites.

- **`lib/ai/`**
  - `types.ts` — `ChatMessage`, `ChatTask` (`explain_move` | `summarize` | `chat` | `digest`),
    `AiProviderConfig`.
  - `router.ts` — `chat(messages, { task })`. All providers (NVIDIA NIM, Anthropic, OpenAI) are called
    through OpenAI-compatible `/chat/completions` endpoints, so adding a provider is a base-URL +
    model-name entry in the `providers` map. Each `ChatTask` has its own fallback order in
    `chainByTask` — cost/latency-tolerant tasks (`digest`, `summarize`) try NIM first; user-facing chat
    tries the paid tier first. Providers without an API key configured are skipped, not errored.

- **`lib/push/send.ts`** — `sendPushNotification(subscription, payload)`, thin wrapper around
  `web-push` configured from `VAPID_*` env vars. Called by whatever background job evaluates alerts
  (not yet implemented — see plan §6/§8: a cron or queue worker is meant to run this on each
  price-cache refresh).

- **`lib/paper-trading/`**
  - `types.ts` / `store.ts` — pure, framework-free simulation logic: `Holding`, `Trade`,
    `PortfolioState`, and `applyBuy`/`applySell`, which validate cash/quantity and update average cost
    basis and realized P&L. No I/O — safe to unit test directly.
  - Currently wired to the UI via `app/use-paper-portfolio.ts`, a client hook that persists
    `PortfolioState` to `localStorage` (`crade_paper_portfolio_v1`), **not** Mongo — there's no auth
    yet, so there's no `userId` to key a Mongo document on. When auth lands, migrate this hook to read
    /write through an API route backed by a new `portfolios` collection instead of localStorage, and
    the pure functions in `store.ts` can be reused as-is.

### PWA / push plumbing

- `public/manifest.json`, `public/sw.js` — service worker handles `push` and `notificationclick` only;
  it does not currently do any asset caching/offline strategy.
- `app/register-sw.tsx` — client component, registers `/sw.js` on mount; included once in
  `app/layout.tsx`.
- iOS Safari only receives web push once the PWA is added to the home screen (iOS 16.4+) — test this
  path explicitly, don't assume desktop Chrome behavior generalizes.

### App structure

`app/page.tsx` is a client component (`"use client"`) that owns the single `usePaperPortfolio()` hook
instance and passes trade handlers/state down to `Watchlist` (fetch quotes, place simulated buy/sell)
and `Portfolio` (holdings, live unrealized P&L, trade history). This is the one place in `app/` that
isn't a server component — everything here is local UI state, not data-heavy server rendering.

### What's not built yet

Per the roadmap in `docs/plan.md` §8: auth, alert UI/API routes and the alert-evaluation background job,
the AI chat panel, and technical indicator/screening logic are all unimplemented. Paper-trading state is
also not yet per-user (see `lib/paper-trading/` above — it's a single shared `localStorage` account
until auth exists). The `lib/` interfaces above exist specifically so that work can build on stable
seams rather than needing this document rewritten each time a data source or AI provider changes.
