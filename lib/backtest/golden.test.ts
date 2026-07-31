import { describe, expect, it } from "vitest";
import { generateSignals } from "./strategies";
import { runBacktest } from "./engine";
import { getScoreFn } from "./cross-sectional-strategies";
import type { HistoricalBar } from "../market-data/types";
import type { RankContext } from "./types";
import type { UniverseStock } from "../screener/universe";

// Fixed synthetic price series with a known, obvious "correct" direction —
// not testing precise output values (those are covered elsewhere), just
// that a representative strategy from each family still points the way
// its own description says it should. Catches a future refactor silently
// flipping a sign (e.g. buy/sell swapped, or a score negated) that unit
// tests on individual helper functions wouldn't necessarily surface.

function barsFromCloses(closes: number[]): HistoricalBar[] {
  return closes.map((c, i) => ({ time: i, open: c, high: c, low: c, close: c, volume: 0 }));
}

describe("golden regression: single-symbol strategies point the right direction", () => {
  it("sma_crossover ends up net long (not short/flat) over a steady uptrend", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 2); // steady, uninterrupted rise
    const bars = barsFromCloses(closes);
    const result = runBacktest("TEST.NS", bars, "sma_crossover", { fastPeriod: 5, slowPeriod: 20 }, 100_000);
    // A trend-following strategy that got its buy/sell signals inverted
    // would lose money riding a pure uptrend backwards — it must not.
    expect(result.metrics.totalReturnPct).toBeGreaterThan(0);
  });

  it("rsi_mean_reversion buys at the trough of a sharp V-shaped dip, not at the peak", () => {
    const down = Array.from({ length: 15 }, (_, i) => 100 - i * 5); // sharp drop -> oversold
    const up = Array.from({ length: 15 }, (_, i) => down[down.length - 1] + i * 5); // recovery
    const bars = barsFromCloses([...down, ...up.slice(1)]);
    const signals = generateSignals("rsi_mean_reversion", bars, { period: 14, oversold: 30, overbought: 70 });
    const troughIndex = down.length - 1;
    // If oversold/overbought thresholds got swapped, this would sell at
    // the trough instead of buying it.
    expect(signals[troughIndex]).toBe("buy");
  });

  it("trend_following goes short-biased (sell/flat), never buy, through a steady downtrend", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 200 - i * 2);
    const bars = barsFromCloses(closes);
    const signals = generateSignals("trend_following", bars, { lookback: 10 });
    expect(signals).not.toContain("buy");
  });
});

describe("golden regression: cross-sectional scoring functions rank the right symbol first", () => {
  function ctxFor(barsBySymbol: Record<string, HistoricalBar[]>, universe: UniverseStock[], params: Record<string, number> = {}): RankContext {
    return { barsBySymbol, fundamentalsBySymbol: {}, universe, params };
  }

  it("momentum_factor scores the strong performer above the flat one", () => {
    const universe: UniverseStock[] = [
      { symbol: "WINNER.NS", name: "Winner", sector: "Test" },
      { symbol: "FLAT.NS", name: "Flat", sector: "Test" },
    ];
    const barsBySymbol = {
      "WINNER.NS": barsFromCloses(Array.from({ length: 130 }, (_, i) => 100 + i)),
      "FLAT.NS": barsFromCloses(Array.from({ length: 130 }, () => 100)),
    };
    const scoreFn = getScoreFn("momentum_factor");
    const ctx = ctxFor(barsBySymbol, universe, { lookback: 126 });
    const winnerScore = scoreFn("WINNER.NS", ctx);
    const flatScore = scoreFn("FLAT.NS", ctx);
    expect(winnerScore).toBeGreaterThan(flatScore ?? 0);
  });

  it("low_volatility scores the calm symbol above the choppy one", () => {
    const universe: UniverseStock[] = [
      { symbol: "CALM.NS", name: "Calm", sector: "Test" },
      { symbol: "CHOPPY.NS", name: "Choppy", sector: "Test" },
    ];
    const calmCloses = Array.from({ length: 70 }, (_, i) => 100 + Math.sin(i / 20) * 0.5);
    const choppyCloses = Array.from({ length: 70 }, (_, i) => 100 + Math.sin(i) * 20);
    const barsBySymbol = {
      "CALM.NS": barsFromCloses(calmCloses),
      "CHOPPY.NS": barsFromCloses(choppyCloses),
    };
    const scoreFn = getScoreFn("low_volatility");
    const ctx = ctxFor(barsBySymbol, universe, { lookback: 60 });
    const calmScore = scoreFn("CALM.NS", ctx);
    const choppyScore = scoreFn("CHOPPY.NS", ctx);
    // Lower realized volatility must rank higher — a sign flip here would
    // silently turn this into a high-volatility chaser instead.
    expect(calmScore).toBeGreaterThan(choppyScore ?? -Infinity);
  });
});
