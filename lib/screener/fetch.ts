import { marketData } from "../market-data";
import type { UniverseStock } from "./universe";
import type { ScreenerRow } from "./types";

const CONCURRENCY = 5;

async function fetchOne(stock: UniverseStock): Promise<ScreenerRow | null> {
  let quote;
  try {
    quote = await marketData.getQuote(stock.symbol);
  } catch {
    // No price at all means nothing useful to show for this row.
    return null;
  }

  // Fundamentals come from a separate, less reliable Yahoo endpoint
  // (quoteSummary, which has been observed returning 429s independent of
  // this app's request volume). A row with just price/change is still
  // useful, so a fundamentals failure shouldn't drop the whole row.
  let fundamentals: Awaited<ReturnType<typeof marketData.getFundamentals>> | null = null;
  try {
    fundamentals = await marketData.getFundamentals(stock.symbol);
  } catch {
    fundamentals = null;
  }

  return {
    symbol: stock.symbol,
    name: stock.name,
    sector: stock.sector,
    price: quote.price,
    changePercent: quote.changePercent,
    marketCap: fundamentals?.marketCap,
    peRatio: fundamentals?.peRatio,
    eps: fundamentals?.eps,
    dividendYield: fundamentals?.dividendYield,
  };
}

// Small worker-pool fetch instead of Promise.all(universe.map(...)) — many
// simultaneous requests against a free, keyless API is a good way to get
// rate-limited mid-scan. Takes the universe as a parameter (rather than
// hardcoding NIFTY_50) so it can also be called with a small slice of the
// full ~2,000-symbol NSE listing — see app/api/cron/refresh-screener/route.ts,
// which is the only caller that ever passes more than NIFTY_50-sized input;
// fetching the whole ~2,000-symbol universe in one call would run well past
// any reasonable request timeout, which is exactly why that route only ever
// passes a small slice at a time.
export async function fetchScreenerData(universe: UniverseStock[]): Promise<ScreenerRow[]> {
  const queue = [...universe];
  const rows: ScreenerRow[] = [];

  async function worker() {
    while (queue.length > 0) {
      const stock = queue.shift();
      if (!stock) break;
      const row = await fetchOne(stock);
      if (row) rows.push(row);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return rows;
}
