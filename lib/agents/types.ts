// Mirrors the TradingAgents paper's role split (Analyst Team → Researcher
// debate → Trader → Risk Management debate → Fund Manager), adapted onto
// Crade's already-integrated data sources. See lib/agents/pipeline.ts for
// the orchestration and CLAUDE.md / the approved plan for the full
// rationale, including why this pipeline (unlike every other AI surface in
// this app) ends in a directive recommendation.

export interface AnalystReports {
  technical: string;
  fundamentals: string;
  news: string;
  sentiment: string;
}

export interface DebateResult {
  bullCase: string;
  bearCase: string;
  prevailing: "bull" | "bear";
  summary: string;
}

// "review" (not a 4th tradeable action) is what a stage returns when its
// model output couldn't be parsed into a real decision — see
// lib/agents/parse-decision.ts. Borrowed directly from TauricResearch's own
// TradingAgents repo (agents/utils/rating.py's RATING_REVIEW): silently
// defaulting an unparseable decision to "hold" makes a parsing failure
// indistinguishable from a genuine considered Hold call, which is worse
// than surfacing the failure. The UI treats "review" as non-tradeable, same
// as "hold".
export type TradeAction = "buy" | "sell" | "hold" | "review";

// Shared `badge-*` class (see app/globals.css) per action, so every place
// that renders a verdict badge (the Trading Agents history list, Watchlist
// rows) uses the identical mapping rather than each hand-rolling its own
// ternary and risking drift.
export const VERDICT_BADGE_CLASS: Record<TradeAction, string> = {
  buy: "badge-success",
  sell: "badge-danger",
  hold: "badge-neutral",
  review: "badge-warning",
};

export interface TraderPlan {
  action: TradeAction;
  reasoning: string;
  // Absolute price levels in rupees, not percentages — omitted when the
  // model can't state a concrete number. See runTrader's prompt.
  entryPrice?: number;
  stopLoss?: number;
}

export interface RiskDebateResult {
  risky: string;
  safe: string;
  neutral: string;
}

export interface FinalDecision {
  action: TradeAction;
  confidence: "low" | "medium" | "high";
  rationale: string;
}

export interface AgentPipelineResult {
  symbol: string;
  reports: AnalystReports;
  debate: DebateResult;
  traderPlan: TraderPlan;
  riskDebate: RiskDebateResult;
  finalDecision: FinalDecision;
  provider: string;
  model: string;
  generatedAt: string; // ISO string
}
