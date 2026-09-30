import { marketData } from "../market-data";
import { getNews } from "../news";
import { getSentiment } from "../sentiment";
import { getInsiderActivity } from "../insider";
import { NIFTY_50 } from "../screener/universe";
import { runTechnicalAnalyst, runFundamentalsAnalyst, runNewsAnalyst, runSentimentAnalyst } from "./analysts";
import { runResearchDebate } from "./research-debate";
import { runTrader } from "./trader";
import { runRiskDebate } from "./risk-debate";
import type { AgentPipelineResult, AnalystReports } from "./types";
import type { Checkpoints } from "./checkpoint";
import type { Fundamentals, HistoricalBar, Quote } from "../market-data/types";
import type { NewsItem } from "../news/types";
import type { InsiderTransaction } from "../insider/types";
import type { SentimentSnapshot } from "../sentiment/types";

function newsQueryFor(symbol: string): string {
  const known = NIFTY_50.find((s) => s.symbol === symbol);
  const name = known?.name ?? symbol.replace(/\.(NS|BO)$/i, "");
  return `${name} stock`;
}

interface FetchedData {
  quote: Quote;
  bars: HistoricalBar[];
  fundamentals: Fundamentals | null;
  news: NewsItem[];
  sentiment: SentimentSnapshot;
  insiderActivity: InsiderTransaction[] | null;
}

// Fetches every data input up front (parallel), degrading each fragile
// source independently rather than failing the whole pipeline over one —
// same discipline as lib/ai/context.ts's buildMarketContext and
// lib/portfolio/fetch.ts's fetchHoldingsData. Quote and historical bars are
// the one hard dependency (there's no meaningful analysis without them);
// everything else is best-effort.
async function fetchPipelineData(symbol: string): Promise<FetchedData> {
  const [quote, bars] = await Promise.all([
    marketData.getQuote(symbol),
    marketData.getHistorical(symbol, "1d", "3mo"),
  ]);

  const [fundamentals, news, sentiment, insiderActivity] = await Promise.all([
    marketData.getFundamentals(symbol).catch(() => null),
    getNews(newsQueryFor(symbol)).catch(() => [] as NewsItem[]),
    getSentiment(symbol).catch(
      () => ({ postCount: 0, avgScore: 0, topPosts: [], confidence: "low" }) as SentimentSnapshot
    ),
    getInsiderActivity(symbol).catch(() => null),
  ]);

  return { quote, bars, fundamentals, news, sentiment, insiderActivity };
}

// Called after each stage completes, with whatever's newly available —
// lets a caller (see app/api/agents/run/route.ts) persist progress
// incrementally so the UI can show live per-stage status instead of one
// blank wait for the whole ~5-minute run. Optional and purely additive:
// omitting it changes nothing about how the pipeline runs.
export type OnStage = (partial: Partial<AgentPipelineResult>) => Promise<void> | void;

// What a resumed run already has: whole-stage outputs saved by an earlier
// invocation (skipped outright) and per-AI-call checkpoints for the two
// multi-call stages (replayed from storage, so a stage cut off midway
// redoes only the calls after the last one that finished).
export interface ResumeState {
  result?: Partial<AgentPipelineResult>;
  checkpoints?: Checkpoints;
}

// Orchestrates the full TradingAgents-style pipeline for one symbol:
// Analyst Team (parallel) -> Researcher debate -> Trader -> Risk debate ->
// Fund Manager decision. ~12 chat() calls total, comparable to the paper's
// reported 11 per prediction (§5, footnote). See the approved plan for why
// this — uniquely among Crade's AI surfaces — ends in a directive
// buy/sell/hold call.
//
// Resumable: pass `resume` to continue a run that was cut off. Stages whose
// output is already in `resume.result` are not re-run (and the data fetch is
// skipped entirely when the analyst reports already exist).
export async function runTradingAgentsPipeline(
  symbol: string,
  onStage?: OnStage,
  resume?: ResumeState
): Promise<AgentPipelineResult> {
  const done = resume?.result ?? {};
  const cp = resume?.checkpoints;

  let reports = done.reports;
  if (!reports) {
    const data = await fetchPipelineData(symbol);
    const [technical, fundamentals, news, sentiment] = await Promise.all([
      runTechnicalAnalyst(symbol, data.quote, data.bars),
      runFundamentalsAnalyst(symbol, data.fundamentals ?? { symbol }, data.insiderActivity),
      runNewsAnalyst(symbol, data.news),
      runSentimentAnalyst(symbol, data.sentiment),
    ]);
    reports = { technical, fundamentals, news, sentiment } satisfies AnalystReports;
    await onStage?.({ reports });
  }

  let debate = done.debate;
  if (!debate) {
    debate = await runResearchDebate(symbol, reports, cp);
    await onStage?.({ debate });
  }

  let traderPlan = done.traderPlan;
  if (!traderPlan) {
    traderPlan = await runTrader(symbol, reports, debate);
    await onStage?.({ traderPlan });
  }

  let riskDebate = done.riskDebate;
  let finalDecision = done.finalDecision;
  if (!riskDebate || !finalDecision) {
    const risk = await runRiskDebate(symbol, reports, traderPlan, cp);
    riskDebate = risk.debate;
    finalDecision = risk.decision;
    await onStage?.({ riskDebate, finalDecision });
  }

  return {
    symbol,
    reports,
    debate,
    traderPlan,
    riskDebate,
    finalDecision,
    provider: "crade-trading-agents",
    model: "multi-agent-pipeline",
    generatedAt: new Date().toISOString(),
  };
}
