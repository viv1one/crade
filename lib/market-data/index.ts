import { yahooFreeProvider } from "./providers/yahoo-free";
import type { MarketDataProvider } from "./types";

// Swap or extend this chain (e.g. add a Kite Connect / licensed-vendor
// provider ahead of yahoo-free) without touching any call sites.
export const marketData: MarketDataProvider = yahooFreeProvider;

export * from "./types";
