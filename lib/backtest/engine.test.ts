import { describe, expect, it } from "vitest";
import { runBacktest } from "./engine";
import type { HistoricalBar } from "../market-data/types";

const DAY = 24 * 60 * 60;

function barsFromCloses(closes: number[]): HistoricalBar[] {
  return closes.map((c, i) => ({ time: i * DAY, open: c, high: c, low: c, close: c, volume: 0 }));
}

// momentum_breakout, lookback=2: buys on a close above the prior 2 bars' high,
// sells on a close below the prior 2 bars' low.
//   i0..2: flat at 10          -> no signal (still in warmup / no breakout)
//   i3: 12 breaks the 10 high  -> buy
//   i4: 12                     -> holds
//   i5: 8 breaks the 10/12 low -> sell (a losing round trip)
//   i6: 8                      -> no position, no re-entry (not a new low)
const CLOSES = [10, 10, 10, 12, 12, 8, 8];

describe("runBacktest", () => {
  it("executes a buy/sell round trip on breakout signals and tracks equity", () => {
    const bars = barsFromCloses(CLOSES);
    const result = runBacktest("TEST", bars, "momentum_breakout", { lookback: 2 }, 1000);

    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]).toMatchObject({ side: "buy", qty: 83, price: 12 });
    expect(result.trades[1]).toMatchObject({ side: "sell", qty: 83, price: 8, realizedPnl: -332 });

    expect(result.equityCurve.map((p) => p.equity)).toEqual([1000, 1000, 1000, 1000, 1000, 668, 668]);

    expect(result.metrics.finalEquity).toBe(668);
    expect(result.metrics.totalReturnPct).toBeCloseTo(-33.2, 5);
    expect(result.metrics.maxDrawdownPct).toBeCloseTo(33.2, 5);
    expect(result.metrics.tradeCount).toBe(2);
    expect(result.metrics.winRatePct).toBe(0);
    expect(result.metrics.buyHoldReturnPct).toBeCloseTo(-20, 5);
  });

  it("skips a buy signal when cash can't afford even one share", () => {
    const bars = barsFromCloses(CLOSES);
    const result = runBacktest("TEST", bars, "momentum_breakout", { lookback: 2 }, 5);

    expect(result.trades).toHaveLength(0);
    expect(result.equityCurve.every((p) => p.equity === 5)).toBe(true);
  });

  it("ignores a sell signal when there is no open position", () => {
    // Breaks down through the lookback low immediately, with no prior buy.
    const bars = barsFromCloses([10, 10, 10, 5, 5]);
    const result = runBacktest("TEST", bars, "momentum_breakout", { lookback: 2 }, 1000);

    expect(result.trades).toHaveLength(0);
  });
});
