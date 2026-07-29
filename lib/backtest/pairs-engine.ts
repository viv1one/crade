import type { HistoricalBar } from "../market-data/types";
import type { Trade } from "../paper-trading/types";
import { computeMetrics } from "./metrics";
import type { EquityPoint, PairsBacktestResult, PairsParams } from "./types";

function makeTradeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface AlignedBar {
  time: number;
  priceA: number;
  priceB: number;
}

// Only timestamps present in *both* series — a pair trade needs both legs
// priced at once, so there's nothing sensible to do with a day only one
// side traded on. In practice two NIFTY_50 names on the same interval
// share almost all trading days.
function alignBars(barsA: HistoricalBar[], barsB: HistoricalBar[]): AlignedBar[] {
  const closeB = new Map(barsB.map((b) => [b.time, b.close]));
  const aligned: AlignedBar[] = [];
  for (const bar of barsA) {
    const priceB = closeB.get(bar.time);
    if (priceB !== undefined) aligned.push({ time: bar.time, priceA: bar.close, priceB });
  }
  return aligned.sort((a, b) => a.time - b.time);
}

// Causal rolling z-score of the log price ratio — each index only uses the
// `period` values up to and including itself.
function rollingLogRatioZScore(aligned: AlignedBar[], period: number): (number | undefined)[] {
  const ratios = aligned.map((p) => Math.log(p.priceA / p.priceB));
  const out: (number | undefined)[] = new Array(ratios.length).fill(undefined);
  for (let i = period - 1; i < ratios.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += ratios[j];
    const mean = sum / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (ratios[j] - mean) ** 2;
    variance /= period;
    const std = Math.sqrt(variance);
    if (std === 0) continue;
    out[i] = (ratios[i] - mean) / std;
  }
  return out;
}

type Direction = "long_spread" | "short_spread"; // long_spread = long A / short B

interface OpenPosition {
  direction: Direction;
  qtyA: number;
  qtyB: number;
  entryPriceA: number;
  entryPriceB: number;
}

// Market-neutral spread trade on the rolling z-score of log(priceA/priceB):
// enters when the spread has stretched past `entryZ` standard deviations
// (betting on reversion), exits once it's back within `exitZ`. Fully
// self-contained P&L accounting — deliberately does NOT reuse
// applyBuy/applySell from lib/paper-trading/store.ts, since a short leg
// has no representation there (that store is shared with the live
// paper-trading feature and long-only by design; not touching it).
export function runPairsBacktest(
  symbolA: string,
  symbolB: string,
  barsA: HistoricalBar[],
  barsB: HistoricalBar[],
  params: PairsParams,
  startingCash: number
): Omit<PairsBacktestResult, "config"> {
  const aligned = alignBars(barsA, barsB);
  if (aligned.length === 0) {
    throw new Error(`No overlapping trading history between ${symbolA} and ${symbolB}`);
  }

  const zScores = rollingLogRatioZScore(aligned, Math.max(2, Math.floor(params.lookback)));

  let cash = startingCash;
  let position: OpenPosition | null = null;
  const trades: Trade[] = [];
  const roundTripPnls: number[] = [];
  const equityCurve: EquityPoint[] = [];

  function open(direction: Direction, priceA: number, priceB: number, time: number) {
    const notionalPerLeg = cash / 2;
    const qtyA = Math.floor(notionalPerLeg / priceA);
    const qtyB = Math.floor(notionalPerLeg / priceB);
    if (qtyA <= 0 || qtyB <= 0) return; // not enough capital for both legs

    if (direction === "long_spread") {
      cash = cash - qtyA * priceA + qtyB * priceB; // buy A, short-sell B
      trades.push({ id: makeTradeId(), symbol: symbolA, side: "buy", qty: qtyA, price: priceA, timestamp: time });
      trades.push({ id: makeTradeId(), symbol: symbolB, side: "sell", qty: qtyB, price: priceB, timestamp: time });
    } else {
      cash = cash + qtyA * priceA - qtyB * priceB; // short-sell A, buy B
      trades.push({ id: makeTradeId(), symbol: symbolA, side: "sell", qty: qtyA, price: priceA, timestamp: time });
      trades.push({ id: makeTradeId(), symbol: symbolB, side: "buy", qty: qtyB, price: priceB, timestamp: time });
    }
    position = { direction, qtyA, qtyB, entryPriceA: priceA, entryPriceB: priceB };
  }

  function close(priceA: number, priceB: number, time: number) {
    if (!position) return;
    const { direction, qtyA, qtyB, entryPriceA, entryPriceB } = position;
    let pnlA: number;
    let pnlB: number;
    if (direction === "long_spread") {
      pnlA = (priceA - entryPriceA) * qtyA;
      pnlB = (entryPriceB - priceB) * qtyB;
      cash = cash + qtyA * priceA - qtyB * priceB; // sell A, buy back B
      trades.push({ id: makeTradeId(), symbol: symbolA, side: "sell", qty: qtyA, price: priceA, timestamp: time, realizedPnl: pnlA });
      trades.push({ id: makeTradeId(), symbol: symbolB, side: "buy", qty: qtyB, price: priceB, timestamp: time, realizedPnl: pnlB });
    } else {
      pnlA = (entryPriceA - priceA) * qtyA;
      pnlB = (priceB - entryPriceB) * qtyB;
      cash = cash - qtyA * priceA + qtyB * priceB; // buy back A, sell B
      trades.push({ id: makeTradeId(), symbol: symbolA, side: "buy", qty: qtyA, price: priceA, timestamp: time, realizedPnl: pnlA });
      trades.push({ id: makeTradeId(), symbol: symbolB, side: "sell", qty: qtyB, price: priceB, timestamp: time, realizedPnl: pnlB });
    }
    roundTripPnls.push(pnlA + pnlB);
    position = null;
  }

  for (let i = 0; i < aligned.length; i++) {
    const { time, priceA, priceB } = aligned[i];
    const z = zScores[i];

    if (position === null && z !== undefined) {
      if (z > params.entryZ) open("short_spread", priceA, priceB, time);
      else if (z < -params.entryZ) open("long_spread", priceA, priceB, time);
    } else if (position !== null && z !== undefined && Math.abs(z) < params.exitZ) {
      close(priceA, priceB, time);
    }

    let positionValue = 0;
    if (position) {
      const p = position as OpenPosition;
      positionValue = p.direction === "long_spread"
        ? p.qtyA * priceA - p.qtyB * priceB
        : -p.qtyA * priceA + p.qtyB * priceB;
    }
    equityCurve.push({ time, equity: cash + positionValue });
  }

  // computeMetrics's win-rate/tradeCount reasoning assumes every "sell" in
  // the list is a completed exit — not true here, since a short-open is
  // also a "sell" with no realizedPnl yet. Feed it one synthetic
  // "sell"-with-realizedPnl per *closed round trip* instead (both legs'
  // P&L combined), so win rate reflects "how many pair trades were
  // profitable," not individual leg bookkeeping. The richer `trades` list
  // above (every leg of every open/close) is still what's returned/shown.
  const metricsTrades: Trade[] = roundTripPnls.map((pnl, i) => ({
    id: `pair-round-trip-${i}`,
    symbol: `${symbolA}/${symbolB}`,
    side: "sell",
    qty: 1,
    price: 0,
    timestamp: 0,
    realizedPnl: pnl,
  }));

  const buyHoldReturnPct =
    ((aligned[aligned.length - 1].priceA - aligned[0].priceA) / aligned[0].priceA) * 100;

  return {
    trades,
    equityCurve,
    metrics: computeMetrics(equityCurve, metricsTrades, startingCash, buyHoldReturnPct),
  };
}
