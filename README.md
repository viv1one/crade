# Crade

Crade is a personal research-and-alerts PWA for Indian equities (NSE). It's a single Next.js
deployable — no separate backend — that gives you real accounts, watchlists, an AI chat layer
grounded in real price data, price/RSI/volume alerts pushed as browser notifications, strategy
backtesting, and a **paper-trading** portfolio for practicing buy/sell decisions with fake money.

**This is explicitly not a real-money trading system.** There is no broker integration and no
order routing — "Buy" / "Sell" only ever simulate a fill at the last fetched quote. The user's
actual broker (Groww) is a completely separate app. Real order placement is a deliberately
deferred, much heavier compliance surface (SEBI's algo-trading framework became mandatory
April 1, 2026 — see [`docs/plan.md`](docs/plan.md) §7 before ever wiring up an actual broker API).

The original product plan (tech-stack rationale, MongoDB schema, market-data licensing
constraints, phased roadmap) lives in [`docs/plan.md`](docs/plan.md). The day-to-day map of how
the code is actually organized — every module, every design decision and why it was made, every
known gotcha — lives in [`CLAUDE.md`](CLAUDE.md); this README is a shorter orientation, not a
replacement for it.

## Features

- **Auth** — real email/password accounts (hand-rolled, not a third-party auth library).
- **Watchlist** — track symbols, auto-fetch live quotes.
- **Paper trading** — a simulated cash + holdings portfolio; buys/sells fill at the live quote,
  server-authoritative (the client never sends a pre-computed balance).
- **AI chat** — ask about a symbol or general market questions; answers are grounded in real
  quote/historical/fundamentals/news data fetched server-side before the model ever sees the
  question, with explicit anti-fabrication guarding when that data isn't available.
- **Alerts** — price-above/below, RSI-below, and volume-spike conditions, evaluated on a
  schedule and delivered as real browser push notifications (works installed as a PWA,
  including iOS 16.4+ home-screen installs).
- **Backtesting** — single-symbol, cross-sectional (ranks the whole universe and rebalances
  into the top N), and pairs-trading (market-neutral spread) strategies, with an optional
  AI-generated review of the results.
- **Screener** — Nifty 50 (on-demand, 10-minute cache) and all-NSE (~2,000 symbols, batch
  cron-refreshed hourly) with manual filters and natural-language AI-assisted filtering.
- **Real holdings tracker** — manually record positions you actually hold at your real broker,
  purely for research/diagnostics (allocation, concentration, sector exposure, factor tilts,
  diversification suggestions) — separate from the paper-trading portfolio, no fake cash involved.
- **Sharing** — invite another user (by email) to view your watchlist read-only. No teams/orgs,
  just per-resource, per-invitee grants.
- **PWA** — installable, service worker for push notifications.

## Tech stack

- [Next.js 15](https://nextjs.org) (App Router, Turbopack) + React 19 + TypeScript
- [MongoDB](https://www.mongodb.com/) via the official driver (no ORM)
- Tailwind CSS v4
- Hand-rolled session auth (`node:crypto` scrypt, no bcrypt/Auth.js)
- Market data from free/unofficial providers (NSE JSON endpoints, Yahoo Finance chart API,
  screener.in, and optionally the `jugaad-data` Python library in dev) behind a single
  provider-agnostic interface, chained with fallback/cache/coalescing wrappers
- AI chat via OpenAI-compatible `/chat/completions` endpoints — NVIDIA NIM, Anthropic, or OpenAI,
  whichever keys are configured, with per-task fallback ordering
- Web push via [`web-push`](https://www.npmjs.com/package/web-push) (VAPID)
- [Vitest](https://vitest.dev/) for unit tests

See [`CLAUDE.md`](CLAUDE.md) for the full breakdown of `lib/` (the provider-agnostic core) and
how each piece composes.

> **Data licensing note**: the free NSE/Yahoo/screener.in/Google News integrations here are
> unofficial and not licensed for redistribution — treat this as a personal/prototyping setup,
> not something to expose as a multi-user product without swapping in a licensed data vendor.

## Getting started

### Prerequisites

- Node.js and npm
- A MongoDB connection string (e.g. a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster)
- (Optional, dev-only) `python3` on `PATH` with `jugaad-data` installed, for the highest-quality
  local market-data provider — `pip install -r requirements.txt`. Everything works without this;
  the app just falls back to the free HTTP providers.

### Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and fill it in:

   ```bash
   cp .env.example .env.local
   ```

   At minimum you need `MONGODB_URI` — every API route touches Mongo, so `dev`/`build` will
   throw without it. See [Environment variables](#environment-variables) below for what each
   one does and when it's actually required.

3. Start the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). You'll be redirected to `/signup` to
   create an account (there's no seed/demo user).

### Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server (Turbopack) at `localhost:3000` |
| `npm run build` | Production build (Turbopack) |
| `npm start` | Run a production build |
| `npm run lint` | ESLint (flat config, `next/core-web-vitals` + `next/typescript`) |
| `npx tsc --noEmit` | Type-check without emitting |
| `npm test` | Run the Vitest suite (paper-trading, market-data fallback, backtest engine/indicators/ML, event engine) |
| `npx vitest run <file> -t "<name>"` | Run a single test by name |
| `npm run generate:nse-universe` | Regenerate `lib/screener/nse-universe.ts` from NSE's public bulk equity-listing CSV — **generated file, don't hand-edit** |
| `npm run seed:screener-local` | Locally drive the all-NSE screener cache through every batch (dev only — the real cron workflow can't reach `localhost`); reads `CRON_SECRET` from `.env.local`; takes tens of minutes |

## Environment variables

All of these live in `.env.local` (see [`.env.example`](.env.example) for the literal template).

| Variable | Required? | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | **Always** | Every API route reads/writes Mongo through this. Include a default database name in the connection string. |
| `NIM_API_KEY` / `NIM_MODEL` / `NIM_MODEL_LARGE`, `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`, `OPENAI_API_KEY` / `OPENAI_MODEL` | At least one, for `/api/chat` | The AI router tries providers in a task-specific order and skips any without a key. Without any key configured, `/api/chat` returns a 502 with a clear error instead of failing silently. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | For push notifications | Generate a keypair with `npx web-push generate-vapid-keys`. `VAPID_SUBJECT` must be a real `mailto:`/`https:` URI with no angle brackets. `NEXT_PUBLIC_VAPID_PUBLIC_KEY` must match `VAPID_PUBLIC_KEY` exactly (it's the browser-exposed copy). |
| `CRON_SECRET` | Recommended | Bearer-token secret the alert-evaluation and screener-refresh cron endpoints require (`Authorization: Bearer <secret>`). If unset, those endpoints accept unauthenticated calls. |

### Scheduled jobs

Two GitHub Actions workflows call cron-gated API routes on the deployed URL (they can't reach
`localhost`, so locally these features only update when you trigger them manually):

- [`.github/workflows/evaluate-alerts.yml`](.github/workflows/evaluate-alerts.yml) — every 5
  minutes, evaluates active alerts and sends push notifications for any that trigger.
- [`.github/workflows/refresh-screener.yml`](.github/workflows/refresh-screener.yml) — hourly,
  refreshes the all-NSE screener cache in small batches to stay well under serverless timeouts.

Both need two repo secrets (Settings → Secrets and variables → Actions): `CRON_SECRET` (same
value as the Vercel env var) and `CRADE_DEPLOYMENT_URL` (the deployed origin, no trailing slash).
Vercel's own `crons` config in `vercel.json` isn't used for these because Hobby-tier projects only
allow once-daily schedules, and alerts need 5-minute granularity to be useful.

## Testing

```bash
npm test
```

Runs the Vitest suite: paper-trading buy/sell logic, market-data provider fallback behavior,
the backtest engine/indicators/ML strategy, and the pub/sub event engine used to fan out
cross-sectional backtest results. Business logic in `lib/` is deliberately kept I/O-free and
framework-free so it's directly unit-testable — see e.g. `lib/paper-trading/store.test.ts`.

## Project structure

```
app/            Next.js App Router — pages, API routes, and the one client-owned home page
lib/            Provider-agnostic core: db, auth, market-data, ai, news, push, paper-trading,
                portfolio diagnostics, screener, backtest
scripts/        One-off/generator scripts (NSE universe generation, local screener seeding,
                the jugaad-data Python bridge)
docs/           Product plan, enterprise/sharing plan, strategy-library implementation log
.github/        Scheduled-job workflows (alerts, screener refresh)
public/         PWA manifest + service worker
```

For the full architectural tour — why each provider/cache/fallback layer exists, what broke
before the current design and how it was fixed, and what's deliberately not built yet — read
[`CLAUDE.md`](CLAUDE.md).

## Deployment

Deploys as a standard Next.js app (built and tested against Vercel's Hobby tier — see the
cron-scheduling note above for the one place that constraint mattered). Set the same environment
variables as `.env.local` in your hosting provider's dashboard; nothing in the app requires a
Node runtime feature Vercel's serverless functions don't have, except the optional dev-only
`jugaad-data` Python provider, which fails fast and falls back automatically in production.

## License

Personal project — no license file / not intended for redistribution as-is (see the data
licensing note above).
