import { describe, expect, it } from "vitest";
import { runPortfolioBacktest } from "./portfolio-engine";
import type { HistoricalBar } from "../market-data/types";

const DAY = 24 * 60 * 60;

function barsFromCloses(closes: number[]): HistoricalBar[] {
  return closes.map((c, i) => ({ time: i * DAY, open: c, high: c, low: c, close: c, volume: 0 }));
}

// Symbol A never breaks its own flat range (no trades, equity stays at its
// starting allocation). Symbol B is the same buy/sell round trip used in
// engine.test.ts, so its numbers are already hand-verified there.
const FLAT_CLOSES = [10, 10, 10, 10, 10, 10, 10];
const ROUND_TRIP_CLOSES = [10, 10, 10, 12, 12, 8, 8];

describe("runPortfolioBacktest", () => {
  it("splits capital equally and combines per-symbol equity curves", () => {
    const result = runPortfolioBacktest(
      ["A", "B"],
      { A: barsFromCloses(FLAT_CLOSES), B: barsFromCloses(ROUND_TRIP_CLOSES) },
      "momentum_breakout",
      { lookback: 2 },
      2000
    );

    expect(result.bySymbol).toHaveLength(2);
    const a = result.bySymbol.find((s) => s.symbol === "A")!;
    const b = result.bySymbol.find((s) => s.symbol === "B")!;

    expect(a).toMatchObject({ startingCash: 1000, finalEquity: 1000, totalReturnPct: 0, tradeCount: 0 });
    expect(b).toMatchObject({ startingCash: 1000, finalEquity: 668, tradeCount: 2 });
    expect(b.totalReturnPct).toBeCloseTo(-33.2, 5);

    expect(result.equityCurve.map((p) => p.equity)).toEqual([2000, 2000, 2000, 2000, 2000, 1668, 1668]);
    expect(result.metrics.finalEquity).toBe(1668);
    expect(result.metrics.totalReturnPct).toBeCloseTo(-16.6, 5);
    expect(result.metrics.buyHoldReturnPct).toBeCloseTo(-10, 5); // average of A's 0% and B's -20%

    expect(result.trades).toHaveLength(2);
    expect(result.trades.every((t) => t.symbol === "B")).toBe(true);
  });

  it("rejects an empty symbol list", () => {
    expect(() => runPortfolioBacktest([], {}, "momentum_breakout", { lookback: 2 }, 1000)).toThrow(
      /at least one symbol/i
    );
  });

  it("rejects a symbol with no historical data", () => {
    expect(() =>
      runPortfolioBacktest(["A"], { A: [] }, "momentum_breakout", { lookback: 2 }, 1000)
    ).toThrow(/no historical data/i);
  });
});
