import { marketData } from "../market-data";

// Grounds the chat model in real numbers instead of letting it guess.
// Deliberately doesn't try to fake "current world affairs" — the model has
// no live news access, and having it improvise current events for a
// financial question is worse than it saying it doesn't know.
export async function buildMarketContext(symbol: string): Promise<string | null> {
  try {
    const [quote, bars] = await Promise.all([
      marketData.getQuote(symbol),
      marketData.getHistorical(symbol, "1d", "3mo"),
    ]);

    if (bars.length === 0) {
      return `Current data for ${symbol}: price ₹${quote.price.toFixed(2)}, ` +
        `${quote.change >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}% today. ` +
        `No historical bars available.`;
    }

    const closes = bars.map((b) => b.close);
    const periodLow = Math.min(...bars.map((b) => b.low));
    const periodHigh = Math.max(...bars.map((b) => b.high));
    const periodStart = closes[0];
    const periodChangePct = ((quote.price - periodStart) / periodStart) * 100;
    const recentCloses = closes.slice(-10).map((c) => c.toFixed(2)).join(", ");

    return [
      `Current data for ${symbol} (as of ${quote.asOf.toISOString()}):`,
      `- Price: ₹${quote.price.toFixed(2)} (${quote.change >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}% today)`,
      `- 3-month range: ₹${periodLow.toFixed(2)} - ₹${periodHigh.toFixed(2)}`,
      `- 3-month change: ${periodChangePct >= 0 ? "+" : ""}${periodChangePct.toFixed(2)}%`,
      `- Last ${Math.min(10, closes.length)} daily closes: ${recentCloses}`,
      `This is real market data. You have no access to current news, events, or anything not ` +
        `listed here — if the question needs that, say so explicitly instead of guessing.`,
    ].join("\n");
  } catch {
    return null;
  }
}
