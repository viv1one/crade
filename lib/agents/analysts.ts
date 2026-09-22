import { chat } from "../ai";
import { sma, rsi, rollingHigh, rollingLow, volatility } from "../backtest/indicators";
import type { HistoricalBar, Fundamentals, Quote } from "../market-data/types";
import type { NewsItem } from "../news/types";
import type { SentimentSnapshot } from "../sentiment/types";
import type { InsiderTransaction } from "../insider/types";

// Each analyst is one `chat()` call (task "agent_report", fast tier first —
// see lib/ai/router.ts) that narrates data already fetched by the caller
// (lib/agents/pipeline.ts) rather than fetching or inventing anything
// itself. This mirrors the paper's quick-thinking-model split (§4.3) and
// the same anti-fabrication discipline already proven in
// lib/ai/context.ts's buildMarketContext: the model is told explicitly to
// only describe the numbers/text given, and to say so plainly if a section
// has no data rather than guessing.
const BASE_INSTRUCTION =
  "Only describe the data given below — never invent numbers, headlines, or events not present in " +
  "it. If a section says no data was available, say so plainly rather than guessing. Keep the report " +
  "to a few short paragraphs.";

async function narrate(role: string, dataText: string): Promise<string> {
  const result = await chat(
    [
      {
        role: "system",
        content: `You are the ${role} on a stock-research analyst team. ${BASE_INSTRUCTION}`,
      },
      { role: "user", content: dataText },
    ],
    { task: "agent_report" }
  );
  return result.content;
}

export async function runTechnicalAnalyst(symbol: string, quote: Quote, bars: HistoricalBar[]): Promise<string> {
  if (bars.length === 0) {
    return narrate("Technical Analyst", `No historical bars are available for ${symbol}.`);
  }

  const smaValues = sma(bars, 20);
  const rsiValues = rsi(bars, 14);
  const highValues = rollingHigh(bars, 20);
  const lowValues = rollingLow(bars, 20);
  const volValues = volatility(bars, 20);
  const last = bars.length - 1;

  const lines = [
    `Technical data for ${symbol} as of ${quote.asOf.toISOString()}:`,
    `- Price: ₹${quote.price.toFixed(2)} (${quote.change >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}% today)`,
    smaValues[last] != null ? `- 20-day SMA: ₹${smaValues[last]!.toFixed(2)}` : "- 20-day SMA: not enough data",
    rsiValues[last] != null ? `- 14-day RSI: ${rsiValues[last]!.toFixed(1)}` : "- 14-day RSI: not enough data",
    highValues[last] != null ? `- 20-day rolling high: ₹${highValues[last]!.toFixed(2)}` : "- 20-day rolling high: not enough data",
    lowValues[last] != null ? `- 20-day rolling low: ₹${lowValues[last]!.toFixed(2)}` : "- 20-day rolling low: not enough data",
    volValues[last] != null
      ? `- 20-day volatility (stdev of daily log returns): ${(volValues[last]! * 100).toFixed(2)}%`
      : "- 20-day volatility: not enough data",
    `- Last 10 closes: ${bars.slice(-10).map((b) => b.close.toFixed(2)).join(", ")}`,
  ];
  return narrate("Technical Analyst", lines.join("\n"));
}

export async function runFundamentalsAnalyst(
  symbol: string,
  fundamentals: Fundamentals,
  insiderActivity: InsiderTransaction[] | null
): Promise<string> {
  const lines = [`Fundamentals data for ${symbol}:`];
  if (fundamentals.peRatio != null) lines.push(`- P/E ratio: ${fundamentals.peRatio.toFixed(1)}`);
  if (fundamentals.marketCap != null) lines.push(`- Market cap: ₹${(fundamentals.marketCap / 1e7).toFixed(0)} crore`);
  if (fundamentals.eps != null) lines.push(`- EPS: ₹${fundamentals.eps.toFixed(2)}`);
  if (fundamentals.dividendYield != null) lines.push(`- Dividend yield: ${(fundamentals.dividendYield * 100).toFixed(2)}%`);
  if (lines.length === 1) lines.push("- No fundamentals data was available.");

  if (insiderActivity == null) {
    lines.push("\nInsider trading disclosures: not available for this request.");
  } else if (insiderActivity.length === 0) {
    lines.push("\nInsider trading disclosures: none found in the recent disclosure window.");
  } else {
    lines.push("\nRecent insider trading disclosures (NSE PIT filings):");
    for (const t of insiderActivity.slice(0, 10)) {
      lines.push(
        `- ${new Date(t.date).toLocaleDateString()}: ${t.personName}${t.category ? ` (${t.category})` : ""} — ` +
          `${t.transactionType}${t.quantity != null ? ` ${t.quantity.toLocaleString()} shares` : ""}`
      );
    }
  }

  return narrate("Fundamentals Analyst", lines.join("\n"));
}

export async function runNewsAnalyst(symbol: string, news: NewsItem[]): Promise<string> {
  if (news.length === 0) {
    return narrate("News Analyst", `No recent headlines were available for ${symbol}.`);
  }
  const lines = [
    `Recent headlines for ${symbol} (titles only, not full articles — don't claim to know more than ` +
      `a headline states):`,
    ...news.map((n) => `- "${n.title}" — ${n.source}, ${new Date(n.publishedAt).toLocaleDateString()}`),
  ];
  return narrate("News Analyst", lines.join("\n"));
}

export async function runSentimentAnalyst(symbol: string, sentiment: SentimentSnapshot): Promise<string> {
  if (sentiment.postCount === 0) {
    return narrate(
      "Sentiment Analyst",
      `No recent Reddit discussion was found for ${symbol} in the searched subreddits. Say plainly ` +
        `that there isn't enough social data to characterize sentiment right now.`
    );
  }
  const lines = [
    `Reddit sentiment data for ${symbol} (r/IndianStreetBets, r/IndiaInvestments, ` +
      `r/IndianStockMarket):`,
    `- ${sentiment.postCount} recent posts found`,
    `- Average lexicon-based sentiment score: ${sentiment.avgScore.toFixed(2)} (-1 very negative to +1 very positive)`,
    `- Confidence in this read: ${sentiment.confidence} (based on sample size, not sentiment direction — ` +
      `explicitly say the read is low-confidence if this says "low" rather than stating it plainly)`,
    "- Top posts by upvotes:",
    ...sentiment.topPosts.map((p) => `  - "${p.title}" (post sentiment ${p.score.toFixed(2)})`),
  ];
  return narrate("Sentiment Analyst", lines.join("\n"));
}
