import type { Fundamentals, HistoricalBar } from "../market-data/types";
import type { UniverseStock } from "../screener/universe";
import type { Trade } from "../paper-trading/types";

export type StrategyId =
  | "sma_crossover"
  | "rsi_mean_reversion"
  | "momentum_breakout"
  | "ml_momentum"
  | "trend_following";

export type Signal = "buy" | "sell" | "hold";

export type StrategyParams = Record<string, number>;

export interface StrategyParamSpec {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
}

// "single_symbol" runs through generateSignals()/runBacktest() unchanged.
// "cross_sectional" runs through rankUniverse()/runCrossSectionalBacktest()
// instead — it ranks the whole NIFTY_50 universe at each rebalance date
// rather than emitting a per-bar signal for one symbol.
export type StrategyKind = "single_symbol" | "cross_sectional";

export interface StrategyDef {
  id: StrategyId;
  name: string;
  description: string;
  kind: StrategyKind;
  paramSchema: StrategyParamSpec[];
  // Set only for strategies that approximate something the app's data
  // providers can't actually supply (e.g. book value, an options
  // calendar) — the UI renders a visible "Proxy" badge whenever this is
  // present, per the loop file's Tier B labeling requirement.
  approximation?: string;
  // Set only for the one single-symbol strategy that needs a second real
  // price series beyond its own symbol (crude oil vs. an equity). Fetched
  // once by the API route and threaded through generateSignals() as
  // auxiliaryBars — every other strategy ignores it.
  auxiliary?: "crude_oil";
  // Only meaningful when kind is "cross_sectional" — how often
  // runCrossSectionalBacktest() re-ranks and re-picks the top-N universe
  // members. Defaults to "monthly" when unset.
  rebalanceFrequency?: "monthly" | "weekly";
  // Only meaningful when kind is "cross_sectional" — whether the API
  // route needs to fetch Fundamentals for the whole universe before
  // scoring. Most cross-sectional strategies are price-only; skipping the
  // fundamentals fetch for those halves the free-provider request volume
  // per run.
  needsFundamentals?: boolean;
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

export interface CrossSectionalBacktestConfig {
  strategyId: StrategyId;
  interval: string;
  range: string;
  params: StrategyParams;
  startingCash: number;
}

export interface CrossSectionalBacktestResult {
  config: CrossSectionalBacktestConfig;
  equityCurve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
}

// What a cross-sectional scoring function sees at one rebalance date.
// barsBySymbol is truncated to "as of now" for every symbol (not the full
// series) so a strategy can't accidentally look ahead by comparing itself
// to another symbol's future price — the same causal guarantee the
// single-symbol indicators in indicators.ts already give per-index.
export interface RankContext {
  barsBySymbol: Record<string, HistoricalBar[]>;
  fundamentalsBySymbol: Record<string, Fundamentals | undefined>;
  universe: UniverseStock[];
  params: StrategyParams;
}

// Returns undefined to exclude a symbol from this rebalance's ranking
// (not enough history yet, missing fundamentals it needs, etc.).
export type ScoreFn = (symbol: string, ctx: RankContext) => number | undefined;

export interface PairsParams {
  lookback: number;
  entryZ: number;
  exitZ: number;
}

export interface PairsBacktestConfig {
  symbolA: string;
  symbolB: string;
  interval: string;
  range: string;
  params: PairsParams;
  startingCash: number;
}

export interface PairsBacktestResult {
  config: PairsBacktestConfig;
  // Every leg of every open/close is its own row (a completed round trip
  // is 4 rows: open A, open B, close A, close B) — deliberately reuses the
  // existing Trade shape so the UI's trade-log table needs no pairs-
  // specific rendering. metrics.tradeCount/winRatePct are NOT derived from
  // this list directly (see runPairsBacktest) since "buy"/"sell" here
  // means long/short-open as well as close, not just close.
  trades: Trade[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
}

export const DEFAULT_STARTING_CASH = 100_000;
