import { yahooFreeProvider } from "./providers/yahoo-free";
import { nseFreeProvider } from "./providers/nse-free";
import { withFallback } from "./fallback-provider";
import { withHistoricalCache, withFundamentalsCache } from "./cached-provider";
import { withStaleQuoteFallback } from "./stale-fallback";
import { withCoalescing } from "./coalesce";
import type { MarketDataProvider } from "./types";

// Swap or extend this chain (e.g. add a Kite Connect / licensed-vendor
// provider ahead of these) without touching any call sites. yahoo-free is
// tried first (proven, but rate-limits under heavy use); nse-free is the
// fallback so a rate-limit on one doesn't block the app entirely.
//
// Composition, outer to inner: coalescing (dedupe identical concurrent
// calls) wraps caching (5-min historical, 6-hour fundamentals) wraps the
// stale-quote fallback (last resort when a live quote fetch fails) wraps
// the actual fallback chain.
export const marketData: MarketDataProvider = withCoalescing(
  withFundamentalsCache(
    withHistoricalCache(withStaleQuoteFallback(withFallback([yahooFreeProvider, nseFreeProvider])))
  )
);

export * from "./types";
