import { describe, expect, it, vi } from "vitest";
import { withFallback } from "./fallback-provider";
import type { MarketDataProvider, Quote } from "./types";

function makeQuote(price: number): Quote {
  return { symbol: "X", price, change: 0, changePercent: 0, volume: 0, asOf: new Date() };
}

function makeProvider(name: string, overrides: Partial<MarketDataProvider> = {}): MarketDataProvider {
  return {
    name,
    getQuote: vi.fn().mockRejectedValue(new Error(`${name} quote failed`)),
    getHistorical: vi.fn().mockRejectedValue(new Error(`${name} historical failed`)),
    getFundamentals: vi.fn().mockRejectedValue(new Error(`${name} fundamentals failed`)),
    ...overrides,
  };
}

describe("withFallback", () => {
  it("returns the first provider's result when it succeeds", async () => {
    const first = makeProvider("first", { getQuote: vi.fn().mockResolvedValue(makeQuote(1)) });
    const second = makeProvider("second");
    const combined = withFallback([first, second]);

    const quote = await combined.getQuote("X");
    expect(quote.price).toBe(1);
    expect(second.getQuote).not.toHaveBeenCalled();
  });

  it("falls through to the next provider when the first fails", async () => {
    const first = makeProvider("first");
    const second = makeProvider("second", { getQuote: vi.fn().mockResolvedValue(makeQuote(2)) });
    const combined = withFallback([first, second]);

    const quote = await combined.getQuote("X");
    expect(quote.price).toBe(2);
  });

  it("throws once every provider fails", async () => {
    const combined = withFallback([makeProvider("first"), makeProvider("second")]);
    await expect(combined.getQuote("X")).rejects.toThrow(/all market data providers failed/i);
  });

  it("tries each method independently", async () => {
    const first = makeProvider("first", { getQuote: vi.fn().mockResolvedValue(makeQuote(1)) });
    const second = makeProvider("second", {
      getHistorical: vi.fn().mockResolvedValue([{ time: 0, open: 1, high: 1, low: 1, close: 1, volume: 0 }]),
    });
    const combined = withFallback([first, second]);

    await combined.getQuote("X");
    const bars = await combined.getHistorical("X", "1d", "1y");
    expect(bars).toHaveLength(1);
  });
});
