import type { Fundamentals, HistoricalBar } from "../market-data/types";
import { NIFTY_50 } from "../screener/universe";
import { trailingReturn, volatility } from "../backtest/indicators";

// Deliberately not lib/paper-trading/types.ts's Holding — this module is
// shared between the paper-trading portfolio and the real-holdings tracker
// (lib/portfolio/ isn't paper-trading-specific), and those two features are
// kept logically separate elsewhere in the codebase (see
// app/api/holdings/route.ts's comment on why it reimplements weighted-
// average-cost rather than importing lib/paper-trading/store.ts). Holding
// and RealHolding are both structurally assignable here.
export interface PositionInput {
  qty: number;
  avgCost: number;
}

export interface HoldingDiagnostic {
  symbol: string;
  sector: string;
  qty: number;
  price: number;
  marketValue: number;
  allocationPct: number;
  // Omitted (not zero) when there isn't enough bar history or fundamentals
  // data to compute them — the prompt formatter renders these as "not
  // available" rather than treating a gap as a real number.
  trailingReturnPct?: number;
  volatilityPct?: number;
  peRatio?: number;
  dividendYield?: number;
}

export interface SectorAllocation {
  sector: string;
  allocationPct: number;
}

export interface PortfolioDiagnostics {
  totalValue: number;
  // Both undefined when the caller doesn't track cash at all (the real-
  // holdings tracker is a manual position list, not a portfolio with a
  // cash balance) — never coerced to 0, which would misleadingly claim
  // "fully invested" rather than "not tracked."
  cash?: number;
  cashAllocationPct?: number;
  holdings: HoldingDiagnostic[];
  topHoldingPct: number;
  top3ConcentrationPct: number;
  // Herfindahl index over allocation weights (0-1 scale, Sigma weight^2) —
  // closer to 1 means value is concentrated in fewer positions.
  herfindahlIndex: number;
  sectorAllocations: SectorAllocation[];
}

function sectorFor(symbol: string): string {
  return NIFTY_50.find((s) => s.symbol === symbol)?.sector ?? "Other";
}

// Pure, I/O-free — mirrors lib/paper-trading/store.ts's "pure functions
// first" convention, unit-tested directly without touching the network or
// Mongo. Deliberately does not build a RankContext / call into
// lib/backtest/cross-sectional-strategies.ts's ScoreFns: those are designed
// to rank the full NIFTY_50 universe (sectorMomentumScore in particular
// needs bars for every sector peer), and reusing them here would mean
// fetching ~50 symbols' worth of data just to describe a handful of
// holdings. trailingReturn/volatility are reused directly since they're
// already universe-agnostic per-symbol indicators.
export function computePortfolioDiagnostics(
  holdings: Record<string, PositionInput>,
  cash: number | undefined,
  prices: Record<string, number>,
  barsBySymbol: Record<string, HistoricalBar[]>,
  fundamentalsBySymbol: Record<string, Fundamentals | undefined>
): PortfolioDiagnostics | null {
  const symbols = Object.keys(holdings);
  if (symbols.length === 0) return null;

  const holdingsValue = symbols.reduce((sum, symbol) => {
    const price = prices[symbol] ?? holdings[symbol].avgCost;
    return sum + price * holdings[symbol].qty;
  }, 0);
  const totalValue = (cash ?? 0) + holdingsValue;

  const holdingDiagnostics: HoldingDiagnostic[] = symbols
    .map((symbol) => {
      const holding = holdings[symbol];
      const price = prices[symbol] ?? holding.avgCost;
      const marketValue = price * holding.qty;
      const allocationPct = totalValue > 0 ? (marketValue / totalValue) * 100 : 0;

      const bars = barsBySymbol[symbol];
      const trailingReturnLatest = bars ? trailingReturn(bars, 126).at(-1) : undefined;
      const volatilityLatest = bars ? volatility(bars, 60).at(-1) : undefined;
      const fundamentals = fundamentalsBySymbol[symbol];

      return {
        symbol,
        sector: sectorFor(symbol),
        qty: holding.qty,
        price,
        marketValue,
        allocationPct,
        trailingReturnPct: trailingReturnLatest === undefined ? undefined : trailingReturnLatest * 100,
        volatilityPct: volatilityLatest === undefined ? undefined : volatilityLatest * 100,
        peRatio: fundamentals?.peRatio,
        dividendYield: fundamentals?.dividendYield,
      };
    })
    .sort((a, b) => b.allocationPct - a.allocationPct);

  const topHoldingPct = holdingDiagnostics[0]?.allocationPct ?? 0;
  const top3ConcentrationPct = holdingDiagnostics
    .slice(0, 3)
    .reduce((sum, h) => sum + h.allocationPct, 0);
  const herfindahlIndex = holdingDiagnostics.reduce(
    (sum, h) => sum + (h.allocationPct / 100) ** 2,
    0
  );

  const sectorTotals = new Map<string, number>();
  for (const h of holdingDiagnostics) {
    sectorTotals.set(h.sector, (sectorTotals.get(h.sector) ?? 0) + h.allocationPct);
  }
  const sectorAllocations = Array.from(sectorTotals, ([sector, allocationPct]) => ({
    sector,
    allocationPct,
  })).sort((a, b) => b.allocationPct - a.allocationPct);

  return {
    totalValue,
    cash,
    cashAllocationPct:
      cash === undefined ? undefined : totalValue > 0 ? (cash / totalValue) * 100 : 0,
    holdings: holdingDiagnostics,
    topHoldingPct,
    top3ConcentrationPct,
    herfindahlIndex,
    sectorAllocations,
  };
}

function formatHolding(h: HoldingDiagnostic): string {
  const fields = [
    `qty ${h.qty} @ ₹${h.price.toFixed(2)}`,
    `6-month return: ${h.trailingReturnPct === undefined ? "not available" : `${h.trailingReturnPct >= 0 ? "+" : ""}${h.trailingReturnPct.toFixed(1)}%`}`,
    `60-day volatility: ${h.volatilityPct === undefined ? "not available" : `${h.volatilityPct.toFixed(1)}%`}`,
    `P/E: ${h.peRatio === undefined ? "not available" : h.peRatio.toFixed(1)}`,
    `dividend yield: ${h.dividendYield === undefined ? "not available" : `${(h.dividendYield * 100).toFixed(2)}%`}`,
  ];
  return `- ${h.symbol} (${h.sector}): ${h.allocationPct.toFixed(1)}% of portfolio, ${fields.join(", ")}`;
}

// Plain-text data block for the AI system/user message — holdings sorted
// largest-allocation-first, missing fields always rendered as "not
// available" rather than omitted, so the model doesn't have to guess
// whether a gap is meaningful.
export function formatDiagnosticsForPrompt(diag: PortfolioDiagnostics): string {
  const cashLine =
    diag.cash === undefined
      ? "Cash: not tracked by this feature — only the positions entered are recorded."
      : `Cash: ₹${diag.cash.toFixed(2)} (${diag.cashAllocationPct!.toFixed(1)}% of total)`;
  const lines = [
    `Total portfolio value: ₹${diag.totalValue.toFixed(2)}`,
    cashLine,
    "",
    `Concentration: top holding ${diag.topHoldingPct.toFixed(1)}% of portfolio, top 3 holdings ` +
      `${diag.top3ConcentrationPct.toFixed(1)}%, Herfindahl index ${diag.herfindahlIndex.toFixed(2)} ` +
      `(0 = perfectly spread out, 1 = all in one position)`,
    "",
    "Sector exposure:",
    ...diag.sectorAllocations.map((s) => `- ${s.sector}: ${s.allocationPct.toFixed(1)}%`),
    "",
    "Holdings (largest allocation first):",
    ...diag.holdings.map(formatHolding),
  ];
  return lines.join("\n");
}
