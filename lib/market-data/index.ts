import { yahooFreeProvider } from "./providers/yahoo-free";
import { nseFreeProvider } from "./providers/nse-free";
import { withFallback } from "./fallback-provider";
import { withHistoricalCache, withFundamentalsCache } from "./cached-provider";
import type { MarketDataProvider } from "./types";

// Swap or extend this chain (e.g. add a Kite Connect / licensed-vendor
// provider ahead of these) without touching any call sites. yahoo-free is
// tried first (proven, but rate-limits under heavy use); nse-free is the
// fallback so a rate-limit on one doesn't block the app entirely.
export const marketData: MarketDataProvider = withFundamentalsCache(
  withHistoricalCache(withFallback([yahooFreeProvider, nseFreeProvider]))
);

export * from "./types";
