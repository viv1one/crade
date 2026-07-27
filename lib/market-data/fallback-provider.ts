import type { MarketDataProvider } from "./types";

// Tries each provider in order per-call, moving to the next on any error —
// mirrors the fallback-chain pattern lib/ai/router.ts uses for AI providers.
// Each method is tried independently, so e.g. a quote can succeed on the
// first provider while historical data falls through to the second.
export function withFallback(providers: MarketDataProvider[]): MarketDataProvider {
  if (providers.length === 0) {
    throw new Error("withFallback requires at least one provider");
  }

  async function tryEach<T>(fn: (p: MarketDataProvider) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (const provider of providers) {
      try {
        return await fn(provider);
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(`All market data providers failed: ${lastError}`);
  }

  return {
    name: providers.map((p) => p.name).join("+"),
    getQuote: (symbol) => tryEach((p) => p.getQuote(symbol)),
    getHistorical: (symbol, interval, range) => tryEach((p) => p.getHistorical(symbol, interval, range)),
    getFundamentals: (symbol) => tryEach((p) => p.getFundamentals(symbol)),
  };
}
