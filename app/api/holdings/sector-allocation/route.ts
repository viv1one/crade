import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import { fetchHoldingsData } from "@/lib/portfolio/fetch";
import { computePortfolioDiagnostics, type PositionInput } from "@/lib/portfolio/diagnostics";

// Sector allocation AND per-holding risk exposure (volatility) are pure
// arithmetic over already-known positions and live prices — unlike
// app/api/holdings/diagnostics/route.ts (which spends an AI call to
// narrate the same underlying computePortfolioDiagnostics() data as
// prose), this route exists specifically so the two charts on the Holdings
// page (sector-pie-chart.tsx, risk-exposure-chart.tsx) don't need the user
// to click "Generate AI portfolio diagnostics" and pay for an LLM call
// just to see a chart — same reasoning this codebase already applies
// everywhere (lib/paper-trading/store.ts, lib/backtest/indicators.ts,
// etc.): compute deterministically, only call the model for things that
// genuinely need natural-language synthesis.
export async function GET() {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const { realHoldings } = await getCollections();
  const docs = await realHoldings.find({ userId: new ObjectId(user.id) }).toArray();
  if (docs.length === 0) {
    return NextResponse.json({ sectorAllocations: [], topHoldingPct: 0, top3ConcentrationPct: 0, riskExposure: [] });
  }

  const positions: Record<string, PositionInput> = {};
  for (const doc of docs) {
    positions[doc.symbol] = { qty: doc.qty, avgCost: doc.avgCost };
  }

  const { prices, bars, fundamentals } = await fetchHoldingsData(Object.keys(positions));
  const diagnostics = computePortfolioDiagnostics(positions, undefined, prices, bars, fundamentals);
  if (!diagnostics) {
    return NextResponse.json({ error: "Could not compute sector allocation" }, { status: 500 });
  }

  return NextResponse.json({
    sectorAllocations: diagnostics.sectorAllocations,
    topHoldingPct: diagnostics.topHoldingPct,
    top3ConcentrationPct: diagnostics.top3ConcentrationPct,
    // Only holdings with a computable 60-day volatility (see
    // lib/portfolio/diagnostics.ts — omitted, not zero, when there isn't
    // enough bar history) are included; a holding missing this isn't
    // "zero risk," it's unknown, so it's left out of the chart rather than
    // silently plotted as safe.
    riskExposure: diagnostics.holdings
      .filter((h) => h.volatilityPct != null)
      .map((h) => ({ symbol: h.symbol, allocationPct: h.allocationPct, volatilityPct: h.volatilityPct as number })),
  });
}
