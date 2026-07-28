import { afterEach, describe, expect, it, vi } from "vitest";
import { withStaleQuoteFallback } from "./stale-fallback";
import type { MarketDataProvider, Quote } from "./types";

vi.mock("./cache", () => ({
  getLastKnownQuote: vi.fn(),
  setLastKnownQuote: vi.fn().mockResolvedValue(undefined),
}));

import { getLastKnownQuote, setLastKnownQuote } from "./cache";

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    symbol: "TCS.NS",
    price: 100,
    change: 1,
    changePercent: 1,
    volume: 1000,
    asOf: new Date(),
    ...overrides,
  };
}

describe("withStaleQuoteFallback", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the live quote on success and stashes it as last-known", async () => {
    const liveQuote = makeQuote();
    const provider: MarketDataProvider = {
      name: "mock",
      getQuote: vi.fn().mockResolvedValue(liveQuote),
      getHistorical: vi.fn(),
      getFundamentals: vi.fn(),
    };

    const result = await withStaleQuoteFallback(provider).getQuote("TCS.NS");
    expect(result).toBe(liveQuote);
    expect(result.stale).toBeUndefined();
    expect(setLastKnownQuote).toHaveBeenCalledWith(liveQuote);
  });

  it("falls back to the last-known quote, marked stale, when the live fetch fails", async () => {
    const provider: MarketDataProvider = {
      name: "mock",
      getQuote: vi.fn().mockRejectedValue(new Error("provider down")),
      getHistorical: vi.fn(),
      getFundamentals: vi.fn(),
    };
    vi.mocked(getLastKnownQuote).mockResolvedValue(makeQuote({ price: 95, stale: true }));

    const result = await withStaleQuoteFallback(provider).getQuote("TCS.NS");
    expect(result.stale).toBe(true);
    expect(result.price).toBe(95);
  });

  it("rethrows the original error when there is no last-known quote either", async () => {
    const provider: MarketDataProvider = {
      name: "mock",
      getQuote: vi.fn().mockRejectedValue(new Error("provider down")),
      getHistorical: vi.fn(),
      getFundamentals: vi.fn(),
    };
    vi.mocked(getLastKnownQuote).mockResolvedValue(null);

    await expect(withStaleQuoteFallback(provider).getQuote("TCS.NS")).rejects.toThrow(
      "provider down"
    );
  });
});
