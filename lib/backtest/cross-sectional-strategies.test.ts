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

function monthlyBars(monthlyCloses: [number, number][]): HistoricalBar[] {
  // Two bars per month (1st and 15th), months starting January 2024.
  const out: HistoricalBar[] = [];
  monthlyCloses.forEach(([startClose, endClose], monthIndex) => {
    const t1 = Date.UTC(2024, monthIndex, 1) / 1000;
    const t15 = Date.UTC(2024, monthIndex, 15) / 1000;
    out.push({ time: t1, open: startClose, high: startClose, low: startClose, close: startClose, volume: 0 });
    out.push({ time: t15, open: endClose, high: endClose, low: endClose, close: endClose, volume: 0 });
  });
  return out;
}

describe("consistent_momentum score", () => {
  it("excludes a symbol whose gain came from one spike rather than sustained monthly performance", () => {
    const scoreFn = getScoreFn("consistent_momentum");
    // A: positive every month (Jan/Feb/Mar), modest total return.
    // B: one huge January spike, then down in Feb and Mar — higher raw
    // total return (+20% vs A's +15%) but only 1 of 3 months positive.
    const context = ctx(
      {
        A: monthlyBars([
          [100, 105],
          [105, 110],
          [110, 115],
        ]),
        B: monthlyBars([
          [100, 200],
          [200, 150],
          [150, 120],
        ]),
      },
      { lookbackMonths: 3, minPositiveMonths: 2 }
    );

    expect(scoreFn("A", context)).toBeCloseTo(0.15, 10);
    expect(scoreFn("B", context)).toBeUndefined();
  });

  it("excludes a symbol with fewer months of history than lookbackMonths", () => {
    const scoreFn = getScoreFn("consistent_momentum");
    const context = ctx(
      { A: monthlyBars([[100, 105], [105, 110]]) },
      { lookbackMonths: 3, minPositiveMonths: 2 }
    );
    expect(scoreFn("A", context)).toBeUndefined();
  });
});

describe("short_term_reversal score", () => {
  it("scores the worst-performing symbol highest", () => {
    const scoreFn = getScoreFn("short_term_reversal");
    const context = ctx(
      {
        A: bars([100, 90, 80, 70, 60, 50]), // -50% over the week — a sharp drop
        B: bars([100, 102, 104, 106, 108, 110]), // +10% over the week
      },
      { lookback: 5 }
    );

    const scoreA = scoreFn("A", context);
    const scoreB = scoreFn("B", context);
    expect(scoreA).toBeCloseTo(0.5, 10);
    expect(scoreB).toBeCloseTo(-0.1, 10);
    expect(scoreA!).toBeGreaterThan(scoreB!);
  });
});

describe("low_volatility score", () => {
  it("scores the calmer symbol higher than the choppier one", () => {
    const scoreFn = getScoreFn("low_volatility");
    const context = ctx(
      {
        Calm: bars([100, 101, 100, 101, 100, 101]),
        Choppy: bars([100, 130, 80, 130, 80, 130]),
      },
      { lookback: 5 }
    );

    const calmScore = scoreFn("Calm", context);
    const choppyScore = scoreFn("Choppy", context);
    expect(calmScore).toBeDefined();
    expect(choppyScore).toBeDefined();
    expect(calmScore!).toBeGreaterThan(choppyScore!);
  });

  it("excludes a symbol with insufficient history", () => {
    const scoreFn = getScoreFn("low_volatility");
    const context = ctx({ A: bars([100, 101]) }, { lookback: 5 });
    expect(scoreFn("A", context)).toBeUndefined();
  });
});
