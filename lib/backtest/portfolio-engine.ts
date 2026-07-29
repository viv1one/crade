import { EventEngine } from "../events/engine";
import type { HistoricalBar } from "../market-data/types";
import type { Trade } from "../paper-trading/types";
import { runBacktest } from "./engine";
import { computeMetrics } from "./metrics";
import type {
  EquityPoint,
  PortfolioBacktestResult,
  StrategyId,
  StrategyParams,
  SymbolContribution,
} from "./types";

type PortfolioEvents = {
  "symbol:completed": {
    symbol: string;
    equityCurve: EquityPoint[];
    trades: Trade[];
    startingCash: number;
    finalEquity: number;
    totalReturnPct: number;
    buyHoldReturnPct: number;
  };
};

// Splits capital equally across symbols and runs the existing single-symbol
// engine once per symbol unchanged, then uses an EventEngine to decouple
// that execution loop from aggregation: the "symbol:completed" handler is
// the only thing that knows how to combine results, so a future consumer
// (progress reporting, logging) can subscribe without touching the loop.
export function runPortfolioBacktest(
  symbols: string[],
  barsBySymbol: Record<string, HistoricalBar[]>,
  strategyId: StrategyId,
  params: StrategyParams,
  startingCash: number
): Omit<PortfolioBacktestResult, "config"> {
  if (symbols.length === 0) {
    throw new Error("At least one symbol is required for a portfolio backtest");
  }

  const perSymbolCash = startingCash / symbols.length;
  const events = new EventEngine<PortfolioEvents>();

  const bySymbol: SymbolContribution[] = [];
  const buyHoldReturns: number[] = [];
  const combinedTrades: Trade[] = [];
  // time -> symbol -> equity at that time, so symbols with slightly
  // different bar timestamps/counts can still be summed correctly.
  const equityBySymbolAtTime = new Map<number, Map<string, number>>();
  const allTimes = new Set<number>();

  events.on("symbol:completed", (result) => {
    bySymbol.push({
      symbol: result.symbol,
      startingCash: result.startingCash,
      finalEquity: result.finalEquity,
      totalReturnPct: result.totalReturnPct,
      tradeCount: result.trades.length,
    });
    buyHoldReturns.push(result.buyHoldReturnPct);
    combinedTrades.push(...result.trades);
    for (const point of result.equityCurve) {
      allTimes.add(point.time);
      if (!equityBySymbolAtTime.has(point.time)) equityBySymbolAtTime.set(point.time, new Map());
      equityBySymbolAtTime.get(point.time)!.set(result.symbol, point.equity);
    }
  });

  for (const symbol of symbols) {
    const bars = barsBySymbol[symbol];
    if (!bars || bars.length === 0) {
      throw new Error(`No historical data for ${symbol}`);
    }
    const result = runBacktest(symbol, bars, strategyId, params, perSymbolCash);
    events.emit("symbol:completed", {
      symbol,
      equityCurve: result.equityCurve,
      trades: result.trades,
      startingCash: perSymbolCash,
      finalEquity: result.metrics.finalEquity,
      totalReturnPct: result.metrics.totalReturnPct,
      buyHoldReturnPct: result.metrics.buyHoldReturnPct,
    });
  }

  // Forward-fill each symbol's last-known equity at every timestamp in the
  // union, then sum — handles symbols whose bars don't land on identical
  // timestamps (different listing history, halts, etc.).
  const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);
  const lastKnown = new Map<string, number>(symbols.map((s) => [s, perSymbolCash]));
  const combinedEquityCurve: EquityPoint[] = sortedTimes.map((time) => {
    const atTime = equityBySymbolAtTime.get(time)!;
    for (const symbol of symbols) {
      const value = atTime.get(symbol);
      if (value !== undefined) lastKnown.set(symbol, value);
    }
    const equity = symbols.reduce((sum, symbol) => sum + (lastKnown.get(symbol) ?? 0), 0);
    return { time, equity };
  });

  combinedTrades.sort((a, b) => a.timestamp - b.timestamp);
  const buyHoldReturnPct = buyHoldReturns.reduce((a, b) => a + b, 0) / buyHoldReturns.length;

  return {
    equityCurve: combinedEquityCurve,
    trades: combinedTrades,
    metrics: computeMetrics(combinedEquityCurve, combinedTrades, startingCash, buyHoldReturnPct),
    bySymbol,
  };
}
