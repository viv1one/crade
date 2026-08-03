import { describe, expect, it } from "vitest";
import { computeLeaderboard } from "./leaderboard";
import type { HistoricalBar } from "../market-data/types";
import type { UniverseStock } from "../screener/universe";
import type { StrategyDef } from "./types";

const UNIVERSE: UniverseStock[] = [
  { symbol: "A", name: "A", sector: "X" },
  { symbol: "B", name: "B", sector: "X" },
  { symbol: "C", name: "C", sector: "X" },
];

function ts(month1based: number, day: number): number {
  return Date.UTC(2024, month1based - 1, day) / 1000;
}

// Same shape as cross-sectional-engine.test.ts: 10 flat January bars, then
// 5 flat February bars, so there's exactly one real rebalance (the first
// one has too little history to score anything with lookback=5, same
// warmup handling the engine already documents).
const DATES = [
  ...Array.from({ length: 10 }, (_, i) => ts(1, i + 1)),
  ...Array.from({ length: 5 }, (_, i) => ts(2, i + 1)),
];

// Jan is constant (warmup — too little history for lookback=5 to score
// anything, so the first rebalance picks nothing); the 5 February closes
// are given individually so a symbol picked at the February rebalance can
// keep moving afterward — a strategy only rebalances at month boundaries,
// so a jump priced in entirely at the rebalance bar itself (bought at the
// new price) wouldn't show up in the final return at all.
function bars(janClose: number, febCloses: number[]): HistoricalBar[] {
  return DATES.map((time, i) => {
    const close = i < 10 ? janClose : febCloses[i - 10];
    return { time, open: close, high: close, low: close, close, volume: 0 };
  });
}

// A stays perfectly flat throughout (zero volatility, zero return). B
// jumps at the February rebalance and keeps climbing through the rest of
// February; C jumps down and keeps sliding. This makes both Momentum
// Factor's and Low Volatility Factor's picks unambiguous: momentum chases
// B's post-rebalance climb, low-vol prefers A's flat line over B/C's swings.
const BARS_BY_SYMBOL: Record<string, HistoricalBar[]> = {
  A: bars(10, [10, 10, 10, 10, 10]),
  B: bars(5, [50, 55, 60, 65, 70]),
  C: bars(20, [2, 1.8, 1.6, 1.4, 1.2]),
};

function testStrategy(overrides: Partial<StrategyDef> & Pick<StrategyDef, "id">): StrategyDef {
  return {
    name: overrides.id,
    description: "test fixture",
    kind: "cross_sectional",
    paramSchema: [
      { key: "lookback", label: "Lookback", default: 5, min: 1, max: 10 },
      { key: "topN", label: "Hold top N", default: 1, min: 1, max: 3 },
    ],
    ...overrides,
  };
}

describe("computeLeaderboard", () => {
  it("runs every cross-sectional strategy and sorts entries by CAGR descending", () => {
    const strategies = [
      testStrategy({ id: "momentum_factor" }),
      testStrategy({ id: "low_volatility" }),
    ];

    const entries = computeLeaderboard(UNIVERSE, BARS_BY_SYMBOL, {}, strategies, 1000);

    expect(entries).toHaveLength(2);
    // Momentum chases B's +900% Feb spike; low-vol prefers A's flat (zero
    // variance) line over B/C's one large swing — momentum's CAGR should
    // dwarf low-vol's, so it sorts first.
    expect(entries[0].strategyId).toBe("momentum_factor");
    expect(entries[0].currentPicks).toEqual(["B"]);
    expect(entries[1].strategyId).toBe("low_volatility");
    expect(entries[1].currentPicks).toEqual(["A"]);
    expect(entries[0].metrics.cagrPct).toBeGreaterThan(entries[1].metrics.cagrPct);
  });

  it("skips non-cross-sectional strategies", () => {
    const strategies = [
      testStrategy({ id: "momentum_factor" }),
      testStrategy({ id: "sma_crossover", kind: "single_symbol" }),
    ];

    const entries = computeLeaderboard(UNIVERSE, BARS_BY_SYMBOL, {}, strategies, 1000);

    expect(entries).toHaveLength(1);
    expect(entries[0].strategyId).toBe("momentum_factor");
  });

  it("degrades to an empty pick list when a strategy's required data is missing, rather than throwing", () => {
    // value_proxy needs fundamentals (P/E or dividend yield) for every
    // candidate — with none supplied it should score nothing and end up
    // fully in cash, not throw.
    const strategies = [testStrategy({ id: "value_proxy" })];

    const entries = computeLeaderboard(UNIVERSE, BARS_BY_SYMBOL, {}, strategies, 1000);

    expect(entries).toHaveLength(1);
    expect(entries[0].currentPicks).toEqual([]);
    expect(entries[0].metrics.tradeCount).toBe(0);
  });
});
