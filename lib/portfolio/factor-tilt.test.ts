import { describe, expect, it } from "vitest";
import { computeFactorTilts, formatFactorTiltsForPrompt } from "./factor-tilt";
import type { UniverseStock } from "../screener/universe";
import type { HistoricalBar } from "../market-data/types";

// bars.length = 127 so trailingReturn(bars, 126) reads bars[0] as "past"
// and bars[126] as "now" — return = (start + 126*step - start) / start =
// 126*step / start, a clean value to hand-check against.
function linearBars(start: number, step: number): HistoricalBar[] {
  return Array.from({ length: 127 }, (_, i) => {
    const close = start + i * step;
    return { time: i, open: close, high: close, low: close, close, volume: 1000 };
  });
}

const UNIVERSE: UniverseStock[] = [
  { symbol: "S1", name: "S1", sector: "SectorA" },
  { symbol: "S2", name: "S2", sector: "SectorA" },
  { symbol: "S3", name: "S3", sector: "SectorB" },
  { symbol: "S4", name: "S4", sector: "SectorB" },
  { symbol: "S5", name: "S5", sector: "SectorB" },
];

// Steps chosen so trailing returns are strictly ordered S1 > S2 > S3 > S4 > S5.
const BARS: Record<string, HistoricalBar[]> = {
  S1: linearBars(100, 2),
  S2: linearBars(100, 1),
  S3: linearBars(100, 0),
  S4: linearBars(100, -1),
  S5: linearBars(100, -0.5), // still beats S4 (less negative) — kept ordering distinct from S3/S4
};

describe("computeFactorTilts", () => {
  it("computes a momentum percentile matching the hand-derived ranking", () => {
    const tilts = computeFactorTilts(["S1", "S3"], UNIVERSE, BARS, {});
    const s1 = tilts.find((t) => t.symbol === "S1")!;
    const s3 = tilts.find((t) => t.symbol === "S3")!;

    // S1 has the highest trailing return of the 5 — beats all 4 others.
    expect(s1.momentumPercentile).toBeCloseTo(80); // 4 of 5 beaten (itself excluded by `<`)
    // S3 (flat, step=0) beats S4 and S5 (both negative) — 2 of 5.
    expect(s3.momentumPercentile).toBeCloseTo(40);
  });

  it("omits all percentiles for a symbol outside the universe", () => {
    const tilts = computeFactorTilts(["NOTLISTED.NS"], UNIVERSE, BARS, {});
    const t = tilts[0];
    expect(t.symbol).toBe("NOTLISTED.NS");
    expect(t.momentumPercentile).toBeUndefined();
    expect(t.lowVolatilityPercentile).toBeUndefined();
    expect(t.sectorMomentumPercentile).toBeUndefined();
    expect(t.valuePercentile).toBeUndefined();
  });

  it("computes a defined low-volatility percentile when enough bar history exists", () => {
    const tilts = computeFactorTilts(["S1"], UNIVERSE, BARS, {});
    expect(tilts[0].lowVolatilityPercentile).toBeGreaterThanOrEqual(0);
    expect(tilts[0].lowVolatilityPercentile).toBeLessThanOrEqual(100);
  });
});

describe("formatFactorTiltsForPrompt", () => {
  it("renders 'not available' for omitted factors", () => {
    const tilts = computeFactorTilts(["NOTLISTED.NS"], UNIVERSE, BARS, {});
    const text = formatFactorTiltsForPrompt(tilts);
    expect(text).toContain("NOTLISTED.NS");
    expect(text).toContain("not available");
  });
});
