import type { Trade } from "../paper-trading/types";

export type StrategyId =
  | "sma_crossover"
  | "rsi_mean_reversion"
  | "momentum_breakout"
  | "ml_momentum";

export type Signal = "buy" | "sell" | "hold";

export type StrategyParams = Record<string, number>;

export interface StrategyParamSpec {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
}

export interface StrategyDef {
  id: StrategyId;
  name: string;
  description: string;
  paramSchema: StrategyParamSpec[];
}

export interface BacktestConfig {
  symbol: string;
  interval: string;
  range: string;
  strategyId: StrategyId;
  params: StrategyParams;
  startingCash: number;
}

export interface EquityPoint {
  time: number;
  equity: number;
}

export interface BacktestMetrics {
  totalReturnPct: number;
  cagrPct: number;
  maxDrawdownPct: number;
  sharpe: number;
  winRatePct: number;
  tradeCount: number;
  finalEquity: number;
  buyHoldReturnPct: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  equityCurve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
}

export interface PortfolioBacktestConfig {
  symbols: string[];
  interval: string;
  range: string;
  strategyId: StrategyId;
  params: StrategyParams;
  startingCash: number;
}

export interface SymbolContribution {
  symbol: string;
  startingCash: number;
  finalEquity: number;
  totalReturnPct: number;
  tradeCount: number;
}

export interface PortfolioBacktestResult {
  config: PortfolioBacktestConfig;
  equityCurve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
  bySymbol: SymbolContribution[];
}

export const DEFAULT_STARTING_CASH = 100_000;
