import type { HistoricalBar } from "../market-data/types";
import { rollingHigh, rollingLow, rsi, sma } from "./indicators";
import { generateMlSignals } from "./ml/strategy";
import type { Signal, StrategyDef, StrategyId, StrategyParams } from "./types";

// Signals are state-based ("would I want to be long right now?"), not
// edge-triggered — the engine only acts on a buy signal while flat and a
// sell signal while holding, so a signal persisting across many bars is
// harmless: it just means "stay in this position."
export const STRATEGIES: Record<StrategyId, StrategyDef> = {
  sma_crossover: {
    id: "sma_crossover",
    name: "SMA Crossover",
    description:
      "Buy while the fast moving average is above the slow one, sell once it drops below.",
    kind: "single_symbol",
    paramSchema: [
      { key: "fastPeriod", label: "Fast period", default: 10, min: 2, max: 50 },
      { key: "slowPeriod", label: "Slow period", default: 30, min: 5, max: 200 },
    ],
  },
  rsi_mean_reversion: {
    id: "rsi_mean_reversion",
    name: "RSI Mean Reversion",
    description:
      "Buy when RSI drops into oversold territory, sell once it climbs into overbought.",
    kind: "single_symbol",
    paramSchema: [
      { key: "period", label: "RSI period", default: 14, min: 2, max: 50 },
      { key: "oversold", label: "Oversold threshold", default: 30, min: 5, max: 45 },
      { key: "overbought", label: "Overbought threshold", default: 70, min: 55, max: 95 },
    ],
  },
  momentum_breakout: {
    id: "momentum_breakout",
    name: "Momentum Breakout",
    description: "Buy on a new N-bar high breakout, sell on a new N-bar low breakdown.",
    kind: "single_symbol",
    paramSchema: [{ key: "lookback", label: "Lookback bars", default: 20, min: 5, max: 100 }],
  },
  ml_momentum: {
    id: "ml_momentum",
    name: "ML Momentum (beta)",
    description:
      "Trains a logistic regression on technical factors over the first part of the window, then " +
      "trades its next-bar direction predictions on the rest. Experimental — small sample sizes " +
      "make this easy to overfit; check the AI review's overfitting comments before trusting it.",
    kind: "single_symbol",
    paramSchema: [
      { key: "trainRatio", label: "Training window fraction", default: 0.6, min: 0.3, max: 0.8 },
      { key: "margin", label: "Confidence margin", default: 0.05, min: 0, max: 0.3 },
    ],
  },
};

// auxiliaryBars is only populated for strategies whose StrategyDef sets
// `auxiliary` (e.g. crude oil vs. an equity) — the API route fetches it
// once and threads it through here; every other strategy ignores it.
export function generateSignals(
  strategyId: StrategyId,
  bars: HistoricalBar[],
  params: StrategyParams,
  auxiliaryBars?: HistoricalBar[]
): Signal[] {
  switch (strategyId) {
    case "sma_crossover":
      return smaCrossoverSignals(bars, params);
    case "rsi_mean_reversion":
      return rsiMeanReversionSignals(bars, params);
    case "momentum_breakout":
      return momentumBreakoutSignals(bars, params);
    case "ml_momentum":
      return generateMlSignals(bars, params);
    default:
      void auxiliaryBars;
      throw new Error(`Unknown or non-single-symbol strategy: ${strategyId}`);
  }
}

function smaCrossoverSignals(bars: HistoricalBar[], params: StrategyParams): Signal[] {
  const fast = sma(bars, params.fastPeriod);
  const slow = sma(bars, params.slowPeriod);
  return bars.map((_, i) => {
    const f = fast[i];
    const s = slow[i];
    if (f === undefined || s === undefined) return "hold";
    if (f > s) return "buy";
    if (f < s) return "sell";
    return "hold";
  });
}

function rsiMeanReversionSignals(bars: HistoricalBar[], params: StrategyParams): Signal[] {
  const values = rsi(bars, params.period);
  return values.map((v) => {
    if (v === undefined) return "hold";
    if (v < params.oversold) return "buy";
    if (v > params.overbought) return "sell";
    return "hold";
  });
}

function momentumBreakoutSignals(bars: HistoricalBar[], params: StrategyParams): Signal[] {
  const highs = rollingHigh(bars, params.lookback);
  const lows = rollingLow(bars, params.lookback);
  return bars.map((bar, i) => {
    const h = highs[i];
    const l = lows[i];
    if (h === undefined || l === undefined) return "hold";
    if (bar.close > h) return "buy";
    if (bar.close < l) return "sell";
    return "hold";
  });
}
