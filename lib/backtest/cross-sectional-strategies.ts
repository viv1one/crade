import { calendarMonth, calendarYear } from "./calendar";
import { volatility } from "./indicators";
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

interface MonthBucket {
  startClose: number;
  endClose: number;
}

// Groups bars into calendar-month buckets in chronological order — the
// last bucket may be a partial (still in-progress) month, which is
// treated the same as a complete one for simplicity, same as any other
// "as of now" causal read the cross-sectional engine gives a strategy.
function monthlyBuckets(bars: RankContext["barsBySymbol"][string]): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  let currentKey = "";
  for (const bar of bars) {
    const key = `${calendarYear(bar.time)}-${calendarMonth(bar.time)}`;
    if (key !== currentKey) {
      buckets.push({ startClose: bar.close, endClose: bar.close });
      currentKey = key;
    } else {
      buckets[buckets.length - 1].endClose = bar.close;
    }
  }
  return buckets;
}

function consistentMomentumScore(symbol: string, ctx: RankContext): number | undefined {
  const bars = ctx.barsBySymbol[symbol];
  if (!bars || bars.length < 5) return undefined;

  const lookbackMonths = Math.floor(ctx.params.lookbackMonths ?? 6);
  const minPositiveMonths = Math.floor(ctx.params.minPositiveMonths ?? 4);

  const buckets = monthlyBuckets(bars);
  if (buckets.length < lookbackMonths) return undefined;

  const recent = buckets.slice(-lookbackMonths);
  const positiveMonths = recent.filter((b) => b.endClose > b.startClose).length;
  if (positiveMonths < minPositiveMonths) return undefined; // not consistent enough — excluded, not just low-ranked

  const windowStart = recent[0].startClose;
  if (windowStart === 0) return undefined;
  const windowEnd = recent[recent.length - 1].endClose;
  return (windowEnd - windowStart) / windowStart;
}

// Same trailing-return math as momentum, negated — the worst recent
// performer scores highest, betting on partial reversion rather than
// continuation.
function shortTermReversalScore(symbol: string, ctx: RankContext): number | undefined {
  const r = trailingReturnScore(symbol, ctx, 5);
  return r === undefined ? undefined : -r;
}

function dailyReturns(bars: RankContext["barsBySymbol"][string]): number[] {
  const out: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    if (prev !== 0) out.push((bars[i].close - prev) / prev);
  }
  return out;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Equal-weight average daily return across every symbol in ctx with
// enough history — an in-process market proxy so beta-based strategies
// don't need a separate index fetch. Reused by Residual Momentum.
function equalWeightMarketReturns(ctx: RankContext, lookback: number): number[] | undefined {
  const seriesList: number[][] = [];
  for (const symbol of Object.keys(ctx.barsBySymbol)) {
    const bars = ctx.barsBySymbol[symbol];
    if (!bars || bars.length < lookback + 1) continue;
    seriesList.push(dailyReturns(bars.slice(-(lookback + 1))));
  }
  if (seriesList.length === 0) return undefined;
  const market: number[] = new Array(lookback).fill(0);
  for (const series of seriesList) {
    for (let i = 0; i < lookback; i++) market[i] += series[i] / seriesList.length;
  }
  return market;
}

// Rolling beta of one symbol's daily returns against the in-process
// equal-weight market proxy. Reused by Residual Momentum.
function rollingBeta(symbol: string, ctx: RankContext, lookback: number): number | undefined {
  const bars = ctx.barsBySymbol[symbol];
  if (!bars || bars.length < lookback + 1) return undefined;
  const stockReturns = dailyReturns(bars.slice(-(lookback + 1)));
  const market = equalWeightMarketReturns(ctx, lookback);
  if (!market) return undefined;

  const meanStock = mean(stockReturns);
  const meanMarket = mean(market);
  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < lookback; i++) {
    covariance += (stockReturns[i] - meanStock) * (market[i] - meanMarket);
    variance += (market[i] - meanMarket) ** 2;
  }
  if (variance === 0) return undefined;
  return covariance / variance;
}

function bettingAgainstBetaScore(symbol: string, ctx: RankContext): number | undefined {
  const lookback = Math.floor(ctx.params.lookback ?? 90);
  const beta = rollingBeta(symbol, ctx, lookback);
  return beta === undefined ? undefined : -beta; // lower beta ranks higher
}

function residualMomentumScore(symbol: string, ctx: RankContext): number | undefined {
  const lookback = Math.floor(ctx.params.lookback ?? 90);
  const stockReturn = trailingReturnScore(symbol, ctx, lookback);
  if (stockReturn === undefined) return undefined;
  const beta = rollingBeta(symbol, ctx, lookback);
  if (beta === undefined) return undefined;

  const universeReturns = ctx.universe
    .map((u) => trailingReturnScore(u.symbol, ctx, lookback))
    .filter((r): r is number => r !== undefined);
  if (universeReturns.length === 0) return undefined;
  const marketTrailingReturn = mean(universeReturns);

  return stockReturn - beta * marketTrailingReturn;
}

function lowVolatilityScore(symbol: string, ctx: RankContext): number | undefined {
  const bars = ctx.barsBySymbol[symbol];
  if (!bars) return undefined;
  const lookback = Math.floor(ctx.params.lookback ?? 60);
  const vol = volatility(bars, lookback);
  const latest = vol[vol.length - 1];
  return latest === undefined ? undefined : -latest; // lower volatility ranks higher
}

// Proxy value factor — no book value available from any current provider
// (see StrategyDef.approximation on value_proxy), so this uses inverse
// P/E and dividend yield instead. Either field alone is enough to score
// a symbol (degrade gracefully, same convention the screener uses for
// missing fundamentals) — a symbol only needs one of the two.
function valueProxyScore(symbol: string, ctx: RankContext): number | undefined {
  const inversePe = new Map<string, number>();
  const divYield = new Map<string, number>();
  for (const u of ctx.universe) {
    const f = ctx.fundamentalsBySymbol[u.symbol];
    if (f?.peRatio !== undefined && f.peRatio > 0) inversePe.set(u.symbol, 1 / f.peRatio);
    if (f?.dividendYield !== undefined) divYield.set(u.symbol, f.dividendYield);
  }
  if (!inversePe.has(symbol) && !divYield.has(symbol)) return undefined;

  let score = 0;
  if (inversePe.has(symbol)) score += zScore(Array.from(inversePe.values()), inversePe.get(symbol)!);
  if (divYield.has(symbol)) score += zScore(Array.from(divYield.values()), divYield.get(symbol)!);
  return score;
}

interface StyleRotationSubScores {
  momentum: Map<string, number>;
  value: Map<string, number>;
}

// Keyed by RankContext object identity, which the engine holds constant
// across every scoreFn(symbol, ctx) call within one rebalance (a fresh ctx
// is only built per rebalance date) — so the whole universe's sub-scores
// get computed once per rebalance, not once per candidate symbol.
const styleRotationCache = new WeakMap<RankContext, StyleRotationSubScores>();

function styleRotationSubScores(ctx: RankContext): StyleRotationSubScores {
  const cached = styleRotationCache.get(ctx);
  if (cached) return cached;

  const momentum = new Map<string, number>();
  const value = new Map<string, number>();
  for (const u of ctx.universe) {
    const m = momentumFactorScore(u.symbol, ctx);
    const v = valueProxyScore(u.symbol, ctx);
    if (m !== undefined) momentum.set(u.symbol, m);
    if (v !== undefined) value.set(u.symbol, v);
  }
  const result = { momentum, value };
  styleRotationCache.set(ctx, result);
  return result;
}

// Blends Momentum Factor and the Value proxy: a symbol only needs to be
// scoreable on one of the two, mirroring value_proxy's own tolerance for
// missing fundamentals.
function momentumStyleRotationScore(symbol: string, ctx: RankContext): number | undefined {
  const { momentum, value } = styleRotationSubScores(ctx);
  if (!momentum.has(symbol) && !value.has(symbol)) return undefined;

  let score = 0;
  if (momentum.has(symbol)) score += zScore(Array.from(momentum.values()), momentum.get(symbol)!);
  if (value.has(symbol)) score += zScore(Array.from(value.values()), value.get(symbol)!);
  return score;
}

function sizeFactorScore(symbol: string, ctx: RankContext): number | undefined {
  const marketCap = ctx.fundamentalsBySymbol[symbol]?.marketCap;
  if (marketCap === undefined || marketCap <= 0) return undefined; // excluded, not treated as zero
  return -marketCap; // smaller cap ranks higher
}

// Every stock in a sector shares that sector's average trailing return as
// its score — deliberately not each stock's own return, so ranking is a
// bet on which sectors are leading, not which individual names within
// them look strongest.
function sectorMomentumScore(symbol: string, ctx: RankContext): number | undefined {
  const stock = ctx.universe.find((u) => u.symbol === symbol);
  if (!stock) return undefined;
  const peerReturns = ctx.universe
    .filter((u) => u.sector === stock.sector)
    .map((u) => trailingReturnScore(u.symbol, ctx, 63))
    .filter((r): r is number => r !== undefined);
  if (peerReturns.length === 0) return undefined;
  return peerReturns.reduce((a, b) => a + b, 0) / peerReturns.length;
}

interface MonthOccurrence {
  year: number;
  month: number;
  startClose: number;
  endClose: number;
}

// Like consistent_momentum's monthlyBuckets, but keeps the year/month
// identity of each bucket rather than just chronological order — needed
// here to find every PAST occurrence of one specific calendar month.
function monthlyOccurrences(bars: RankContext["barsBySymbol"][string]): MonthOccurrence[] {
  const byKey = new Map<string, MonthOccurrence>();
  const order: string[] = [];
  for (const bar of bars) {
    const month = calendarMonth(bar.time);
    const year = calendarYear(bar.time);
    const key = `${year}-${month}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { year, month, startClose: bar.close, endClose: bar.close });
      order.push(key);
    } else {
      existing.endClose = bar.close;
    }
  }
  return order.map((key) => byKey.get(key)!);
}

function twelveMonthCycleScore(symbol: string, ctx: RankContext): number | undefined {
  const bars = ctx.barsBySymbol[symbol];
  if (!bars || bars.length === 0) return undefined;

  const lastBar = bars[bars.length - 1];
  const currentMonth = calendarMonth(lastBar.time);
  const currentYear = calendarYear(lastBar.time);

  const priorOccurrences = monthlyOccurrences(bars).filter(
    (o) => o.month === currentMonth && o.year !== currentYear && o.startClose !== 0
  );
  if (priorOccurrences.length < 2) return undefined; // need real seasonal history, not one data point

  const returns = priorOccurrences.map((o) => (o.endClose - o.startClose) / o.startClose);
  return returns.reduce((a, b) => a + b, 0) / returns.length;
}

function zScore(values: number[], x: number): number {
  const m = mean(values);
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  return std === 0 ? 0 : (x - m) / std;
}

interface SmartFactorSubScores {
  momentum: Map<string, number>;
  lowVol: Map<string, number>;
  sectorMom: Map<string, number>;
}

// Same per-rebalance memoization as styleRotationSubScores above —
// computed once per rebalance (keyed by RankContext identity) instead of
// once per candidate symbol.
const smartFactorCache = new WeakMap<RankContext, SmartFactorSubScores>();

function smartFactorSubScores(ctx: RankContext): SmartFactorSubScores {
  const cached = smartFactorCache.get(ctx);
  if (cached) return cached;

  const momentum = new Map<string, number>();
  const lowVol = new Map<string, number>();
  const sectorMom = new Map<string, number>();
  for (const u of ctx.universe) {
    const m = momentumFactorScore(u.symbol, ctx);
    const v = lowVolatilityScore(u.symbol, ctx);
    const s = sectorMomentumScore(u.symbol, ctx);
    if (m !== undefined && v !== undefined && s !== undefined) {
      momentum.set(u.symbol, m);
      lowVol.set(u.symbol, v);
      sectorMom.set(u.symbol, s);
    }
  }
  const result = { momentum, lowVol, sectorMom };
  smartFactorCache.set(ctx, result);
  return result;
}

// Sums the z-scored Momentum Factor, Low Volatility, and Sector Momentum
// sub-signals across whichever symbols are scoreable on all three at
// this rebalance.
function smartFactorCompositeScore(symbol: string, ctx: RankContext): number | undefined {
  const { momentum, lowVol, sectorMom } = smartFactorSubScores(ctx);

  if (!momentum.has(symbol)) return undefined; // not scoreable on all three sub-signals
  const momentumValues = Array.from(momentum.values());
  if (momentumValues.length < 2) return undefined; // z-score needs more than one data point

  return (
    zScore(momentumValues, momentum.get(symbol)!) +
    zScore(Array.from(lowVol.values()), lowVol.get(symbol)!) +
    zScore(Array.from(sectorMom.values()), sectorMom.get(symbol)!)
  );
}

// Populated incrementally as each cross-sectional strategy is
// implemented — mirrors strategies.ts's generateSignals() switch, just
// keyed by lookup instead since strategies register a whole ScoreFn
// rather than a case in a shared function body.
const SCORE_FUNCTIONS: Partial<Record<StrategyId, ScoreFn>> = {
  momentum_factor: momentumFactorScore,
  consistent_momentum: consistentMomentumScore,
  short_term_reversal: shortTermReversalScore,
  low_volatility: lowVolatilityScore,
  betting_against_beta: bettingAgainstBetaScore,
  residual_momentum: residualMomentumScore,
  size_factor: sizeFactorScore,
  value_proxy: valueProxyScore,
  momentum_style_rotation: momentumStyleRotationScore,
  sector_momentum: sectorMomentumScore,
  smart_factor_composite: smartFactorCompositeScore,
  twelve_month_cycle: twelveMonthCycleScore,
};

export function getScoreFn(strategyId: StrategyId): ScoreFn {
  const fn = SCORE_FUNCTIONS[strategyId];
  if (!fn) throw new Error(`No cross-sectional scoring function registered for "${strategyId}"`);
  return fn;
}
