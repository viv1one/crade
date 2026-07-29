import { describe, expect, it } from "vitest";
import { runCrossSectionalBacktest } from "./cross-sectional-engine";
import type { HistoricalBar } from "../market-data/types";
import type { UniverseStock } from "../screener/universe";
import type { RankContext } from "./types";

const UNIVERSE: UniverseStock[] = [
  { symbol: "A", name: "A", sector: "X" },
  { symbol: "B", name: "B", sector: "X" },
  { symbol: "C", name: "C", sector: "X" },
];

function ts(month1based: number, day: number): number {
  return Date.UTC(2024, month1based - 1, day) / 1000;
}

// 10 January bars followed by 5 February bars, same 15 dates for every
// symbol. Closes are picked so the ranking flips at the February
// rebalance: C is the top score in January, B in February.
const DATES = [
  ...Array.from({ length: 10 }, (_, i) => ts(1, i + 1)),
  ...Array.from({ length: 5 }, (_, i) => ts(2, i + 1)),
];

function flatBars(janClose: number, febClose: number): HistoricalBar[] {
  return DATES.map((time, i) => {
    const close = i < 10 ? janClose : febClose;
    return { time, open: close, high: close, low: close, close, volume: 0 };
  });
}

const BARS_BY_SYMBOL: Record<string, HistoricalBar[]> = {
  A: flatBars(10, 10),
  B: flatBars(5, 50),
  C: flatBars(20, 2),
};

// Trivial score: the symbol's own latest close — highest price wins.
function latestCloseScore(symbol: string, ctx: RankContext): number | undefined {
  const bars = ctx.barsBySymbol[symbol];
  return bars ? bars[bars.length - 1].close : undefined;
}

describe("runCrossSectionalBacktest", () => {
  it("rebalances into the top-scoring symbol on membership changes and marks to market", () => {
    const result = runCrossSectionalBacktest(
      UNIVERSE,
      BARS_BY_SYMBOL,
      {},
      { topN: 1 },
      1000,
      latestCloseScore,
      "monthly"
    );

    expect(result.trades).toHaveLength(3);
    expect(result.trades[0]).toMatchObject({ symbol: "C", side: "buy", qty: 50, price: 20 });
    expect(result.trades[1]).toMatchObject({
      symbol: "C",
      side: "sell",
      qty: 50,
      price: 2,
      realizedPnl: -900,
    });
    expect(result.trades[2]).toMatchObject({ symbol: "B", side: "buy", qty: 2, price: 50 });

    // Flat within January (C held at a constant price), flat within
    // February (B held at a constant price) — no gradual drift.
    expect(result.equityCurve.slice(0, 10).every((p) => p.equity === 1000)).toBe(true);
    expect(result.equityCurve.slice(10).every((p) => p.equity === 100)).toBe(true);

    expect(result.metrics.finalEquity).toBe(100);
    expect(result.metrics.totalReturnPct).toBeCloseTo(-90, 5);
  });

  it("excludes symbols the score function opts out of and clamps topN to what's left", () => {
    const scoreOnlyAB = (symbol: string, ctx: RankContext) =>
      symbol === "C" ? undefined : latestCloseScore(symbol, ctx);

    const result = runCrossSectionalBacktest(
      UNIVERSE,
      BARS_BY_SYMBOL,
      {},
      { topN: 5 }, // more than the 2 eligible symbols
      1000,
      scoreOnlyAB,
      "monthly"
    );

    const boughtSymbols = new Set(result.trades.filter((t) => t.side === "buy").map((t) => t.symbol));
    expect(boughtSymbols.has("C")).toBe(false);
    expect(boughtSymbols).toEqual(new Set(["A", "B"]));
  });
});
