# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Crade is a personal research-and-alerts PWA for Indian equities: watchlists, technical/fundamental
screens, an AI chat layer that explains moves or summarizes a stock, and push notifications when a
watched condition triggers. It is explicitly **not** an auto-trading system — v1 scope is read-only
research + alerts. Auto-execution is a deliberately deferred, much heavier compliance surface (SEBI's
algo-trading framework became mandatory April 1, 2026 — see `docs/plan.md` §7 before adding order
placement of any kind).

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

### PWA / push plumbing

- `public/manifest.json`, `public/sw.js` — service worker handles `push` and `notificationclick` only;
  it does not currently do any asset caching/offline strategy.
- `app/register-sw.tsx` — client component, registers `/sw.js` on mount; included once in
  `app/layout.tsx`.
- iOS Safari only receives web push once the PWA is added to the home screen (iOS 16.4+) — test this
  path explicitly, don't assume desktop Chrome behavior generalizes.

### What's not built yet

Per the roadmap in `docs/plan.md` §8: auth, watchlist/alert UI and API routes, the alert-evaluation
background job, the AI chat panel, and technical indicator/screening logic are all unimplemented. The
`lib/` interfaces above exist specifically so that work can build on stable seams rather than needing
this document rewritten each time a data source or AI provider changes.
