# From personal tool to an internal team tool — scoping plan

This is a planning document, not a build spec. Nothing here has been built. It exists to lay out
what stands between Crade as it is today (a single-user personal research tool — see `docs/plan.md`)
and Crade as an **internal tool for one company** (stock brokers, a CEO, and other staff — starting
around 22 people). Read `docs/plan.md` first; this document assumes it.

**Decisions made (2026-07-28):** internal tool, not a sellable product — no external customers, no
billing. Data stays on the existing free/open providers (Yahoo Finance, NSE, Google News) — no
licensed data vendor. Both decisions below are accepted with their consequences understood, not
because the consequences don't apply.

## 1. The data-licensing risk is accepted, not eliminated

Everything built so far uses free, scraped, unlicensed data sources:

- `lib/market-data/providers/yahoo-free.ts` / `providers/nse-free.ts` — Yahoo's public API and NSE's
  own JSON endpoints, both explicitly "prototyping only" per their own terms, both already observed
  rate-limited/blocked outright during this project's testing.
- `lib/news/google-news.ts` — Google News RSS, an unofficial, unlicensed feed.

"Internal tool" does not change what these providers' terms restrict — the restriction is about who
sees the data *through the app*, not who's paying for the app or which company they're employed by.
22 employees viewing Yahoo/NSE data through Crade is still 22 non-account-holders seeing scraped
data. This is a real ToS risk being knowingly accepted for an internal deployment, at whatever scale
22 concurrent users creates — not a risk that disappears because no money changes hands with outside
customers.

**Practical consequence, not just theoretical:** during this project's own testing (one person,
intermittent use), both Yahoo's chart endpoint and NSE's site were observed fully blocked/rate-limited
for sustained periods. 22 people using the screener/chat/alerts concurrently will generate meaningfully
more request volume than one person's testing did. Expect rate-limiting and outright blocks to be a
recurring operational problem, not an edge case — the existing caching (`price_cache`,
`fundamentals_cache`, `screener_snapshots`, `news_cache`) reduces load but was sized for one user, and
a shared cache actually helps somewhat here (22 people asking about the same Nifty 50 stock share one
cache entry) — but a block on the underlying provider still means degraded data for everyone at once,
not just the one user who "used too much."

If this becomes a recurring problem in practice, the fallback options are the same ones in
`docs/plan.md` §4 (Kite Connect, Global Datafeeds, TrueData) — worth knowing they exist even though
they're out of scope for now.

## 2. The regulatory/liability question is still open

This one wasn't answered and doesn't go away just because it's internal-only: an AI giving stock
analysis to *one person, for their own decisions* is a different risk posture than the same output
reaching brokers and a CEO who may act on it, or whose clients' money is downstream of it. SEBI's
Investment Adviser Regulations govern "advice"; whether Crade's chat/screener output counts depends on
how it's positioned and disclaimed. **This still needs an actual answer** — even for an internal tool,
if the CEO or a broker acts on the app's analysis and it goes wrong, "it was just for internal use"
is not obviously a defense. Treat this as unresolved, not deprioritized.

## 3. Architecture work

Current state: `lib/auth/` is real per-user auth (email/password, hashed sessions), and every resource
(`watchlists`, `paper_portfolios`, `alerts`, `backtests`, `ai_sessions`) is scoped to a single
`userId`/`ownerId`, visible only to its owner. Signup stays open as-is (no invite-only gate, no domain
restriction) — the collaboration model is **peer sharing**, not a company-wide org: any user can invite
specific other people to view specific things of theirs, rather than everyone in one shared workspace.
This is simpler than an org/tenancy model and doesn't need one at all.

- **A `shares` collection.** Something like `{ ownerId, resourceType: "watchlist" | "alerts" | ...,
  resourceId, invitedEmail, status: "pending" | "accepted", permission: "view" }`. Read-only ("see") to
  start, per the ask — no indication yet that an invited viewer should be able to edit the owner's
  watchlist or manage their alerts, just view them.
- **Invite flow.** Owner enters an email from (e.g.) their watchlist page → creates a `shares` row →
  invited person gets a link. If they already have an account, the shared resource shows up somewhere
  in their UI; if not, signup (already open) plus the pending share resolves on first login.
- **Read-only view rendering.** The existing per-resource pages (`app/page.tsx`'s watchlist/portfolio
  section, `app/alerts/`) are all built assuming "this is my data, I can edit it." Viewing *someone
  else's* watchlist/alerts read-only needs either a variant of those components with editing disabled,
  or a separate `/shared/[ownerId]/...` view — worth deciding which before building either.
- **Scope question, not yet answered:** which resources are shareable? Watchlist and alerts seem like
  the obvious candidates (matches "invite people to see"). Paper trading is more likely to stay
  personal — a CEO's practice account probably isn't what a broker needs visibility into — but that's
  a guess, not a decision; see open questions below.

## 4. Phased rollout (proposed)

| Phase | Scope                                                                                                      | Blocked by                               | Status |
| ----- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------ |
| 0     | Resolve the regulatory/liability question (§2) — at minimum, decide the disclaimer/positioning language everyone using this internally will see | Nothing — this is the actual first step | **Partially done (2026-08-01)** — the disclaimer/positioning language sub-task has shipped: centralized copy (`lib/disclaimers.ts`), a data-provenance caveat now on the shared-watchlist view, and a required signup acknowledgment (`User.consentedAt`). The broader regulatory-registration question below is still open — that part isn't something a code change can resolve. |
| 1     | `shares` collection + invite flow + read-only rendering for one resource type (start with watchlist)        | Nothing technically                      | **Built** (2026-07-28) — see `CLAUDE.md` "Sharing" section for what exists |
| 2     | Extend sharing to alerts (and anything else decided on) once the pattern from Phase 1 is proven              | Phase 1                                  | Not started |
| 3     | Only if rate-limiting from real usage becomes a recurring problem (§1): revisit a licensed data vendor        | Real-world signal, not a fixed date      | Not started |

Phase 1 being built does not resolve Phase 0. The code exists and works (invite, read-only view,
revoke all verified against real accounts), and the disclaimer/positioning-language half of Phase 0 has
now also shipped (see above) — but nothing about either of those answers whether an AI-driven research
tool reaching a CEO and brokers needs regulatory registration — that's still unanswered, and sharing
more of the app with more people inside the company makes that question more relevant, not less.

## 5. Open questions still unresolved

1. The regulatory/liability question in §2 — needs an actual answer before this goes live for the
   CEO/brokers, not just before it's "sold."
2. Which resources should be shareable — watchlist and alerts seem obvious; is paper trading in scope
   or does it stay strictly personal?
3. When an invited person views someone else's watchlist, do they see live quotes too (meaning their
   view also hits the free data providers, compounding the load in §1), or a lighter static snapshot?
