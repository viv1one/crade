import { describe, expect, it } from "vitest";
import { computePortfolioDiagnostics, formatDiagnosticsForPrompt } from "./diagnostics";
import type { PositionInput } from "./diagnostics";
import type { Holding } from "../paper-trading/types";
import type { HistoricalBar } from "../market-data/types";

function makeBars(count: number, startClose: number, step: number): HistoricalBar[] {
  return Array.from({ length: count }, (_, i) => {
    const close = startClose + i * step;
    return { time: i, open: close, high: close, low: close, close, volume: 1000 };
  });
}

describe("computePortfolioDiagnostics", () => {
  it("returns null for an empty portfolio", () => {
    expect(computePortfolioDiagnostics({}, 100_000, {}, {}, {})).toBeNull();
  });

  it("computes allocation, concentration, and sector grouping", () => {
    const holdings: Record<string, Holding> = {
      "TCS.NS": { symbol: "TCS.NS", qty: 10, avgCost: 100 },
      "SOMEOTHER.NS": { symbol: "SOMEOTHER.NS", qty: 5, avgCost: 200 },
    };
    const prices = { "TCS.NS": 100, "SOMEOTHER.NS": 200 };
    const diag = computePortfolioDiagnostics(holdings, 1000, prices, {}, {});

    expect(diag).not.toBeNull();
    // TCS: 10*100=1000, SOMEOTHER: 5*200=1000, cash: 1000, total: 3000
    expect(diag!.totalValue).toBe(3000);
    expect(diag!.cashAllocationPct).toBeCloseTo((1000 / 3000) * 100);
    expect(diag!.topHoldingPct).toBeCloseTo((1000 / 3000) * 100);
    // Two equal holdings -> Herfindahl = 2 * (1/3)^2
    expect(diag!.herfindahlIndex).toBeCloseTo(2 * (1 / 3) ** 2, 5);

    const sectors = new Map(diag!.sectorAllocations.map((s) => [s.sector, s.allocationPct]));
    expect(sectors.get("IT")).toBeCloseTo((1000 / 3000) * 100);
    expect(sectors.get("Other")).toBeCloseTo((1000 / 3000) * 100);
  });

  it("falls back to avgCost when no live price is available", () => {
    const holdings: Record<string, Holding> = {
      "TCS.NS": { symbol: "TCS.NS", qty: 2, avgCost: 150 },
    };
    const diag = computePortfolioDiagnostics(holdings, 0, {}, {}, {});
    expect(diag!.holdings[0].marketValue).toBe(300);
    expect(diag!.holdings[0].price).toBe(150);
  });

  it("omits trailingReturnPct/volatilityPct when there isn't enough bar history", () => {
    const holdings: Record<string, Holding> = {
      "TCS.NS": { symbol: "TCS.NS", qty: 1, avgCost: 100 },
    };
    const shortBars = makeBars(10, 100, 1); // well under the 126/60-bar lookbacks
    const diag = computePortfolioDiagnostics(
      holdings,
      0,
      { "TCS.NS": 100 },
      { "TCS.NS": shortBars },
      {}
    );
    expect(diag!.holdings[0].trailingReturnPct).toBeUndefined();
    expect(diag!.holdings[0].volatilityPct).toBeUndefined();
    expect(diag!.holdings[0].peRatio).toBeUndefined();
  });

  it("fills trailingReturnPct/volatilityPct/fundamentals when enough data is present", () => {
    const holdings: Record<string, Holding> = {
      "TCS.NS": { symbol: "TCS.NS", qty: 1, avgCost: 100 },
    };
    const longBars = makeBars(130, 100, 1); // > 126-bar momentum lookback
    const diag = computePortfolioDiagnostics(
      holdings,
      0,
      { "TCS.NS": 229 },
      { "TCS.NS": longBars },
      { "TCS.NS": { symbol: "TCS.NS", peRatio: 22.5, dividendYield: 0.015 } }
    );
    // trailingReturn(bars, 126) reads bars[129 - 126] = bars[3].close = 103 as
    // the "past" price, not bars[0] — (229 - 103) / 103 * 100.
    expect(diag!.holdings[0].trailingReturnPct).toBeCloseTo(((229 - 103) / 103) * 100, 5);
    expect(diag!.holdings[0].volatilityPct).toBeGreaterThanOrEqual(0);
    expect(diag!.holdings[0].peRatio).toBe(22.5);
    expect(diag!.holdings[0].dividendYield).toBe(0.015);
  });

  it("omits cash/cashAllocationPct when cash isn't tracked (real-holdings case)", () => {
    const holdings: Record<string, PositionInput> = {
      "TCS.NS": { qty: 10, avgCost: 100 },
      "SOMEOTHER.NS": { qty: 5, avgCost: 200 },
    };
    const diag = computePortfolioDiagnostics(
      holdings,
      undefined,
      { "TCS.NS": 100, "SOMEOTHER.NS": 200 },
      {},
      {}
    );
    expect(diag!.cash).toBeUndefined();
    expect(diag!.cashAllocationPct).toBeUndefined();
    // totalValue is holdings-only: 1000 + 1000
    expect(diag!.totalValue).toBe(2000);
    expect(diag!.topHoldingPct).toBeCloseTo(50);
  });
});

describe("formatDiagnosticsForPrompt", () => {
  it("renders missing fields as 'not available' rather than omitting them", () => {
    const holdings: Record<string, Holding> = {
      "TCS.NS": { symbol: "TCS.NS", qty: 1, avgCost: 100 },
    };
    const diag = computePortfolioDiagnostics(holdings, 500, { "TCS.NS": 100 }, {}, {});
    const text = formatDiagnosticsForPrompt(diag!);
    expect(text).toContain("not available");
    expect(text).toContain("TCS.NS");
    expect(text).toContain("IT");
  });

  it("renders a 'not tracked' cash line instead of a misleading 0% when cash is untracked", () => {
    const holdings: Record<string, PositionInput> = { "TCS.NS": { qty: 1, avgCost: 100 } };
    const diag = computePortfolioDiagnostics(holdings, undefined, { "TCS.NS": 100 }, {}, {});
    const text = formatDiagnosticsForPrompt(diag!);
    expect(text).toContain("not tracked");
    expect(text).not.toContain("0.0% of total");
  });
});
