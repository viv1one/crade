import { marketData } from "../market-data";
import { NIFTY_50 } from "./universe";
import type { ScreenerRow } from "./types";

const CONCURRENCY = 5;

async function fetchOne(stock: (typeof NIFTY_50)[number]): Promise<ScreenerRow | null> {
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

// Small worker-pool fetch instead of Promise.all(NIFTY_50.map(...)) — 50
// simultaneous requests against a free, keyless API is a good way to get
// rate-limited mid-scan.
export async function fetchScreenerData(): Promise<ScreenerRow[]> {
  const queue = [...NIFTY_50];
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
