import type { HistoricalBar } from "../market-data/types";
import { calendarMonth, calendarYear, isExpiryWeek, isPaydayWindow, isTurnOfMonth } from "./calendar";
import { rollingHigh, rollingLow, rsi, sma, trailingReturn, volatility } from "./indicators";
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
  trend_following: {
    id: "trend_following",
    name: "Trend Following",
    description:
      "Time-series trend rule (Moskowitz-Ooi-Pedersen style): buy while the trailing return over " +
      "the lookback window is positive, sell once it turns negative. Judges the symbol against its " +
      "own past, not against other stocks — distinct from a cross-sectional momentum ranking.",
    kind: "single_symbol",
    paramSchema: [{ key: "lookback", label: "Lookback bars", default: 126, min: 10, max: 252 }],
  },
  fifty_two_week_high: {
    id: "fifty_two_week_high",
    name: "52-Week High",
    description:
      "George & Hwang's 52-week-high effect: buy while price is within nearPct of its trailing " +
      "52-week high, sell once it falls more than exitPct below that high. Nearness to the high " +
      "itself is the signal here, not the return that got it there.",
    kind: "single_symbol",
    paramSchema: [
      { key: "lookback", label: "Lookback bars (52wk)", default: 252, min: 20, max: 252 },
      { key: "nearPct", label: "Buy within % of high", default: 5, min: 1, max: 30 },
      { key: "exitPct", label: "Sell % below high", default: 15, min: 5, max: 50 },
    ],
  },
  momentum_factor: {
    id: "momentum_factor",
    name: "Momentum Factor",
    description:
      "Cross-sectional momentum (Jegadeesh-Titman): ranks the NIFTY 50 universe by trailing return " +
      "and holds the top topN, equal-weighted, rebalanced monthly — ranked against peers, not just " +
      "against its own past (that's Trend Following, a single-symbol strategy).",
    kind: "cross_sectional",
    paramSchema: [
      { key: "lookback", label: "Lookback bars", default: 126, min: 10, max: 252 },
      { key: "topN", label: "Hold top N", default: 5, min: 1, max: 20 },
    ],
  },
  turn_of_month: {
    id: "turn_of_month",
    name: "Turn of the Month",
    description:
      "Calendar effect (Ariel 1987): buy during the window from daysBeforeEnd calendar days before " +
      "month-end through daysAfterStart days into the next month, flat the rest of the time. Applied " +
      "per-symbol here rather than to a broad index — same idea, whatever symbol is loaded.",
    kind: "single_symbol",
    paramSchema: [
      { key: "daysBeforeEnd", label: "Days before month-end", default: 1, min: 0, max: 5 },
      { key: "daysAfterStart", label: "Days into next month", default: 3, min: 0, max: 10 },
    ],
  },
  payday_anomaly: {
    id: "payday_anomaly",
    name: "Payday Anomaly",
    description:
      "Calendar effect tied to salary-credit timing: buy on the last trading day of the month and " +
      "the first windowDays of the next, flat otherwise. Narrower than Turn of the Month and " +
      "motivated differently (payday buying pressure vs. institutional month-end rebalancing) " +
      "despite similar date math.",
    kind: "single_symbol",
    paramSchema: [{ key: "windowDays", label: "Window days", default: 1, min: 0, max: 5 }],
  },
  option_expiry_week: {
    id: "option_expiry_week",
    name: "Option-Expiration Week",
    description:
      "Buy during the daysBefore trading days leading into the monthly F&O expiry, flat otherwise.",
    kind: "single_symbol",
    approximation:
      "Expiry date computed via the last-Thursday-of-month convention, not NSE's actual published " +
      "expiry calendar — doesn't account for holiday shifts.",
    paramSchema: [{ key: "daysBefore", label: "Days before expiry", default: 3, min: 1, max: 10 }],
  },
  momentum_reversal_vol: {
    id: "momentum_reversal_vol",
    name: "Momentum + Reversal + Vol",
    description:
      "Composite single-symbol filter: buy only when the trend is up (fast SMA above slow), RSI " +
      "isn't overbought (a reversal guard against buying an extended spike), and recent volatility " +
      "is below a threshold — sell if any leg fails. Combines three existing indicators rather than " +
      "adding a new one.",
    kind: "single_symbol",
    paramSchema: [
      { key: "fastPeriod", label: "Fast SMA period", default: 10, min: 2, max: 50 },
      { key: "slowPeriod", label: "Slow SMA period", default: 30, min: 5, max: 200 },
      { key: "rsiPeriod", label: "RSI period", default: 14, min: 2, max: 50 },
      { key: "maxRsi", label: "Max RSI (overbought guard)", default: 70, min: 50, max: 95 },
      { key: "volPeriod", label: "Volatility lookback", default: 20, min: 5, max: 100 },
      { key: "maxVolPct", label: "Max daily volatility %", default: 3, min: 0.5, max: 10 },
    ],
  },
  overnight_anomaly: {
    id: "overnight_anomaly",
    name: "Overnight Anomaly",
    description:
      "Splits each day's return into an overnight leg (today's open vs. yesterday's close) and " +
      "trades in the direction the overnight leg has recently averaged over lookback bars. This " +
      "app's engine fills every trade at a bar's close, not its open, so this doesn't literally hold " +
      "positions only overnight — it's a signal derived from the overnight/intraday split, not a " +
      "literal overnight-only strategy.",
    kind: "single_symbol",
    paramSchema: [{ key: "lookback", label: "Lookback bars", default: 10, min: 2, max: 60 }],
  },
  crude_oil_predictor: {
    id: "crude_oil_predictor",
    name: "Crude Oil Predictor",
    description:
      "Cross-asset signal from crude oil (CL=F) applied to the loaded equity symbol: buys when " +
      "crude's trailing return, adjusted by direction, is positive — default direction of -1 tests " +
      "the hypothesis that falling oil is a tailwind for a net oil-importer economy. Set direction " +
      "to +1 to test the opposite hypothesis instead.",
    kind: "single_symbol",
    auxiliary: "crude_oil",
    approximation:
      "The oil-vs-equities relationship isn't uniformly positive or negative across sectors or time " +
      "— this trades a single directional hypothesis (configurable), not a validated causal link.",
    paramSchema: [
      { key: "lookback", label: "Crude lookback bars", default: 10, min: 2, max: 60 },
      { key: "direction", label: "Direction (+1 or -1)", default: -1, min: -1, max: 1 },
    ],
  },
  january_barometer: {
    id: "january_barometer",
    name: "January Barometer",
    description:
      "\"As January goes, so goes the year\": at the end of each January, records whether the " +
      "symbol was up or down that month, then stays long through December if January was positive, " +
      "flat if it was negative — re-evaluated every January. No signal during January itself, since " +
      "the barometer isn't resolved yet.",
    kind: "single_symbol",
    paramSchema: [],
  },
  consistent_momentum: {
    id: "consistent_momentum",
    name: "Consistent Momentum",
    description:
      "Cross-sectional momentum with a consistency filter: only ranks stocks that were positive in " +
      "at least minPositiveMonths of the last lookbackMonths calendar months, then holds the top " +
      "topN by total return over that window — rejects a stock whose momentum came from one big " +
      "spike rather than sustained performance, even if its raw trailing return looks strong.",
    kind: "cross_sectional",
    paramSchema: [
      { key: "lookbackMonths", label: "Lookback months", default: 6, min: 2, max: 12 },
      { key: "minPositiveMonths", label: "Min positive months", default: 4, min: 1, max: 12 },
      { key: "topN", label: "Hold top N", default: 5, min: 1, max: 20 },
    ],
  },
  short_term_reversal: {
    id: "short_term_reversal",
    name: "Short-Term Reversal (weekly)",
    description:
      "Cross-sectional short-term reversal (Jegadeesh 1990): ranks the NIFTY 50 universe by the " +
      "worst trailing weekly return and holds the top topN, equal-weighted, rebalanced weekly — the " +
      "opposite bet from Momentum Factor, on the theory that a sharp recent drop tends to partially " +
      "revert over the following week rather than continue.",
    kind: "cross_sectional",
    paramSchema: [
      { key: "lookback", label: "Lookback bars", default: 5, min: 2, max: 20 },
      { key: "topN", label: "Hold top N", default: 5, min: 1, max: 20 },
    ],
    rebalanceFrequency: "weekly",
  },
  low_volatility: {
    id: "low_volatility",
    name: "Low Volatility Factor",
    description:
      "Cross-sectional low-volatility factor: ranks the NIFTY 50 universe by trailing return " +
      "volatility (lowest first) and holds the top topN calmest names, equal-weighted, rebalanced " +
      "monthly — the well-documented anomaly that low-volatility stocks have historically not been " +
      "penalized in return for their lower risk the way standard theory would predict.",
    kind: "cross_sectional",
    paramSchema: [
      { key: "lookback", label: "Lookback bars", default: 60, min: 10, max: 252 },
      { key: "topN", label: "Hold top N", default: 5, min: 1, max: 20 },
    ],
  },
  betting_against_beta: {
    id: "betting_against_beta",
    name: "Betting Against Beta",
    description:
      "Long-only low-beta tilt: ranks the NIFTY 50 universe by rolling beta against the universe's " +
      "own equal-weight return and holds the lowest-beta topN. Not the original Frazzini-Pedersen " +
      "construction (long low-beta / short high-beta, market-neutral) — this app has no " +
      "short-selling, so it's a directional tilt toward calmer-vs-the-market names instead.",
    kind: "cross_sectional",
    paramSchema: [
      { key: "lookback", label: "Lookback bars", default: 90, min: 20, max: 252 },
      { key: "topN", label: "Hold top N", default: 5, min: 1, max: 20 },
    ],
  },
  size_factor: {
    id: "size_factor",
    name: "Size Factor (Small-Cap)",
    description:
      "Cross-sectional size premium: ranks the NIFTY 50 universe by market cap (smallest first) and " +
      "holds the topN smallest, equal-weighted, rebalanced monthly. Market cap is the least reliable " +
      "field this app's fundamentals providers return — a symbol missing it is excluded from " +
      "ranking, not treated as zero.",
    kind: "cross_sectional",
    needsFundamentals: true,
    paramSchema: [{ key: "topN", label: "Hold top N", default: 5, min: 1, max: 20 }],
  },
  sector_momentum: {
    id: "sector_momentum",
    name: "Sector Momentum Rotation",
    description:
      "Rotational sector strategy: scores every stock by its own sector's average trailing return " +
      "(sector from the NIFTY 50 universe list) rather than the stock's own return, then holds the " +
      "topN stocks whose sectors are showing the strongest momentum, equal-weighted, monthly " +
      "rebalance — a bet on which sectors are leading, not which individual names are.",
    kind: "cross_sectional",
    paramSchema: [
      { key: "lookback", label: "Lookback bars", default: 63, min: 10, max: 252 },
      { key: "topN", label: "Hold top N", default: 5, min: 1, max: 20 },
    ],
  },
  residual_momentum: {
    id: "residual_momentum",
    name: "Residual Momentum",
    description:
      "Cross-sectional momentum with the market component regressed out: ranks the NIFTY 50 " +
      "universe by trailing return minus (rolling beta × the equal-weight universe's own trailing " +
      "return), holding the topN highest residuals — the part of a stock's momentum that isn't just " +
      "it moving with everything else.",
    kind: "cross_sectional",
    paramSchema: [
      { key: "lookback", label: "Lookback bars", default: 90, min: 20, max: 252 },
      { key: "topN", label: "Hold top N", default: 5, min: 1, max: 20 },
    ],
  },
  smart_factor_composite: {
    id: "smart_factor_composite",
    name: "Composite Smart Factors",
    description:
      "Combines Momentum Factor, Low Volatility, and Sector Momentum into one ranking: z-scores each " +
      "sub-signal across the eligible universe at every rebalance, sums the three z-scores, and holds " +
      "the topN highest composites — a symbol only needs to be scoreable on all three to be ranked at " +
      "all.",
    kind: "cross_sectional",
    paramSchema: [
      { key: "lookback", label: "Lookback bars", default: 90, min: 20, max: 252 },
      { key: "topN", label: "Hold top N", default: 5, min: 1, max: 20 },
    ],
  },
  value_proxy: {
    id: "value_proxy",
    name: "Value (P/E proxy)",
    description:
      "Cross-sectional value tilt: sums the z-scores of inverse P/E and dividend yield (from " +
      "screener-in fundamentals) and holds the topN highest — cheap-relative-to-earnings, " +
      "higher-yielding names.",
    kind: "cross_sectional",
    needsFundamentals: true,
    approximation:
      "P/E and dividend-yield proxy — no book value is available from any current data provider, " +
      "so this is not a true book-to-market value factor.",
    paramSchema: [{ key: "topN", label: "Hold top N", default: 5, min: 1, max: 20 }],
  },
  momentum_style_rotation: {
    id: "momentum_style_rotation",
    name: "Momentum + Style Rotation",
    description:
      "Cross-sectional blend of Momentum Factor and the Value (P/E proxy) score: sums their " +
      "z-scores and holds the topN highest — rotates toward whichever style (trending or cheap) is " +
      "carrying a stock, or both.",
    kind: "cross_sectional",
    needsFundamentals: true,
    approximation:
      "Uses the same P/E and dividend-yield value proxy as Value (P/E proxy) — no book value " +
      "available from any current provider.",
    paramSchema: [
      { key: "lookback", label: "Momentum lookback bars", default: 126, min: 10, max: 252 },
      { key: "topN", label: "Hold top N", default: 5, min: 1, max: 20 },
    ],
  },
  twelve_month_cycle: {
    id: "twelve_month_cycle",
    name: "12-Month Cycle",
    description:
      "Cross-sectional seasonal effect: ranks the NIFTY 50 universe by each stock's own average " +
      "return during the current calendar month across prior years in the fetched range (needs at " +
      "least 2 prior occurrences of that month, excluding the current in-progress one), holds the " +
      "topN. A calendar/seasonal bet, mechanically distinct from Momentum Factor's trend bet.",
    kind: "cross_sectional",
    paramSchema: [{ key: "topN", label: "Hold top N", default: 5, min: 1, max: 20 }],
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
    case "trend_following":
      return trendFollowingSignals(bars, params);
    case "fifty_two_week_high":
      return fiftyTwoWeekHighSignals(bars, params);
    case "turn_of_month":
      return turnOfMonthSignals(bars, params);
    case "payday_anomaly":
      return paydayAnomalySignals(bars, params);
    case "option_expiry_week":
      return optionExpiryWeekSignals(bars, params);
    case "january_barometer":
      return januaryBarometerSignals(bars);
    case "overnight_anomaly":
      return overnightAnomalySignals(bars, params);
    case "momentum_reversal_vol":
      return momentumReversalVolSignals(bars, params);
    case "crude_oil_predictor":
      return crudeOilPredictorSignals(bars, params, auxiliaryBars);
    default:
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

function trendFollowingSignals(bars: HistoricalBar[], params: StrategyParams): Signal[] {
  const returns = trailingReturn(bars, params.lookback);
  return returns.map((r) => {
    if (r === undefined) return "hold";
    if (r > 0) return "buy";
    if (r < 0) return "sell";
    return "hold";
  });
}

function fiftyTwoWeekHighSignals(bars: HistoricalBar[], params: StrategyParams): Signal[] {
  const highs = rollingHigh(bars, params.lookback);
  return bars.map((bar, i) => {
    const h = highs[i];
    if (h === undefined || h === 0) return "hold";
    const distanceFromHigh = (h - bar.close) / h; // 0 = at the high, positive = below it
    if (distanceFromHigh <= params.nearPct / 100) return "buy";
    if (distanceFromHigh >= params.exitPct / 100) return "sell";
    return "hold";
  });
}

function turnOfMonthSignals(bars: HistoricalBar[], params: StrategyParams): Signal[] {
  return bars.map((bar) =>
    isTurnOfMonth(bar.time, params.daysBeforeEnd, params.daysAfterStart) ? "buy" : "sell"
  );
}

function paydayAnomalySignals(bars: HistoricalBar[], params: StrategyParams): Signal[] {
  return bars.map((bar) => (isPaydayWindow(bar.time, params.windowDays) ? "buy" : "sell"));
}

function optionExpiryWeekSignals(bars: HistoricalBar[], params: StrategyParams): Signal[] {
  return bars.map((bar) => (isExpiryWeek(bar.time, params.daysBefore) ? "buy" : "sell"));
}

function momentumReversalVolSignals(bars: HistoricalBar[], params: StrategyParams): Signal[] {
  const fast = sma(bars, params.fastPeriod);
  const slow = sma(bars, params.slowPeriod);
  const rsiValues = rsi(bars, params.rsiPeriod);
  const vol = volatility(bars, params.volPeriod);
  return bars.map((_, i) => {
    const f = fast[i];
    const s = slow[i];
    const r = rsiValues[i];
    const v = vol[i];
    if (f === undefined || s === undefined || r === undefined || v === undefined) return "hold";
    const trendUp = f > s;
    const notOverbought = r < params.maxRsi;
    const calmEnough = v < params.maxVolPct / 100;
    return trendUp && notOverbought && calmEnough ? "buy" : "sell";
  });
}

// Crude and equity bars come from independent fetches and don't
// necessarily share the same trading calendar (different holidays,
// weekends) — forward-fill each equity bar to the latest crude bar at or
// before it, same alignment approach the cross-sectional engine uses
// across symbols.
function crudeOilPredictorSignals(
  bars: HistoricalBar[],
  params: StrategyParams,
  auxiliaryBars?: HistoricalBar[]
): Signal[] {
  if (!auxiliaryBars || auxiliaryBars.length === 0) return bars.map(() => "hold");

  const lookback = Math.floor(params.lookback);
  const direction = params.direction >= 0 ? 1 : -1;
  const crudeReturns = trailingReturn(auxiliaryBars, lookback);

  let cursor = -1;
  return bars.map((bar) => {
    while (cursor + 1 < auxiliaryBars.length && auxiliaryBars[cursor + 1].time <= bar.time) cursor++;
    if (cursor < 0) return "hold";
    const r = crudeReturns[cursor];
    if (r === undefined) return "hold";
    const signed = r * direction;
    if (signed > 0) return "buy";
    if (signed < 0) return "sell";
    return "hold";
  });
}

function overnightReturns(bars: HistoricalBar[]): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(bars.length).fill(undefined);
  for (let i = 1; i < bars.length; i++) {
    const prevClose = bars[i - 1].close;
    if (prevClose !== 0) out[i] = (bars[i].open - prevClose) / prevClose;
  }
  return out;
}

function overnightAnomalySignals(bars: HistoricalBar[], params: StrategyParams): Signal[] {
  const lookback = Math.floor(params.lookback);
  const overnight = overnightReturns(bars);
  return bars.map((_, i) => {
    if (i < lookback) return "hold";
    const window = overnight.slice(i - lookback + 1, i + 1);
    if (window.some((v) => v === undefined)) return "hold";
    const avg = (window as number[]).reduce((a, b) => a + b, 0) / lookback;
    if (avg > 0) return "buy";
    if (avg < 0) return "sell";
    return "hold";
  });
}

function januaryBarometerSignals(bars: HistoricalBar[]): Signal[] {
  // Each year's own January bars only occur chronologically before that
  // same year's February — so keying by year here can't leak a later
  // year's January into an earlier year's Feb-Dec signal.
  const firstJanClose = new Map<number, number>();
  const lastJanClose = new Map<number, number>();
  for (const bar of bars) {
    if (calendarMonth(bar.time) !== 0) continue;
    const year = calendarYear(bar.time);
    if (!firstJanClose.has(year)) firstJanClose.set(year, bar.close);
    lastJanClose.set(year, bar.close);
  }

  return bars.map((bar) => {
    if (calendarMonth(bar.time) === 0) return "hold"; // barometer not resolved yet
    const year = calendarYear(bar.time);
    const first = firstJanClose.get(year);
    const last = lastJanClose.get(year);
    if (first === undefined || last === undefined || first === 0) return "hold";
    return last > first ? "buy" : "sell";
  });
}
