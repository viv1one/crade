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

// Orchestrates the full TradingAgents-style pipeline for one symbol:
// Analyst Team (parallel) -> Researcher debate -> Trader -> Risk debate ->
// Fund Manager decision. ~12 chat() calls total, comparable to the paper's
// reported 11 per prediction (§5, footnote). See the approved plan for why
// this — uniquely among Crade's AI surfaces — ends in a directive
// buy/sell/hold call.
export async function runTradingAgentsPipeline(symbol: string): Promise<AgentPipelineResult> {
  const data = await fetchPipelineData(symbol);

  const [technical, fundamentals, news, sentiment] = await Promise.all([
    runTechnicalAnalyst(symbol, data.quote, data.bars),
    runFundamentalsAnalyst(symbol, data.fundamentals ?? { symbol }, data.insiderActivity),
    runNewsAnalyst(symbol, data.news),
    runSentimentAnalyst(symbol, data.sentiment),
  ]);
  const reports: AnalystReports = { technical, fundamentals, news, sentiment };

  const debate = await runResearchDebate(symbol, reports);
  const traderPlan = await runTrader(symbol, reports, debate);
  const { debate: riskDebate, decision: finalDecision } = await runRiskDebate(symbol, reports, traderPlan);

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
