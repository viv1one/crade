import { describe, expect, it } from "vitest";
import { rollingHigh, rollingLow, rsi, sma, trailingReturn, volatility } from "./indicators";
import type { HistoricalBar } from "../market-data/types";

function bar(close: number, high = close, low = close): HistoricalBar {
  return { time: 0, open: close, high, low, close, volume: 0 };
}

describe("sma", () => {
  it("averages the trailing window and leaves undefined during warmup", () => {
    const bars = [1, 2, 3, 4, 5, 6].map((c) => bar(c));
    expect(sma(bars, 3)).toEqual([undefined, undefined, 2, 3, 4, 5]);
  });
});

describe("rsi", () => {
  it("matches Wilder's smoothing formula", () => {
    const bars = [10, 12, 11, 13, 12, 14].map((c) => bar(c));
    const values = rsi(bars, 2);
    expect(values[0]).toBeUndefined();
    expect(values[1]).toBeUndefined();
    expect(values[2]).toBeCloseTo(66.6667, 3);
    expect(values[3]).toBeCloseTo(85.7143, 3);
    expect(values[4]).toBeCloseTo(54.5455, 3);
    expect(values[5]).toBeCloseTo(81.4815, 3);
  });

  it("returns 100 when there are no losses in the window", () => {
    const bars = [10, 11, 12].map((c) => bar(c));
    expect(rsi(bars, 2)[2]).toBe(100);
  });
});

describe("rollingHigh / rollingLow", () => {
  it("look only at the preceding `period` bars, excluding the current one", () => {
    const highs = [5, 7, 6, 8, 9, 4];
    const lows = [1, 2, 3, 1, 4, 2];
    const bars = highs.map((h, i) => bar((h + lows[i]) / 2, h, lows[i]));

    expect(rollingHigh(bars, 2)).toEqual([undefined, undefined, 7, 7, 8, 9]);
    expect(rollingLow(bars, 2)).toEqual([undefined, undefined, 1, 2, 1, 1]);
  });
});

describe("volatility", () => {
  it("is zero for constant prices and positive for oscillating ones", () => {
    const flat = [100, 100, 100, 100].map((c) => bar(c));
    expect(volatility(flat, 3)[3]).toBe(0);

    const oscillating = [100, 110, 100, 110, 100].map((c) => bar(c));
    const values = volatility(oscillating, 3);
    expect(values[2]).toBeUndefined();
    expect(values[3]).toBeCloseTo(0.089859, 5);
    expect(values[4]).toBeCloseTo(0.089859, 5);
  });
});

describe("trailingReturn", () => {
  it("computes the return over the trailing `period` bars, undefined during warmup", () => {
    const bars = [100, 110, 90, 120, 60].map((c) => bar(c));
    const values = trailingReturn(bars, 2);
    expect(values[0]).toBeUndefined();
    expect(values[1]).toBeUndefined();
    expect(values[2]).toBeCloseTo(-0.1, 10); // (90-100)/100
    expect(values[3]).toBeCloseTo(0.0909, 3); // (120-110)/110
    expect(values[4]).toBeCloseTo(-0.3333, 3); // (60-90)/90
  });
});
