import type { MarketDataProvider } from "./types";

// Dedupes identical concurrent calls onto a single in-flight promise — e.g.
// the dashboard's watchlist and market-movers widgets both loading a quote
// for the same symbol at page load become one network request instead of
// two. Free (no external dependency), purely reduces redundant load on
// providers that are already fragile under load. Per-process only — this
// doesn't survive a redeploy or coordinate across server instances, which
// is fine for what it's for (smoothing a burst of near-simultaneous calls,
// not a durable cache).
export function withCoalescing(provider: MarketDataProvider): MarketDataProvider {
  const inFlight = new Map<string, Promise<unknown>>();

  function coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = inFlight.get(key);
    if (existing) return existing as Promise<T>;
    const promise = fn().finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  }

  return {
    name: provider.name,
    getQuote: (symbol) => coalesce(`quote:${symbol}`, () => provider.getQuote(symbol)),
    getHistorical: (symbol, interval, range) =>
      coalesce(`hist:${symbol}:${interval}:${range}`, () =>
        provider.getHistorical(symbol, interval, range)
      ),
    getFundamentals: (symbol) => coalesce(`fund:${symbol}`, () => provider.getFundamentals(symbol)),
  };
}
