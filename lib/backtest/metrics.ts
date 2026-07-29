import type { Trade } from "../paper-trading/types";
import type { BacktestMetrics, EquityPoint } from "./types";

// Shared by the single-symbol engine and the portfolio engine — both reduce
// down to "an equity curve, a trade list, starting cash, and a buy-and-hold
// comparison," so the metric math only needs to exist once.
export function computeMetrics(
  equityCurve: EquityPoint[],
  trades: Trade[],
  startingCash: number,
  buyHoldReturnPct: number
): BacktestMetrics {
  const finalEquity = equityCurve[equityCurve.length - 1].equity;
  const totalReturnPct = ((finalEquity - startingCash) / startingCash) * 100;

  const firstTime = equityCurve[0].time;
  const lastTime = equityCurve[equityCurve.length - 1].time;
  const years = Math.max((lastTime - firstTime) / (365 * 24 * 60 * 60), 1 / 365);
  const cagrPct =
    finalEquity > 0 ? (Math.pow(finalEquity / startingCash, 1 / years) - 1) * 100 : -100;

  let peak = equityCurve[0].equity;
  let maxDrawdownPct = 0;
  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    if (peak > 0) maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - point.equity) / peak) * 100);
  }

  const periodReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    if (prev > 0) periodReturns.push((equityCurve[i].equity - prev) / prev);
  }

  const sells = trades.filter((t) => t.side === "sell");
  const wins = sells.filter((t) => (t.realizedPnl ?? 0) > 0);

  return {
    totalReturnPct,
    cagrPct,
    maxDrawdownPct,
    sharpe: computeSharpe(periodReturns),
    winRatePct: sells.length > 0 ? (wins.length / sells.length) * 100 : 0,
    tradeCount: trades.length,
    finalEquity,
    buyHoldReturnPct,
  };
}

// Annualized, assuming roughly daily bars (252 trading days/year) — a
// simplification for intraday intervals, but this app's backtests are
// aimed at daily/weekly swing strategies, not HFT.
function computeSharpe(periodReturns: number[]): number {
  if (periodReturns.length < 2) return 0;
  const mean = periodReturns.reduce((a, b) => a + b, 0) / periodReturns.length;
  const variance =
    periodReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (periodReturns.length - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return (mean / stdDev) * Math.sqrt(252);
}
