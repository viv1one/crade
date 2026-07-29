import type { HistoricalBar, Fundamentals } from "../market-data/types";
import type { UniverseStock } from "../screener/universe";
import { applyBuy, applySell, createEmptyPortfolio } from "../paper-trading/store";
import type { PortfolioState } from "../paper-trading/types";
import { calendarMonth, calendarYear } from "./calendar";
import { computeMetrics } from "./metrics";
import type {
  CrossSectionalBacktestResult,
  EquityPoint,
  RankContext,
  ScoreFn,
  StrategyParams,
} from "./types";

const WEEK_SECONDS = 7 * 24 * 60 * 60;

// Long-only, single shared cash pool across the whole universe. Re-ranks
// and re-picks the top params.topN members on each rebalance date; between
// rebalances, positions are just held and marked to market — this is
// intentionally simpler than a full rebalance-to-target-weight scheme
// (which would trade every held position on every rebalance to keep exact
// equal weight): only membership changes generate trades, existing holds
// that stay in the top-N keep whatever size they were bought at. New cash
// freed by exits (plus any idle cash) is split equally across new
// entrants only, sized with the same floor(cash/price) rule the
// single-symbol engine uses.
export function runCrossSectionalBacktest(
  universe: UniverseStock[],
  barsBySymbol: Record<string, HistoricalBar[]>,
  fundamentalsBySymbol: Record<string, Fundamentals | undefined>,
  params: StrategyParams,
  startingCash: number,
  scoreFn: ScoreFn,
  rebalanceFrequency: "monthly" | "weekly" = "monthly"
): Omit<CrossSectionalBacktestResult, "config"> {
  const symbols = universe.map((u) => u.symbol).filter((s) => (barsBySymbol[s]?.length ?? 0) > 0);
  if (symbols.length === 0) {
    throw new Error("No historical data for any symbol in the universe");
  }

  const topN = Math.max(1, Math.floor(params.topN ?? 5));

  // Aligned timeline: union of every symbol's bar timestamps, sorted.
  const allTimes = new Set<number>();
  for (const symbol of symbols) {
    for (const bar of barsBySymbol[symbol]) allTimes.add(bar.time);
  }
  const timeline = Array.from(allTimes).sort((a, b) => a - b);

  // Per-symbol cursor into its own bars array — advances forward only, so
  // finding "the latest bar at or before this timeline point" across the
  // whole walk is O(n) total per symbol, not O(n log n) per lookup.
  const cursor: Record<string, number> = Object.fromEntries(symbols.map((s) => [s, -1]));
  const lastKnownPrice: Record<string, number> = {};

  let state: PortfolioState = { ...createEmptyPortfolio(), cash: startingCash };
  const equityCurve: EquityPoint[] = [];
  let lastRebalanceKey: string | null = null;
  let initialTopN: string[] | null = null;

  for (const time of timeline) {
    const barsUpToNow: Record<string, HistoricalBar[]> = {};
    for (const symbol of symbols) {
      const bars = barsBySymbol[symbol];
      let i = cursor[symbol];
      while (i + 1 < bars.length && bars[i + 1].time <= time) i++;
      cursor[symbol] = i;
      if (i >= 0) {
        barsUpToNow[symbol] = bars.slice(0, i + 1);
        lastKnownPrice[symbol] = bars[i].close;
      }
    }

    const rebalanceKey = rebalanceFrequency === "weekly"
      ? String(Math.floor(time / WEEK_SECONDS))
      : `${calendarYear(time)}-${calendarMonth(time)}`;

    if (rebalanceKey !== lastRebalanceKey) {
      lastRebalanceKey = rebalanceKey;

      const ctx: RankContext = { barsBySymbol: barsUpToNow, fundamentalsBySymbol, universe, params };
      const scored = symbols
        .filter((s) => barsUpToNow[s] !== undefined)
        .map((symbol) => ({ symbol, score: scoreFn(symbol, ctx) }))
        .filter((row): row is { symbol: string; score: number } => row.score !== undefined)
        .sort((a, b) => b.score - a.score);

      const target = new Set(scored.slice(0, topN).map((row) => row.symbol));
      // Not just "the first rebalance ever" — a strategy with a long
      // lookback (e.g. 126-bar momentum) may produce an empty target on
      // its first few attempts simply from warmup, before any symbol has
      // enough history to score. Wait for the first rebalance that
      // actually picks something, so buyHoldReturnPct reflects real
      // initial picks instead of freezing at 0 from an empty snapshot.
      if (initialTopN === null && target.size > 0) initialTopN = Array.from(target);

      for (const symbol of Object.keys(state.holdings)) {
        if (!target.has(symbol)) {
          const price = lastKnownPrice[symbol];
          const qty = state.holdings[symbol].qty;
          if (price !== undefined && qty > 0) state = applySell(state, symbol, qty, price);
        }
      }

      const newEntrants = Array.from(target).filter((symbol) => !state.holdings[symbol]);
      if (newEntrants.length > 0) {
        const perSymbolCash = state.cash / newEntrants.length;
        for (const symbol of newEntrants) {
          const price = lastKnownPrice[symbol];
          if (price === undefined) continue;
          const qty = Math.floor(perSymbolCash / price);
          if (qty > 0) state = applyBuy(state, symbol, qty, price);
        }
      }
    }

    const positionValue = Object.values(state.holdings).reduce(
      (sum, h) => sum + h.qty * (lastKnownPrice[h.symbol] ?? h.avgCost),
      0
    );
    equityCurve.push({ time, equity: state.cash + positionValue });
  }

  const trades = state.trades.slice().reverse(); // store.ts prepends, restore chronological order

  const buyHoldReturnPct = (() => {
    const picks = initialTopN ?? [];
    if (picks.length === 0) return 0;
    const returns = picks.map((symbol) => {
      const bars = barsBySymbol[symbol];
      return ((bars[bars.length - 1].close - bars[0].close) / bars[0].close) * 100;
    });
    return returns.reduce((a, b) => a + b, 0) / returns.length;
  })();

  return {
    equityCurve,
    trades,
    metrics: computeMetrics(equityCurve, trades, startingCash, buyHoldReturnPct),
  };
}
