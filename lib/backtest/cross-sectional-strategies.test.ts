import { describe, expect, it } from "vitest";
import { getScoreFn } from "./cross-sectional-strategies";
import type { HistoricalBar } from "../market-data/types";
import type { RankContext } from "./types";

function bars(closes: number[]): HistoricalBar[] {
  return closes.map((c, i) => ({ time: i, open: c, high: c, low: c, close: c, volume: 0 }));
}

function ctx(barsBySymbol: Record<string, HistoricalBar[]>, params: Record<string, number>): RankContext {
  return { barsBySymbol, fundamentalsBySymbol: {}, universe: [], params };
}

describe("momentum_factor score", () => {
  it("scores higher for the symbol with the stronger trailing return", () => {
    const scoreFn = getScoreFn("momentum_factor");
    const context = ctx(
      {
        A: bars([100, 110, 120, 130]), // +30% over lookback=3
        B: bars([100, 95, 90, 85]), // -15% over lookback=3
      },
      { lookback: 3 }
    );

    const scoreA = scoreFn("A", context);
    const scoreB = scoreFn("B", context);
    expect(scoreA).toBeCloseTo(0.3, 10);
    expect(scoreB).toBeCloseTo(-0.15, 10);
    expect(scoreA!).toBeGreaterThan(scoreB!);
  });

  it("excludes a symbol with insufficient history", () => {
    const scoreFn = getScoreFn("momentum_factor");
    const context = ctx({ A: bars([100, 110]) }, { lookback: 3 });
    expect(scoreFn("A", context)).toBeUndefined();
  });
});
