import type { HistoricalBar } from "../market-data/types";
import { applyBuy, applySell, createEmptyPortfolio } from "../paper-trading/store";
import type { PortfolioState } from "../paper-trading/types";
import { computeMetrics } from "./metrics";
import { generateSignals } from "./strategies";
import type { BacktestResult, EquityPoint, StrategyId, StrategyParams } from "./types";

// Long-only, single-symbol, all-in/all-out — sized as floor(cash / price) on
// buy, full exit on sell. Reuses the already-tested cash/avgCost/realizedPnl
// math from lib/paper-trading/store.ts instead of duplicating it.
export function runBacktest(
  symbol: string,
  bars: HistoricalBar[],
  strategyId: StrategyId,
  params: StrategyParams,
  startingCash: number
): Omit<BacktestResult, "config"> {
  if (bars.length === 0) {
    throw new Error("No historical data to backtest against");
  }

  const signals = generateSignals(strategyId, bars, params);
  let state: PortfolioState = { ...createEmptyPortfolio(), cash: startingCash };
  const equityCurve: EquityPoint[] = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const signal = signals[i];
    const holding = state.holdings[symbol];

    if (signal === "buy" && !holding) {
      const qty = Math.floor(state.cash / bar.close);
      if (qty > 0) {
        state = applyBuy(state, symbol, qty, bar.close);
      }
    } else if (signal === "sell" && holding) {
      state = applySell(state, symbol, holding.qty, bar.close);
    }

    const positionValue = (state.holdings[symbol]?.qty ?? 0) * bar.close;
    equityCurve.push({ time: bar.time, equity: state.cash + positionValue });
  }

  const trades = state.trades.slice().reverse(); // store.ts prepends, restore chronological order
  const buyHoldReturnPct = ((bars[bars.length - 1].close - bars[0].close) / bars[0].close) * 100;

  return {
    equityCurve,
    trades,
    metrics: computeMetrics(equityCurve, trades, startingCash, buyHoldReturnPct),
  };
}
