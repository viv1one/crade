import type { Fundamentals, HistoricalBar } from "../market-data/types";
import type { UniverseStock } from "../screener/universe";
import type { RankContext, StrategyId } from "../backtest/types";
import { getScoreFn } from "../backtest/cross-sectional-strategies";

// The four already-registered cross-sectional ScoreFns (lib/backtest/
// cross-sectional-strategies.ts) that make sense as a "how does this
// holding compare to the rest of the market" read: momentum, low
// volatility, sector momentum, and the P/E+yield value proxy. No changes
// needed to that file — getScoreFn is already exported for exactly this
// kind of standalone lookup.
const FACTORS: { id: StrategyId; label: string }[] = [
  { id: "momentum_factor", label: "momentum" },
  { id: "low_volatility", label: "lowVolatility" },
  { id: "sector_momentum", label: "sectorMomentum" },
  { id: "value_proxy", label: "value" },
];

export interface FactorTilt {
  symbol: string;
  // Percentile (0-100) of this symbol's score within the full universe
  // passed in — higher means it ranks more strongly on that factor
  // relative to the rest of the universe. Omitted (not zero) when the
  // symbol wasn't scoreable (missing data) or isn't in the universe at all.
  momentumPercentile?: number;
  lowVolatilityPercentile?: number;
  sectorMomentumPercentile?: number;
  valuePercentile?: number;
}

// Percentile = fraction of the universe's defined scores this symbol beats
// outright, so it reads as "stronger than N% of the Nifty 50 on this
// measure" regardless of each factor's own raw scale (a value z-score sum
// and a raw trailing-return fraction aren't otherwise comparable numbers).
function percentileOf(score: number, allScores: number[]): number {
  const beaten = allScores.filter((s) => s < score).length;
  return (beaten / allScores.length) * 100;
}

// Pure, I/O-free — the caller (an API route) is responsible for fetching
// bars/fundamentals for the whole universe first (see fetchUniverseData in
// fetch.ts), which is the expensive, opt-in part this function itself
// doesn't gate.
export function computeFactorTilts(
  heldSymbols: string[],
  universe: UniverseStock[],
  barsBySymbol: Record<string, HistoricalBar[]>,
  fundamentalsBySymbol: Record<string, Fundamentals | undefined>
): FactorTilt[] {
  const ctx: RankContext = { barsBySymbol, fundamentalsBySymbol, universe, params: {} };

  const universeScoresByFactor = new Map<StrategyId, Map<string, number>>();
  for (const { id } of FACTORS) {
    const scoreFn = getScoreFn(id);
    const scores = new Map<string, number>();
    for (const stock of universe) {
      const score = scoreFn(stock.symbol, ctx);
      if (score !== undefined) scores.set(stock.symbol, score);
    }
    universeScoresByFactor.set(id, scores);
  }

  return heldSymbols.map((symbol) => {
    const tilt: FactorTilt = { symbol };
    for (const { id, label } of FACTORS) {
      const scores = universeScoresByFactor.get(id)!;
      const ownScore = scores.get(symbol);
      if (ownScore === undefined) continue;
      const percentile = percentileOf(ownScore, Array.from(scores.values()));
      if (label === "momentum") tilt.momentumPercentile = percentile;
      else if (label === "lowVolatility") tilt.lowVolatilityPercentile = percentile;
      else if (label === "sectorMomentum") tilt.sectorMomentumPercentile = percentile;
      else if (label === "value") tilt.valuePercentile = percentile;
    }
    return tilt;
  });
}

function formatPercentile(p: number | undefined): string {
  return p === undefined ? "not available" : `${Math.round(p)}th percentile`;
}

// Plain-text block appended to the diagnostics prompt when "deep" analysis
// is requested — same convention as lib/portfolio/diagnostics.ts's
// formatDiagnosticsForPrompt.
export function formatFactorTiltsForPrompt(tilts: FactorTilt[]): string {
  const lines = [
    "Deep factor analysis (percentile rank vs. the full Nifty 50 universe — higher percentile " +
      "means stronger on that measure relative to the whole index, still not a return forecast):",
    ...tilts.map(
      (t) =>
        `- ${t.symbol}: momentum ${formatPercentile(t.momentumPercentile)}, ` +
        `low-volatility ${formatPercentile(t.lowVolatilityPercentile)}, ` +
        `sector momentum ${formatPercentile(t.sectorMomentumPercentile)}, ` +
        `value ${formatPercentile(t.valuePercentile)}`
    ),
  ];
  return lines.join("\n");
}
