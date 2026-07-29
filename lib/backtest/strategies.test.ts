import { describe, expect, it } from "vitest";
import { generateSignals } from "./strategies";
import type { HistoricalBar } from "../market-data/types";

// New strategies (added as Phase 1 of crade-strategy-loop-prompt.md lands)
// get their generateSignals() output unit-tested directly here — lighter
// weight than a full runBacktest cash-management test, and this is where
// the signal logic itself lives. The original four strategies are already
// covered indirectly via engine.test.ts's runBacktest tests.

function barsFromCloses(closes: number[]): HistoricalBar[] {
  return closes.map((c, i) => ({ time: i, open: c, high: c, low: c, close: c, volume: 0 }));
}

describe("trend_following", () => {
  it("buys once the trailing return turns positive and sells once it turns negative", () => {
    // lookback=2: signal at i looks at close[i] vs close[i-2].
    //   i0,1: warmup, undefined -> hold
    //   i2: 12 vs 10 (i0) -> positive -> buy
    //   i3: 14 vs 10 (i1) -> positive -> buy (stays)
    //   i4: 8 vs 12 (i2)  -> negative -> sell
    const bars = barsFromCloses([10, 10, 12, 14, 8]);
    const signals = generateSignals("trend_following", bars, { lookback: 2 });
    expect(signals).toEqual(["hold", "hold", "buy", "buy", "sell"]);
  });

  it("holds when there isn't enough history yet", () => {
    const bars = barsFromCloses([10, 11, 12]);
    const signals = generateSignals("trend_following", bars, { lookback: 5 });
    expect(signals.every((s) => s === "hold")).toBe(true);
  });
});
