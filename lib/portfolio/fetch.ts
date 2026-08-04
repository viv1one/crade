import { marketData } from "../market-data";
import type { Fundamentals, HistoricalBar } from "../market-data/types";
import { NIFTY_50 } from "../screener/universe";

const CONCURRENCY = 5;

export interface HoldingsMarketData {
  prices: Record<string, number>;
  bars: Record<string, HistoricalBar[]>;
  fundamentals: Record<string, Fundamentals | undefined>;
}

// Small worker-pool fetch, same queue+worker shape as
// lib/screener/fetch.ts's fetchScreenerData (holdings lists are usually
// short, but this keeps behavior consistent against the free provider if
// someone accumulates many positions). A quote/history failure just omits
// that symbol's price/bars — computePortfolioDiagnostics falls back to
// avgCost and treats missing bars as "not available," never as zero.
export async function fetchHoldingsData(symbols: string[]): Promise<HoldingsMarketData> {
  const prices: Record<string, number> = {};
  const bars: Record<string, HistoricalBar[]> = {};
  const fundamentals: Record<string, Fundamentals | undefined> = {};
  const queue = [...symbols];

  async function worker() {
    while (queue.length > 0) {
      const symbol = queue.shift();
      if (!symbol) break;

      try {
        const [quote, history] = await Promise.all([
          marketData.getQuote(symbol),
          marketData.getHistorical(symbol, "1d", "1y"),
        ]);
        prices[symbol] = quote.price;
        bars[symbol] = history;
      } catch {
        // No live price/history — diagnostics falls back to avgCost and
        // reports return/volatility as not available for this symbol.
      }

      try {
        fundamentals[symbol] = await marketData.getFundamentals(symbol);
      } catch {
        fundamentals[symbol] = undefined;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, worker)
  );
  return { prices, bars, fundamentals };
}

export interface UniverseMarketData {
  barsBySymbol: Record<string, HistoricalBar[]>;
  fundamentalsBySymbol: Record<string, Fundamentals | undefined>;
}

// Same worker-pool shape, but over the full NIFTY_50 universe (~50 symbols,
// 2 requests each) rather than a handful of held symbols — deliberately
// only called for the opt-in "deep" factor-tilt analysis
// (lib/portfolio/factor-tilt.ts), never on the default diagnostics path,
// since this is meaningfully more expensive against the free provider. No
// quote fetch here — factor scoring only needs bars/fundamentals, not a
// live price.
export async function fetchUniverseData(): Promise<UniverseMarketData> {
  const barsBySymbol: Record<string, HistoricalBar[]> = {};
  const fundamentalsBySymbol: Record<string, Fundamentals | undefined> = {};
  const queue = [...NIFTY_50];

  async function worker() {
    while (queue.length > 0) {
      const stock = queue.shift();
      if (!stock) break;

      try {
        barsBySymbol[stock.symbol] = await marketData.getHistorical(stock.symbol, "1d", "1y");
      } catch {
        // Omitted — computeFactorTilts treats a missing symbol as
        // unscoreable, not zero.
      }

      try {
        fundamentalsBySymbol[stock.symbol] = await marketData.getFundamentals(stock.symbol);
      } catch {
        fundamentalsBySymbol[stock.symbol] = undefined;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { barsBySymbol, fundamentalsBySymbol };
}
