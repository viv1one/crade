import type { MarketDataProvider } from "./types";
import {
  getCachedFundamentals,
  getCachedHistorical,
  setCachedFundamentals,
  setCachedHistorical,
} from "./cache";

// Wraps any MarketDataProvider so getHistorical results are read through the
// Mongo price_cache collection (TTL-checked in application code — the
// collection itself should also get a native Mongo TTL index on fetchedAt,
// see CLAUDE.md). Quotes are intentionally not cached: they back live trade
// prices in the paper-trading flow, so staleness there is misleading, not
// just inefficient.
export function withHistoricalCache(provider: MarketDataProvider): MarketDataProvider {
  return {
    name: provider.name,
    getQuote: (symbol) => provider.getQuote(symbol),
    getFundamentals: (symbol) => provider.getFundamentals(symbol),
    async getHistorical(symbol, interval, range) {
      const cached = await getCachedHistorical(symbol, interval, range);
      if (cached) return cached;
      const fresh = await provider.getHistorical(symbol, interval, range);
      await setCachedHistorical(symbol, interval, range, fresh, provider.name);
      return fresh;
    },
  };
}

// Fundamentals get their own (much longer) cache — see FUNDAMENTALS_TTL_MS
// in cache.ts. A failed getFundamentals call is never cached, so once the
// underlying endpoint recovers, the very next call repopulates it.
export function withFundamentalsCache(provider: MarketDataProvider): MarketDataProvider {
  return {
    name: provider.name,
    getQuote: (symbol) => provider.getQuote(symbol),
    getHistorical: (symbol, interval, range) => provider.getHistorical(symbol, interval, range),
    async getFundamentals(symbol) {
      const cached = await getCachedFundamentals(symbol);
      if (cached) return cached;
      const fresh = await provider.getFundamentals(symbol);
      await setCachedFundamentals(symbol, fresh, provider.name);
      return fresh;
    },
  };
}
