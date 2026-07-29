import { describe, expect, it } from "vitest";
import { getScoreFn } from "./cross-sectional-strategies";
import type { Fundamentals, HistoricalBar } from "../market-data/types";
import type { UniverseStock } from "../screener/universe";
import type { RankContext } from "./types";

function bars(closes: number[]): HistoricalBar[] {
  return closes.map((c, i) => ({ time: i, open: c, high: c, low: c, close: c, volume: 0 }));
}

function ctx(
  barsBySymbol: Record<string, HistoricalBar[]>,
  params: Record<string, number>,
  fundamentalsBySymbol: Record<string, Fundamentals | undefined> = {},
  universe: UniverseStock[] = []
): RankContext {
  return { barsBySymbol, fundamentalsBySymbol, universe, params };
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

describe("smart_factor_composite score", () => {
  it("ranks a symbol strong on both momentum and low-vol above one weak on both, with sectors tied", () => {
    // Two sectors, two symbols each. Momentum uses only the first/last
    // close (trailingReturnScore), so the intermediate zigzag only
    // affects volatility — chosen so each sector's *average* momentum
    // comes out equal (0.01), meaning the sector sub-signal contributes
    // the same value to every symbol here and can't be what
    // differentiates T1 from T2. T1 wins purely on its own momentum
    // (highest) and volatility (lowest, steady small steps vs. T2's
    // choppy swings).
    const universe = [
      { symbol: "T1", name: "T1", sector: "Tech" },
      { symbol: "T2", name: "T2", sector: "Tech" },
      { symbol: "A1", name: "A1", sector: "Auto" },
      { symbol: "A2", name: "A2", sector: "Auto" },
    ];
    const context = ctx(
      {
        T1: bars([100, 101, 102, 103, 104, 105]), // +5%, steady
        T2: bars([100, 103, 97, 101, 95, 97]), // -3%, choppy
        A1: bars([100, 102, 101, 102.5, 101.5, 103]), // +3%
        A2: bars([100, 99.5, 100.2, 99.8, 100.1, 99]), // -1%
      },
      { lookback: 5 },
      {},
      universe
    );

    const scoreFn = getScoreFn("smart_factor_composite");
    const scoreT1 = scoreFn("T1", context)!;
    const scoreT2 = scoreFn("T2", context)!;
    expect(scoreT1).toBeDefined();
    expect(scoreT2).toBeDefined();
    expect(scoreT1).toBeGreaterThan(scoreT2);
  });

  it("excludes a symbol with too few universe peers to z-score against", () => {
    const scoreFn = getScoreFn("smart_factor_composite");
    const universe = [{ symbol: "Solo", name: "Solo", sector: "X" }];
    const context = ctx({ Solo: bars([100, 101, 102, 103, 104, 105]) }, { lookback: 5 }, {}, universe);
    expect(scoreFn("Solo", context)).toBeUndefined();
  });
});

describe("residual_momentum score", () => {
  it("scores a stock with idiosyncratic drift beyond its beta higher than one that just tracks the market", () => {
    // X moves exactly with a base pattern; Y moves with the same pattern
    // plus an extra +0.5%/day idiosyncratic drift on top. Both end up
    // with beta ~1 against their equal-weight average (adding a constant
    // to one series doesn't change covariance/variance), but Y's actual
    // trailing return exceeds what beta*marketReturn alone explains —
    // its residual should be clearly higher than X's.
    const base = [0.01, -0.005, 0.008, -0.003, 0.012, -0.007, 0.004, -0.002];
    const universe = [
      { symbol: "X", name: "X", sector: "S" },
      { symbol: "Y", name: "Y", sector: "S" },
    ];
    const context = ctx(
      {
        X: pricesFromReturns(100, base),
        Y: pricesFromReturns(100, base.map((r) => r + 0.005)),
      },
      { lookback: 8 },
      {},
      universe
    );

    const scoreFn = getScoreFn("residual_momentum");
    const scoreX = scoreFn("X", context)!;
    const scoreY = scoreFn("Y", context)!;
    expect(scoreY).toBeGreaterThan(scoreX);
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

function pricesFromReturns(start: number, dailyReturns: number[]): HistoricalBar[] {
  const prices = [start];
  for (const r of dailyReturns) prices.push(prices[prices.length - 1] * (1 + r));
  return bars(prices);
}

describe("betting_against_beta score", () => {
  it("ranks the symbol that moves least with the market highest", () => {
    // All three move in the same direction each day (perfectly
    // correlated) but at different amplitudes: A at 1x, B at 3x, C at
    // 0.2x. The equal-weight market is their average, so B has the
    // highest beta and C the lowest — betting_against_beta should score
    // C highest and B lowest.
    const pattern = [0.01, -0.01, 0.01, -0.01, 0.01, -0.01, 0.01, -0.01, 0.01];
    const context = ctx(
      {
        A: pricesFromReturns(100, pattern.map((r) => r * 1)),
        B: pricesFromReturns(100, pattern.map((r) => r * 3)),
        C: pricesFromReturns(100, pattern.map((r) => r * 0.2)),
      },
      { lookback: 9 }
    );

    const scoreFn = getScoreFn("betting_against_beta");
    const scoreA = scoreFn("A", context)!;
    const scoreB = scoreFn("B", context)!;
    const scoreC = scoreFn("C", context)!;
    expect(scoreC).toBeGreaterThan(scoreA);
    expect(scoreA).toBeGreaterThan(scoreB);
  });

  it("excludes a symbol with insufficient history", () => {
    const scoreFn = getScoreFn("betting_against_beta");
    const context = ctx({ A: bars([100, 101, 102]) }, { lookback: 9 });
    expect(scoreFn("A", context)).toBeUndefined();
  });
});

describe("value_proxy score", () => {
  it("scores a cheap, high-yield symbol higher than an expensive, low-yield one", () => {
    const scoreFn = getScoreFn("value_proxy");
    const universe = [
      { symbol: "Cheap", name: "Cheap", sector: "X" },
      { symbol: "Pricey", name: "Pricey", sector: "X" },
    ];
    const context = ctx(
      { Cheap: bars([100]), Pricey: bars([100]) },
      {},
      {
        Cheap: { symbol: "Cheap", peRatio: 8, dividendYield: 4 },
        Pricey: { symbol: "Pricey", peRatio: 40, dividendYield: 0.5 },
      },
      universe
    );

    const scoreCheap = scoreFn("Cheap", context)!;
    const scorePricey = scoreFn("Pricey", context)!;
    expect(scoreCheap).toBeGreaterThan(scorePricey);
  });

  it("still scores a symbol missing one of the two fields, using just the other", () => {
    const scoreFn = getScoreFn("value_proxy");
    const universe = [
      { symbol: "A", name: "A", sector: "X" },
      { symbol: "B", name: "B", sector: "X" },
    ];
    const context = ctx(
      { A: bars([100]), B: bars([100]) },
      {},
      { A: { symbol: "A", peRatio: 10 }, B: { symbol: "B", peRatio: 30 } }, // no dividendYield on either
      universe
    );
    expect(scoreFn("A", context)).toBeGreaterThan(scoreFn("B", context)!);
  });

  it("excludes a symbol with neither field in its fundamentals", () => {
    const scoreFn = getScoreFn("value_proxy");
    const context = ctx({ A: bars([100]) }, {}, { A: { symbol: "A" } }, [
      { symbol: "A", name: "A", sector: "X" },
    ]);
    expect(scoreFn("A", context)).toBeUndefined();
  });
});

describe("momentum_style_rotation score", () => {
  it("scores a symbol strong on both momentum and value higher than one weak on both", () => {
    const scoreFn = getScoreFn("momentum_style_rotation");
    const universe = [
      { symbol: "Strong", name: "Strong", sector: "X" },
      { symbol: "Weak", name: "Weak", sector: "X" },
    ];
    const context = ctx(
      { Strong: bars([100, 130]), Weak: bars([100, 90]) },
      { lookback: 1 },
      {
        Strong: { symbol: "Strong", peRatio: 8, dividendYield: 4 },
        Weak: { symbol: "Weak", peRatio: 40, dividendYield: 0.5 },
      },
      universe
    );
    expect(scoreFn("Strong", context)!).toBeGreaterThan(scoreFn("Weak", context)!);
  });

  it("still scores a symbol with no fundamentals at all, using momentum alone", () => {
    const scoreFn = getScoreFn("momentum_style_rotation");
    const universe = [
      { symbol: "A", name: "A", sector: "X" },
      { symbol: "B", name: "B", sector: "X" },
    ];
    const context = ctx({ A: bars([100, 120]), B: bars([100, 90]) }, { lookback: 1 }, {}, universe);
    expect(scoreFn("A", context)).toBeDefined();
    expect(scoreFn("A", context)!).toBeGreaterThan(scoreFn("B", context)!);
  });
});

describe("size_factor score", () => {
  it("scores the smaller-market-cap symbol higher", () => {
    const scoreFn = getScoreFn("size_factor");
    const context = ctx(
      { Small: bars([100]), Big: bars([100]) },
      {},
      {
        Small: { symbol: "Small", marketCap: 1_000_000 },
        Big: { symbol: "Big", marketCap: 1_000_000_000 },
      }
    );

    const scoreSmall = scoreFn("Small", context)!;
    const scoreBig = scoreFn("Big", context)!;
    expect(scoreSmall).toBeGreaterThan(scoreBig);
  });

  it("excludes a symbol with no marketCap in its fundamentals", () => {
    const scoreFn = getScoreFn("size_factor");
    const context = ctx({ A: bars([100]) }, {}, { A: { symbol: "A" } });
    expect(scoreFn("A", context)).toBeUndefined();
  });
});

describe("sector_momentum score", () => {
  it("scores a stock by its sector's average return, not its own", () => {
    const universe: UniverseStock[] = [
      { symbol: "A1", name: "A1", sector: "Tech" },
      { symbol: "A2", name: "A2", sector: "Tech" },
      { symbol: "B1", name: "B1", sector: "Auto" },
      { symbol: "B2", name: "B2", sector: "Auto" },
    ];
    const context = ctx(
      {
        A1: bars([100, 130]), // +30%
        A2: bars([100, 102]), // +2% — Tech sector average is (30%+2%)/2 = 16%
        B1: bars([100, 110]), // +10%
        B2: bars([100, 110]), // +10% — Auto sector average is 10%
      },
      { lookback: 1 },
      {},
      universe
    );

    const scoreFn = getScoreFn("sector_momentum");
    // A2's own return (2%) is worse than B1's (10%), but A2 is in the
    // stronger sector (16% avg vs. 10%) and should still outrank B1.
    const scoreA2 = scoreFn("A2", context)!;
    const scoreB1 = scoreFn("B1", context)!;
    expect(scoreA2).toBeCloseTo(0.16, 10);
    expect(scoreB1).toBeCloseTo(0.1, 10);
    expect(scoreA2).toBeGreaterThan(scoreB1);
  });

  it("excludes a symbol not present in the universe list", () => {
    const scoreFn = getScoreFn("sector_momentum");
    const context = ctx({ A: bars([100, 110]) }, { lookback: 1 }, {}, []);
    expect(scoreFn("A", context)).toBeUndefined();
  });
});

function bar(y: number, m1based: number, d: number, close: number): HistoricalBar {
  return { time: Date.UTC(y, m1based - 1, d) / 1000, open: close, high: close, low: close, close, volume: 0 };
}

describe("twelve_month_cycle score", () => {
  it("averages the same calendar month's return across prior years, excluding the in-progress one", () => {
    const scoreFn = getScoreFn("twelve_month_cycle");
    const barsA = [
      bar(2023, 2, 1, 100),
      bar(2023, 2, 28, 105), // Feb 2023: +5%
      bar(2024, 2, 1, 100),
      bar(2024, 2, 29, 115), // Feb 2024: +15%
      bar(2025, 2, 1, 100),
      bar(2025, 2, 15, 120), // Feb 2025: in progress, "now" — excluded
    ];
    const context = ctx({ A: barsA }, {});
    expect(scoreFn("A", context)).toBeCloseTo(0.1, 10); // (5% + 15%) / 2
  });

  it("excludes a symbol with fewer than 2 prior occurrences of the current month", () => {
    const scoreFn = getScoreFn("twelve_month_cycle");
    const barsA = [bar(2024, 2, 1, 100), bar(2024, 2, 28, 110), bar(2025, 2, 1, 100)];
    const context = ctx({ A: barsA }, {});
    expect(scoreFn("A", context)).toBeUndefined();
  });
});
