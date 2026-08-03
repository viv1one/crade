import type { HistoricalBar, Fundamentals } from "../market-data/types";
import type { UniverseStock } from "../screener/universe";
import { runCrossSectionalBacktest } from "./cross-sectional-engine";
import { getScoreFn } from "./cross-sectional-strategies";
import type { LeaderboardEntry, StrategyDef, StrategyParams } from "./types";

// Every registered "cross_sectional" strategy, run over the same universe/
// bars/fundamentals with its own default params (from paramSchema) — the
// same param resolution app/api/backtest/cross-sectional/route.ts already
// does per-strategy, just looped across all of them so their metrics land
// on one comparable table instead of one at a time. Strategies whose
// `kind` isn't "cross_sectional" are silently skipped — single-symbol
// strategies don't produce a "which stocks" answer, so they're not part of
// this comparison.
export function computeLeaderboard(
  universe: UniverseStock[],
  barsBySymbol: Record<string, HistoricalBar[]>,
  fundamentalsBySymbol: Record<string, Fundamentals | undefined>,
  strategies: StrategyDef[],
  startingCash: number
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const strategy of strategies) {
    if (strategy.kind !== "cross_sectional") continue;

    const params: StrategyParams = {};
    for (const spec of strategy.paramSchema) params[spec.key] = spec.default;

    const scoreFn = getScoreFn(strategy.id);
    const { metrics, finalHoldings } = runCrossSectionalBacktest(
      universe,
      barsBySymbol,
      fundamentalsBySymbol,
      params,
      startingCash,
      scoreFn,
      strategy.rebalanceFrequency ?? "monthly"
    );

    entries.push({
      strategyId: strategy.id,
      name: strategy.name,
      family: strategy.family,
      approximation: strategy.approximation,
      metrics,
      currentPicks: finalHoldings,
    });
  }

  return entries.sort((a, b) => b.metrics.cagrPct - a.metrics.cagrPct);
}
