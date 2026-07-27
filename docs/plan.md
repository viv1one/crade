That covers the shape of it: your own infrastructure (client, app server, database) in grey, and the three external integrations (market data, AI, push delivery) in purple. Here's the full plan.

1. What this actually is

A personal research-and-alerts PWA for Indian equities: watchlists, technical/fundamental screens, an AI chat layer that can explain a move or summarize a stock, and push notifications when something a user cares about happens. Not an auto-trading system — that's a meaningfully bigger regulatory lift (more on that in §7), so I'd scope v1 as read-only research + alerts, and treat order execution as a much later, optional phase.

2. Tech stack
Layer	Choice	Why
Frontend	Next.js 15 (App Router), React, Tailwind	Server components for data-heavy pages, next-pwa/manual service worker for installability
Backend	Next.js API routes + server actions	No separate backend needed at this scale; keep it one deployable
Database	MongoDB Atlas	Flexible schema fits varied instrument/alert shapes; free M0 tier is enough to start
Background jobs	Node cron (node-cron) or a queue (BullMQ + Redis) if job volume grows	Market data refresh, alert evaluation, scheduled AI digests
Push	Web Push API + web-push npm package, VAPID keys	Native browser API, no third-party push service needed
AI	Provider-agnostic router (OpenAI-compatible interface)	Swap NVIDIA NIM, OpenAI, Anthropic, or a local model without touching call sites
Hosting	Vercel (app) + MongoDB Atlas (data) + Upstash Redis (if queue needed)	Minimal ops for a solo/side project
3. MongoDB collections
users            { _id, email, passwordHash/oauth, createdAt, notificationPrefs }
watchlists       { _id, userId, name, symbols: [ "RELIANCE.NS", "TCS.NS" ] }
alerts           { _id, userId, symbol, condition: { type: "price_above"|"rsi_below"|"volume_spike", value }, channel: "push"|"email", status, lastTriggeredAt }
price_cache      { _id, symbol, interval, candles: [...], source, fetchedAt }   // TTL-indexed
ai_sessions      { _id, userId, symbol?, messages: [...], provider, model, createdAt }
push_subscriptions { _id, userId, endpoint, keys: { p256dh, auth }, createdAt }
journal_entries  { _id, userId, symbol, note, tags, createdAt }   // optional Shadow-Account-style trade journal

Keep price_cache TTL-indexed (Mongo's native TTL index) so stale candles expire automatically instead of growing forever.

4. Market data for Indian equities — the part to get right

This is the trickiest layer, for licensing reasons more than technical ones. NSE's own terms explicitly prohibit redistributing its market data without a licence agreeing to these terms means content on the exchange's site or app cannot be copied, reproduced, stored, or distributed in any form without NSE's prior written permission, and its data-sharing policy is stricter still — trading members and subscribers aren't permitted to redistribute market data except as separately agreed with NSE. So "scrape NSE's website" is not a safe foundation for anything you'd show to other users, even for free. 
Nairobi Securities Exchange
NSE

Realistic options, cheapest to most capable:

Broker API (recommended starting point): Zerodha's Kite Connect now has a free "Personal" tier for execution-only use with no market data, and a paid tier at ₹500 per month per API key that adds live and historical market data at no extra cost — Zerodha made this change after regulatory clarity emerged on personal-use APIs, keeping only the data charge. Note that order placement requires a registered static IP as of April 2025, and that static IP can only be shared with immediate family members under the regulation — fine for a personal project, not for a multi-user product without separate developer apps per user. 
Zerodha + 2
Licensed data vendors: firms like Global Datafeeds or TrueData sell NSE/BSE-authorized real-time feeds specifically meant for redistribution into apps — the right path if you ever want other people using your data, not just your own broker account.
Free/no-key fallbacks for prototyping: yfinance-equivalent libraries for NSE-listed tickers (.NS suffix) work fine for personal dashboards and are what Vibe-Trading itself falls back to, but treat this as prototyping only, not a redistribution-safe production source.

Design the data layer with a provider interface (getQuote, getHistorical, getFundamentals) so you can start on the free fallback and swap in a licensed vendor or Kite Connect later without touching the rest of the app — same pattern Vibe-Trading uses for its 22-source fallback chain.

5. AI layer — provider-agnostic, NVIDIA NIM included

Build one internal interface (chat(messages, {task})) that routes to whichever provider fits the task, all via OpenAI-compatible endpoints so switching is a base-URL and model-name change:

NVIDIA NIM (build.nvidia.com) is a genuinely good fit for prototyping: it exposes 100+ hosted models including DeepSeek, Llama, and Qwen through an OpenAI-compatible endpoint, with a free API key issued the moment you join the developer program. It even has an Indic-language model (Sarvam-M) if you want Hindi/regional-language chat support later. The catch: the free tier isn't credit-metered so much as rate-limited, with a community-observed baseline around 40 requests per minute, and that rate limit makes it unfit for real production user traffic — NVIDIA's own guidance points production use toward self-hosted NIM containers or DGX Cloud. So: great for dev, cost-free demos, and a fallback tier — not your only production path. 
#site_title + 2
Anthropic/OpenAI as the primary paid tier for anything user-facing at scale, with NIM as a free/cheap fallback for less latency-sensitive tasks (e.g. batch "explain today's move" summaries).
Keep the abstraction Vibe-Trading itself uses as a model: a router that tries a cheap/free provider first and falls back up the chain, same shape as its market-data fallback.
6. Push notifications

Standard, no vendor lock-in:

Service worker registers for push and stores a PushSubscription (endpoint + keys) in push_subscriptions.
Generate one VAPID key pair for the whole app (web-push generate-vapid-keys).
A background job (cron or queue worker) evaluates alerts against fresh prices on each price-cache refresh.
On a trigger, the server calls webpush.sendNotification(subscription, payload) — this is what actually wakes the browser and shows the notification even if the tab is closed, which is the whole point of doing this as a PWA rather than a plain SPA.
iOS Safari only supports web push once the PWA is added to the home screen (iOS 16.4+) — worth testing early since a chunk of Indian mobile users will be on iOS.
7. Regulatory context — read before you scope v2

If you ever add auto-execution (not just alerts), SEBI's new framework changes what's allowed and it's now live: the framework became mandatory from April 1, 2026, one of the more significant regulatory shifts in Indian retail trading, requiring all automated trades to pass through a SEBI-compliant broker API with a unique Strategy ID and security controls like static IP whitelisting. Concretely: every algorithmic order must carry an exchange-issued Algo-ID from April 2026 for traceability, and algorithm providers — including individual developers — are required to operate through a registered broker rather than accessing exchanges directly. Retail algo trading itself isn't banned — SEBI explicitly allows retail traders to develop and use their own algorithms for trading their own accounts through broker APIs — but a multi-user product that places orders on other people's behalf is a different, heavier compliance surface than a personal script. For v1, staying in "research, alerts, and journaling" territory sidesteps this entirely, and a visible disclaimer ("not investment advice, for personal research only") is worth having from day one regardless. 
Share India + 3

8. Phased roadmap
MVP (2–4 weeks): Auth, watchlists, free-tier price fetch (.NS tickers), manual refresh, basic PWA manifest + service worker, no notifications yet.
V1: Push notifications on price/volume alerts, AI chat panel per stock (NIM-backed), MongoDB-backed alert engine on a cron job.
V2: Upgrade to a licensed data vendor or your own Kite Connect data plan, add technical indicators/screens, add a lightweight "shadow strategy" journal (log your own trades, let AI critique patterns) inspired by Vibe-Trading's Shadow Account idea — this stays firmly in "insight," never "execution."
V3 (optional, much later): Broker connection for read-only portfolio import; auto-execution only if you're prepared to register as required under the April 2026 SEBI framework.