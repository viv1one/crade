import type {
  Fundamentals,
  HistoricalBar,
  MarketDataProvider,
  Quote,
} from "../types";

// Free, keyless fallback for prototyping only — Yahoo Finance's public chart
// endpoint, not licensed for redistribution. Swap for Kite Connect or a
// licensed vendor (Global Datafeeds, TrueData) before showing data to
// anyone other than yourself. See plan §4.
const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const QUOTE_SUMMARY_URL =
  "https://query1.finance.yahoo.com/v10/finance/quoteSummary";

export const yahooFreeProvider: MarketDataProvider = {
  name: "yahoo-free",

  async getQuote(symbol: string): Promise<Quote> {
    const res = await fetch(`${CHART_URL}/${symbol}?range=1d&interval=1m`);
    if (!res.ok) {
      throw new Error(`yahoo-free getQuote failed for ${symbol}: ${res.status}`);
    }
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) {
      throw new Error(`yahoo-free getQuote: no data for ${symbol}`);
    }
    const meta = result.meta;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose;
    return {
      symbol,
      price,
      change: price - prevClose,
      changePercent: ((price - prevClose) / prevClose) * 100,
      volume: meta.regularMarketVolume ?? 0,
      asOf: new Date(meta.regularMarketTime * 1000),
    };
  },

  async getHistorical(
    symbol: string,
    interval: string,
    range: string
  ): Promise<HistoricalBar[]> {
    const res = await fetch(
      `${CHART_URL}/${symbol}?interval=${interval}&range=${range}`
    );
    if (!res.ok) {
      throw new Error(
        `yahoo-free getHistorical failed for ${symbol}: ${res.status}`
      );
    }
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) {
      throw new Error(`yahoo-free getHistorical: no data for ${symbol}`);
    }
    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0] ?? {};
    return timestamps
      .map((time, i) => ({
        time,
        open: quote.open?.[i],
        high: quote.high?.[i],
        low: quote.low?.[i],
        close: quote.close?.[i],
        volume: quote.volume?.[i],
      }))
      .filter(
        (bar): bar is HistoricalBar =>
          bar.open != null && bar.close != null
      );
  },

  async getFundamentals(symbol: string): Promise<Fundamentals> {
    const modules = "defaultKeyStatistics,summaryDetail";
    const res = await fetch(
      `${QUOTE_SUMMARY_URL}/${symbol}?modules=${modules}`
    );
    if (!res.ok) {
      throw new Error(
        `yahoo-free getFundamentals failed for ${symbol}: ${res.status}`
      );
    }
    const json = await res.json();
    const result = json.quoteSummary?.result?.[0];
    const stats = result?.defaultKeyStatistics ?? {};
    const summary = result?.summaryDetail ?? {};
    return {
      symbol,
      marketCap: summary.marketCap?.raw,
      peRatio: summary.trailingPE?.raw,
      eps: stats.trailingEps?.raw,
      dividendYield: summary.dividendYield?.raw,
    };
  },
};
