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

// For calendar-based strategies, which need real dates rather than a raw
// index — one bar per date given, in (year, month1based, day) form.
function barsFromDates(dates: [number, number, number][]): HistoricalBar[] {
  return dates.map(([y, m, d]) => {
    const time = Date.UTC(y, m - 1, d) / 1000;
    return { time, open: 100, high: 100, low: 100, close: 100, volume: 0 };
  });
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

describe("fifty_two_week_high", () => {
  it("buys near/at a new high and sells once price falls well below it", () => {
    // lookback=3 looks at the 3 bars preceding each index (rollingHigh's
    // own convention, current bar excluded).
    //   i3: prior high 10, close 20 (a breakout, above the high) -> buy
    //   i4: prior high 20, close 19 -> exactly 5% below -> still buy
    //   i5: prior high 20, close 5  -> 75% below -> sell
    const bars = barsFromCloses([10, 10, 10, 20, 19, 5]);
    const signals = generateSignals("fifty_two_week_high", bars, {
      lookback: 3,
      nearPct: 5,
      exitPct: 15,
    });
    expect(signals.slice(3)).toEqual(["buy", "buy", "sell"]);
  });

  it("holds when there isn't enough history yet", () => {
    const bars = barsFromCloses([10, 11, 12]);
    const signals = generateSignals("fifty_two_week_high", bars, {
      lookback: 252,
      nearPct: 5,
      exitPct: 15,
    });
    expect(signals.every((s) => s === "hold")).toBe(true);
  });
});

describe("turn_of_month", () => {
  it("buys within the turn-of-month window and sells outside it", () => {
    const bars = barsFromDates([
      [2024, 1, 15], // mid-month -> sell (flat)
      [2024, 1, 31], // last day of Jan -> buy
      [2024, 2, 1], // first day of Feb -> buy
      [2024, 2, 3], // within 3 days into Feb -> buy
      [2024, 2, 4], // outside the window -> sell
    ]);
    const signals = generateSignals("turn_of_month", bars, {
      daysBeforeEnd: 1,
      daysAfterStart: 3,
    });
    expect(signals).toEqual(["sell", "buy", "buy", "buy", "sell"]);
  });
});

describe("payday_anomaly", () => {
  it("buys the last trading day of the month and the first windowDays of the next", () => {
    const bars = barsFromDates([
      [2024, 1, 15], // mid-month -> sell
      [2024, 1, 31], // last day of Jan -> buy
      [2024, 2, 1], // first day of Feb -> buy
      [2024, 2, 2], // outside a 1-day window -> sell
    ]);
    const signals = generateSignals("payday_anomaly", bars, { windowDays: 1 });
    expect(signals).toEqual(["sell", "buy", "buy", "sell"]);
  });
});

describe("option_expiry_week", () => {
  it("buys the daysBefore trading days leading into the monthly expiry (last Thursday)", () => {
    // January 2024's last Thursday is the 25th.
    const bars = barsFromDates([
      [2024, 1, 18], // 7 days out -> sell
      [2024, 1, 22], // 3 days out, within the window -> buy
      [2024, 1, 25], // expiry day itself -> buy
      [2024, 1, 26], // day after expiry -> sell
    ]);
    const signals = generateSignals("option_expiry_week", bars, { daysBefore: 3 });
    expect(signals).toEqual(["sell", "buy", "buy", "sell"]);
  });
});

describe("january_barometer", () => {
  it("stays long through the year after a positive January, flat after a negative one", () => {
    function bar(y: number, m: number, d: number, close: number): HistoricalBar {
      return { time: Date.UTC(y, m - 1, d) / 1000, open: close, high: close, low: close, close, volume: 0 };
    }
    const bars = [
      bar(2023, 1, 1, 100),
      bar(2023, 1, 31, 110), // +10% -> long for the rest of 2023
      bar(2023, 2, 1, 105),
      bar(2024, 1, 1, 100),
      bar(2024, 1, 31, 90), // -10% -> flat for the rest of 2024
      bar(2024, 2, 1, 95),
    ];
    const signals = generateSignals("january_barometer", bars, {});
    expect(signals).toEqual(["hold", "hold", "buy", "hold", "hold", "sell"]);
  });
});

describe("overnight_anomaly", () => {
  it("buys after recent gap-ups and sells after recent gap-downs", () => {
    function ohlc(open: number, close: number): HistoricalBar {
      return { time: 0, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 0 };
    }
    // i1,i2: gap up from the prior close (+5%, +6.67%)
    // i3,i4: gap down from the prior close (-10.7%, -10%)
    const bars = [
      ohlc(100, 100),
      ohlc(105, 105),
      ohlc(112, 112),
      ohlc(100, 100),
      ohlc(90, 90),
    ];
    const signals = generateSignals("overnight_anomaly", bars, { lookback: 2 });
    expect(signals).toEqual(["hold", "hold", "buy", "sell", "sell"]);
  });
});

describe("momentum_reversal_vol", () => {
  const params = { fastPeriod: 2, slowPeriod: 5, rsiPeriod: 3, maxRsi: 70, volPeriod: 3, maxVolPct: 5 };

  it("sells throughout a clean downtrend regardless of RSI/vol (the trend leg alone fails)", () => {
    const bars = barsFromCloses([110, 108, 106, 104, 102, 100, 98, 96, 94, 92, 90]);
    const signals = generateSignals("momentum_reversal_vol", bars, params);
    expect(signals.slice(4)).toEqual(new Array(7).fill("sell"));
  });

  it("alternates buy/sell in an uptrend as the RSI overbought guard trips on the zigzag", () => {
    // Trend is up throughout (fast SMA > slow SMA from i4 on), but a
    // short RSI period on a zigzag pattern swings RSI above/below the
    // 70 overbought guard every other bar — demonstrating the guard
    // actively filtering out half the trend-following signals, not just
    // rubber-stamping the trend leg.
    const bars = barsFromCloses([100, 102, 101, 103, 102, 104, 103, 105, 104, 106, 105, 107, 106, 108, 107, 109, 108, 110]);
    const signals = generateSignals("momentum_reversal_vol", bars, params);
    expect(signals.slice(4)).toEqual([
      "buy", "sell", "buy", "sell", "buy", "sell", "buy", "sell", "buy", "sell", "buy", "sell", "buy", "sell",
    ]);
  });
});
