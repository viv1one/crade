import { marketData } from "../market-data";
import { getNews } from "../news";
import { NIFTY_50 } from "../screener/universe";

function newsQueryFor(symbol: string): string {
  const known = NIFTY_50.find((s) => s.symbol === symbol);
  const name = known?.name ?? symbol.replace(/\.(NS|BO)$/i, "");
  return `${name} stock`;
}

function formatFundamentals(f: Awaited<ReturnType<typeof marketData.getFundamentals>>): string | null {
  const lines: string[] = [];
  if (f.peRatio != null) lines.push(`- P/E ratio: ${f.peRatio.toFixed(1)}`);
  if (f.marketCap != null) lines.push(`- Market cap: ₹${(f.marketCap / 1e7).toFixed(0)} crore`);
  if (f.eps != null) lines.push(`- EPS: ₹${f.eps.toFixed(2)}`);
  if (f.dividendYield != null) lines.push(`- Dividend yield: ${(f.dividendYield * 100).toFixed(2)}%`);
  return lines.length > 0 ? lines.join("\n") : null;
}

// Grounds the chat model in real numbers (price, fundamentals, and now real
// headlines) instead of letting it improvise. News comes from a live feed
// (see lib/news/), so the model can actually reference current events for
// once — but it only ever sees headlines, not full articles, so it's told
// not to claim deeper analysis than a headline supports. Fundamentals are
// the least reliable field on this provider (see lib/market-data/providers/
// yahoo-free.ts) so they're included only when actually available, same
// graceful-degradation pattern as the screener.
export async function buildMarketContext(symbol: string): Promise<string | null> {
  try {
    const [quote, bars] = await Promise.all([
      marketData.getQuote(symbol),
      marketData.getHistorical(symbol, "1d", "3mo"),
    ]);

    let fundamentalsSection = "";
    try {
      const fundamentals = await marketData.getFundamentals(symbol);
      const formatted = formatFundamentals(fundamentals);
      if (formatted) {
        fundamentalsSection = `\n\nFundamentals for ${symbol}:\n${formatted}`;
      }
    } catch {
      // Fundamentals are the most fragile data source here — proceed
      // without them rather than failing the whole context.
    }

    let newsSection = "";
    try {
      const news = await getNews(newsQueryFor(symbol));
      if (news.length > 0) {
        const lines = news.map(
          (n) => `- "${n.title}" — ${n.source}, ${new Date(n.publishedAt).toLocaleDateString()}`
        );
        newsSection =
          `\n\nRecent headlines for ${symbol} (titles only, not full articles — don't claim to ` +
          `know more than a headline states):\n${lines.join("\n")}`;
      }
    } catch {
      // News is a bonus, not a hard dependency — fall through without it.
    }

    const trailer = newsSection
      ? `This is real market data and recent headlines. For anything beyond what's given here ` +
        `(e.g. specifics a headline doesn't cover), say so explicitly instead of guessing.`
      : `This is real market data. No current news was available for this request — if the ` +
        `question needs that, say so explicitly instead of guessing.`;

    if (bars.length === 0) {
      return (
        `Current data for ${symbol}: price ₹${quote.price.toFixed(2)}, ` +
        `${quote.change >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}% today. ` +
        `No historical bars available.${fundamentalsSection}${newsSection}\n\n${trailer}`
      );
    }

    const closes = bars.map((b) => b.close);
    const periodLow = Math.min(...bars.map((b) => b.low));
    const periodHigh = Math.max(...bars.map((b) => b.high));
    const periodStart = closes[0];
    const periodChangePct = ((quote.price - periodStart) / periodStart) * 100;
    const recentCloses = closes.slice(-10).map((c) => c.toFixed(2)).join(", ");

    return (
      [
        `Current data for ${symbol} (as of ${quote.asOf.toISOString()}):`,
        `- Price: ₹${quote.price.toFixed(2)} (${quote.change >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}% today)`,
        `- 3-month range: ₹${periodLow.toFixed(2)} - ₹${periodHigh.toFixed(2)}`,
        `- 3-month change: ${periodChangePct >= 0 ? "+" : ""}${periodChangePct.toFixed(2)}%`,
        `- Last ${Math.min(10, closes.length)} daily closes: ${recentCloses}`,
      ].join("\n") +
      fundamentalsSection +
      newsSection +
      `\n\n${trailer}`
    );
  } catch {
    return null;
  }
}
