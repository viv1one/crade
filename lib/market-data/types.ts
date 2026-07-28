export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  asOf: Date;
  // Set when this is a last-known-good quote served because a live fetch
  // failed (see withStaleQuoteFallback) — never set on a genuinely live
  // quote. Callers that use this for anything price-sensitive (e.g. a
  // paper-trade fill) should check this and refuse/warn, not trade on it
  // silently.
  stale?: boolean;
}

export interface HistoricalBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Fundamentals {
  symbol: string;
  marketCap?: number;
  peRatio?: number;
  eps?: number;
  dividendYield?: number;
}

export interface MarketDataProvider {
  name: string;
  getQuote(symbol: string): Promise<Quote>;
  getHistorical(
    symbol: string,
    interval: string,
    range: string
  ): Promise<HistoricalBar[]>;
  getFundamentals(symbol: string): Promise<Fundamentals>;
}
