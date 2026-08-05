import { jugaadDataProvider } from "./providers/jugaad-data";
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
// jugaad-data is listed first — verified live to actually get through NSE
// (quotes, historical bars, and real P/E + market cap, no scraping) from a
// dev environment where nse-free.ts's own hand-rolled session-cookie
// handling was previously observed blocked at Akamai's edge. It's primary
// by data quality, not by availability: it shells out to a local python3
// (see lib/market-data/providers/jugaad-data.ts), which doesn't exist on
// Vercel's Node serverless functions, so in production its very first call
// fails fast and withFallback() below just moves on — production runs on
// the same screener-in/yahoo/nse-free chain as before, dev additionally
// gets jugaad-data's better data with zero prod-side risk.
//
// screener-in is listed second because among the free HTTP-only sources
// it's the most reliable for getFundamentals (Yahoo's quoteSummary
// endpoint has been the least reliable data source in this app all
// session) — but its getQuote/getHistorical reject immediately with no
// network call, so keeping it ahead of yahoo-free costs nothing for those
// two methods; they fall through to yahoo-free (proven, but rate-limits
// under heavy use) essentially instantly. nse-free is the last resort.
//
// Composition, outer to inner: coalescing (dedupe identical concurrent
// calls) wraps caching (5-min historical, 6-hour fundamentals) wraps the
// stale-quote fallback (last resort when a live quote fetch fails) wraps
// the actual fallback chain.
export const marketData: MarketDataProvider = withCoalescing(
  withFundamentalsCache(
    withHistoricalCache(
      withStaleQuoteFallback(
        withFallback([jugaadDataProvider, screenerInProvider, yahooFreeProvider, nseFreeProvider])
      )
    )
  )
);

export * from "./types";
