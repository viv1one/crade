import { yahooFreeProvider } from "./providers/yahoo-free";
import { nseFreeProvider } from "./providers/nse-free";
import { screenerInProvider } from "./providers/screener-in";
import { withFallback } from "./fallback-provider";
import { withHistoricalCache, withFundamentalsCache } from "./cached-provider";
import { withStaleQuoteFallback } from "./stale-fallback";
import { withCoalescing } from "./coalesce";
import type { MarketDataProvider } from "./types";

// Swap or extend this chain (e.g. add a Kite Connect / licensed-vendor
// provider ahead of these) without touching any call sites.
//
// screener-in is listed first specifically because it's currently the most
// reliable source of the three for getFundamentals (Yahoo's quoteSummary
// endpoint has been the least reliable data source in this app all
// session) — but its getQuote/getHistorical reject immediately with no
// network call, so putting it first costs nothing for those two methods;
// they fall through to yahoo-free (proven, but rate-limits under heavy
// use) essentially instantly. nse-free is the last resort.
//
// Composition, outer to inner: coalescing (dedupe identical concurrent
// calls) wraps caching (5-min historical, 6-hour fundamentals) wraps the
// stale-quote fallback (last resort when a live quote fetch fails) wraps
// the actual fallback chain.
export const marketData: MarketDataProvider = withCoalescing(
  withFundamentalsCache(
    withHistoricalCache(
      withStaleQuoteFallback(
        withFallback([screenerInProvider, yahooFreeProvider, nseFreeProvider])
      )
    )
  )
);

export * from "./types";
