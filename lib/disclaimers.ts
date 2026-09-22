// Shared disclaimer copy so the same idea isn't independently (and
// inconsistently) worded in five different files. Compose these per-surface
// rather than rendering one giant blob — each surface only needs the
// pieces relevant to what it actually shows the user.

export const NOT_INVESTMENT_ADVICE =
  "Not investment advice — for personal research only.";

export const FREE_DATA_SOURCE =
  "Data comes from free, unauthenticated providers (Yahoo Finance / NSE) — prototyping only, not licensed for redistribution to other users.";

export const PAPER_TRADING_ONLY =
  "Buy/Sell are simulated paper trades, not real orders — Crade has no broker connection.";

export const MANUAL_HOLDINGS_ONLY =
  "You enter these manually — Crade doesn't connect to your broker, verify them, or place any trades.";

export const BACKTESTED_NOT_PREDICTIVE =
  "Ranked by backtested historical performance only — no strategy here is a forecast of future returns, and past performance never guarantees future results.";

export const DIAGNOSTICS_NOT_PREDICTIVE =
  "Concentration, sector, and factor reads on your current holdings only — not a forecast of future returns or profit, and not investment advice.";

// Unlike every other AI surface in this app, the Trading Agents pipeline
// deliberately ends in a directive buy/sell/hold call (see lib/agents/) —
// this disclaimer is stronger and more explicit than the others on purpose,
// and is shown directly under the decision itself, not just once at the
// bottom of the page.
export const AGENT_DECISION_NOT_ADVICE =
  "AI-generated simulated analysis for personal research only — not SEBI-registered investment advice, and Crade has no broker connection. Nothing here is a recommendation to trade real money.";
