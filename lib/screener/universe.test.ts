import { describe, expect, it } from "vitest";
import { ALL_NSE_UNIVERSE, NIFTY_50 } from "./universe";
import { ALL_NSE_STOCKS } from "./nse-universe";

describe("ALL_NSE_UNIVERSE", () => {
  it("keeps every NIFTY_50 symbol's curated sector", () => {
    for (const stock of NIFTY_50) {
      const match = ALL_NSE_UNIVERSE.find((s) => s.symbol === stock.symbol);
      expect(match).toBeDefined();
      expect(match!.sector).toBe(stock.sector);
    }
  });

  it("never regresses a NIFTY_50 symbol even if it's missing from the live NSE listing", () => {
    // TATAMOTORS.NS/LTIM.NS have been observed missing from NSE's current
    // EQ-series CSV (likely a symbol change/corporate action since the
    // NIFTY_50 snapshot was curated) — ALL_NSE_UNIVERSE is a union
    // specifically so this doesn't silently drop them.
    const symbols = new Set(ALL_NSE_UNIVERSE.map((s) => s.symbol));
    for (const stock of NIFTY_50) {
      expect(symbols.has(stock.symbol)).toBe(true);
    }
  });

  it("falls back to 'Other' sector for a symbol outside NIFTY_50", () => {
    const nifty50Symbols = new Set(NIFTY_50.map((s) => s.symbol));
    const outsideNifty50 = ALL_NSE_STOCKS.find((s) => !nifty50Symbols.has(s.symbol));
    expect(outsideNifty50).toBeDefined();
    const match = ALL_NSE_UNIVERSE.find((s) => s.symbol === outsideNifty50!.symbol);
    expect(match?.sector).toBe("Other");
  });

  it("has no duplicate symbols", () => {
    const symbols = ALL_NSE_UNIVERSE.map((s) => s.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });
});
