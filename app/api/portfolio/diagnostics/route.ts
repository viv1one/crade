import { NextResponse } from "next/server";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import { createEmptyPortfolio } from "@/lib/paper-trading/store";
import type { PortfolioState } from "@/lib/paper-trading/types";
import { fetchHoldingsData } from "@/lib/portfolio/fetch";
import { computePortfolioDiagnostics, formatDiagnosticsForPrompt } from "@/lib/portfolio/diagnostics";
import { chat } from "@/lib/ai";

async function loadState(ownerId: string): Promise<PortfolioState> {
  const { paperPortfolios } = await getCollections();
  const doc = await paperPortfolios.findOne({ ownerId });
  if (!doc) return createEmptyPortfolio();
  return { cash: doc.cash, holdings: doc.holdings, trades: doc.trades };
}

// Deliberately not "which of your holdings will perform best / how should
// you rebalance to maximize profit" — mirrors the exact discipline in
// app/api/screener/ai-query/route.ts's system prompt: describe the real
// numbers given, never claim confidence about future returns.
const SYSTEM_PROMPT =
  "You are writing a short portfolio diagnostic for Crade, an internal paper-trading research " +
  "tool, based on the user's current simulated holdings data given below (allocation, " +
  "concentration, sector exposure, trailing return, volatility, and fundamentals where " +
  "available). Point out what's noteworthy: concentration risk (a small number of positions " +
  "dominating the portfolio), sector tilts, and any holdings that stand out on " +
  "return/volatility/valuation relative to the rest of the portfolio. You cannot predict future " +
  "returns and must never claim confidence about future performance or suggest a trade will " +
  "maximize profit — only describe patterns in the data you were given. If a field is marked " +
  "not available for a holding, say so rather than guessing. This is not investment advice.";

export async function POST() {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const state = await loadState(user.id);
  const symbols = Object.keys(state.holdings);
  if (symbols.length === 0) {
    return NextResponse.json(
      { error: "No holdings to analyze — buy something first" },
      { status: 400 }
    );
  }

  const { prices, bars, fundamentals } = await fetchHoldingsData(symbols);
  const diagnostics = computePortfolioDiagnostics(
    state.holdings,
    state.cash,
    prices,
    bars,
    fundamentals
  );
  if (!diagnostics) {
    return NextResponse.json({ error: "Could not compute diagnostics" }, { status: 500 });
  }
  const dataText = formatDiagnosticsForPrompt(diagnostics);

  try {
    const result = await chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Data:\n${dataText}\n\nWrite the diagnostic summary.` },
      ],
      { task: "portfolio_review" }
    );
    return NextResponse.json({ ...result, fetchedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Diagnostics failed" },
      { status: 502 }
    );
  }
}
