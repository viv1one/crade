import { describe, expect, it } from "vitest";
import { runPairsBacktest } from "./pairs-engine";
import type { HistoricalBar } from "../market-data/types";

const DAY = 24 * 60 * 60;

function barsFromCloses(closes: number[]): HistoricalBar[] {
  return closes.map((c, i) => ({ time: i * DAY, open: c, high: c, low: c, close: c, volume: 0 }));
}

describe("runPairsBacktest", () => {
  it("opens a spread position on a z-score breakout and marks it to market", () => {
    // A spikes to 140 at index 6 while B stays flat at 100 — the log-ratio
    // z-score (lookback 3) crosses above entryZ there, opening a
    // short-spread (short A, long B). The exit threshold is never crossed
    // again within this short window, so the position stays open through
    // the end of the run — that's the scenario under test, not a bug.
    const barsA = barsFromCloses([100, 100, 100, 100, 100, 100, 140, 100, 100, 100]);
    const barsB = barsFromCloses([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);

    const result = runPairsBacktest(
      "A",
      "B",
      barsA,
      barsB,
      { lookback: 3, entryZ: 1, exitZ: 0.3 },
      1000
    );

    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]).toMatchObject({ symbol: "A", side: "sell", qty: 3, price: 140 });
    expect(result.trades[0].realizedPnl).toBeUndefined();
    expect(result.trades[1]).toMatchObject({ symbol: "B", side: "buy", qty: 5, price: 100 });

    expect(result.equityCurve.slice(0, 7).every((p) => p.equity === 1000)).toBe(true);
    expect(result.equityCurve.slice(7).every((p) => p.equity === 1120)).toBe(true);

    // No round trip closed, so the win-rate/trade-count metrics — which
    // are computed from closed round trips, not raw legs — see zero
    // trades even though two legs were opened.
    expect(result.metrics.tradeCount).toBe(0);
    expect(result.metrics.finalEquity).toBe(1120);
  });

  it("throws when the two symbols have no overlapping trading history", () => {
    const barsA: HistoricalBar[] = [{ time: 0, open: 100, high: 100, low: 100, close: 100, volume: 0 }];
    const barsB: HistoricalBar[] = [{ time: DAY, open: 100, high: 100, low: 100, close: 100, volume: 0 }];

    expect(() => runPairsBacktest("A", "B", barsA, barsB, { lookback: 3, entryZ: 1, exitZ: 0.3 }, 1000)).toThrow(
      /no overlapping trading history/i
    );
  });
});
