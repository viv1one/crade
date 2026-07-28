import type { MarketDataProvider } from "./types";
import { getLastKnownQuote, setLastKnownQuote } from "./cache";

// Last resort for getQuote specifically — not a normal cache. On success,
// stashes the quote as "last known good" (fire-and-forget, doesn't block or
// fail the response). On failure, falls back to that last-known quote
// (marked `stale: true`, capped at 24h old — see cache.ts) instead of a
// hard error. Callers that price something off this (e.g. a paper-trade
// fill) must check `quote.stale` and refuse/warn rather than trade on it
// silently — this exists for read-only resilience during a provider
// outage, not to make degraded data look fresh.
export function withStaleQuoteFallback(provider: MarketDataProvider): MarketDataProvider {
  return {
    name: provider.name,
    getHistorical: (symbol, interval, range) => provider.getHistorical(symbol, interval, range),
    getFundamentals: (symbol) => provider.getFundamentals(symbol),
    async getQuote(symbol) {
      try {
        const quote = await provider.getQuote(symbol);
        setLastKnownQuote(quote).catch(() => {});
        return quote;
      } catch (err) {
        const stale = await getLastKnownQuote(symbol);
        if (stale) return stale;
        throw err;
      }
    },
  };
}
