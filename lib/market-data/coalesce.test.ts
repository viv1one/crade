import { describe, expect, it, vi } from "vitest";
import { withCoalescing } from "./coalesce";
import type { MarketDataProvider, Quote } from "./types";

function makeProvider(): { provider: MarketDataProvider; getQuoteMock: ReturnType<typeof vi.fn> } {
  const getQuoteMock = vi.fn(
    (symbol: string) =>
      new Promise<Quote>((resolve) =>
        setTimeout(
          () =>
            resolve({
              symbol,
              price: 100,
              change: 1,
              changePercent: 1,
              volume: 1000,
              asOf: new Date(),
            }),
          10
        )
      )
  );
  const provider: MarketDataProvider = {
    name: "mock",
    getQuote: getQuoteMock,
    getHistorical: vi.fn().mockResolvedValue([]),
    getFundamentals: vi.fn().mockResolvedValue({ symbol: "X" }),
  };
  return { provider, getQuoteMock };
}

describe("withCoalescing", () => {
  it("dedupes concurrent calls for the same symbol into one underlying call", async () => {
    const { provider, getQuoteMock } = makeProvider();
    const coalesced = withCoalescing(provider);

    const [a, b, c] = await Promise.all([
      coalesced.getQuote("TCS.NS"),
      coalesced.getQuote("TCS.NS"),
      coalesced.getQuote("TCS.NS"),
    ]);

    expect(getQuoteMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("does not dedupe calls for different symbols", async () => {
    const { provider, getQuoteMock } = makeProvider();
    const coalesced = withCoalescing(provider);

    await Promise.all([coalesced.getQuote("TCS.NS"), coalesced.getQuote("INFY.NS")]);
    expect(getQuoteMock).toHaveBeenCalledTimes(2);
  });

  it("allows a fresh call after the in-flight one resolves", async () => {
    const { provider, getQuoteMock } = makeProvider();
    const coalesced = withCoalescing(provider);

    await coalesced.getQuote("TCS.NS");
    await coalesced.getQuote("TCS.NS");
    expect(getQuoteMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache a rejection — a failed call doesn't poison later calls", async () => {
    const provider: MarketDataProvider = {
      name: "mock",
      getQuote: vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce({
          symbol: "TCS.NS",
          price: 100,
          change: 1,
          changePercent: 1,
          volume: 1000,
          asOf: new Date(),
        }),
      getHistorical: vi.fn(),
      getFundamentals: vi.fn(),
    };
    const coalesced = withCoalescing(provider);

    await expect(coalesced.getQuote("TCS.NS")).rejects.toThrow("fail");
    await expect(coalesced.getQuote("TCS.NS")).resolves.toMatchObject({ price: 100 });
  });
});
