import type { RankContext, ScoreFn, StrategyId } from "./types";

// Trailing return over ctx.params.lookback bars — the same math as
// indicators.ts's trailingReturn, but reading straight off the tail of
// ctx.barsBySymbol[symbol] (already truncated to "as of now" by the
// cross-sectional engine) rather than needing a whole per-index array.
function trailingReturnScore(symbol: string, ctx: RankContext, lookbackDefault: number): number | undefined {
  const bars = ctx.barsBySymbol[symbol];
  const lookback = Math.floor(ctx.params.lookback ?? lookbackDefault);
  if (!bars || bars.length <= lookback) return undefined;
  const past = bars[bars.length - 1 - lookback].close;
  if (past === 0) return undefined;
  const now = bars[bars.length - 1].close;
  return (now - past) / past;
}

function momentumFactorScore(symbol: string, ctx: RankContext): number | undefined {
  return trailingReturnScore(symbol, ctx, 126);
}

// Populated incrementally as each cross-sectional strategy is
// implemented — mirrors strategies.ts's generateSignals() switch, just
// keyed by lookup instead since strategies register a whole ScoreFn
// rather than a case in a shared function body.
const SCORE_FUNCTIONS: Partial<Record<StrategyId, ScoreFn>> = {
  momentum_factor: momentumFactorScore,
};

export function getScoreFn(strategyId: StrategyId): ScoreFn {
  const fn = SCORE_FUNCTIONS[strategyId];
  if (!fn) throw new Error(`No cross-sectional scoring function registered for "${strategyId}"`);
  return fn;
}
