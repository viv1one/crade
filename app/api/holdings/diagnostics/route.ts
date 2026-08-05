import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import { fetchHoldingsData, fetchUniverseData } from "@/lib/portfolio/fetch";
import {
  computePortfolioDiagnostics,
  formatDiagnosticsForPrompt,
  type PositionInput,
} from "@/lib/portfolio/diagnostics";
import { computeFactorTilts, formatFactorTiltsForPrompt } from "@/lib/portfolio/factor-tilt";
import { NIFTY_50 } from "@/lib/screener/universe";
import { chat } from "@/lib/ai";

// Same anti-prediction discipline as app/api/portfolio/diagnostics/route.ts
// and app/api/screener/ai-query/route.ts, but worded for real holdings
// rather than simulated paper trades — and this tracker has no cash
// concept at all (see PositionInput's cash: undefined case in
// lib/portfolio/diagnostics.ts), so the model is told not to assume one.
const BASE_SYSTEM_PROMPT =
  "You are writing a short portfolio diagnostic for Crade, an internal research tool, based on " +
  "the user's real investment holdings given below (manually entered by the user for research — " +
  "not connected to a broker, not simulated). Point out what's noteworthy: concentration risk " +
  "(a small number of positions dominating the portfolio), sector tilts, and any holdings that " +
  "stand out on return/volatility/valuation relative to the rest of the portfolio. This tracker " +
  "does not record cash or uninvested funds — only the positions the user entered — so never " +
  "claim or imply a cash percentage beyond what's given. You cannot predict future returns and " +
  "must never claim confidence about future performance or suggest a trade will maximize profit " +
  "— only describe patterns in the data you were given. If a field is marked not available for a " +
  "holding, say so rather than guessing. This is not investment advice.";

// Appended only when deep=true and a "Deep factor analysis" section is
// actually present in the data — deliberately not always part of the
// prompt. When it was unconditional, the model would volunteer a "Deep
// Factor Analysis" heading and claim "not enough data" even on plain
// (non-deep) requests where no such section existed at all — exactly the
// unprompted-invention failure mode this app is otherwise careful to
// avoid (see lib/ai/context.ts's fabrication notes). Giving the model no
// cue at all when the section isn't there is the fix, not a stronger
// "don't guess" instruction.
const DEEP_ANALYSIS_CLAUSE =
  " A \"Deep factor analysis\" section is included below — its percentiles are relative standing " +
  "within the Nifty 50 universe, not a forecast — describe them the same cautious way.";

export async function POST(request: Request) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const body = await request.json().catch(() => ({}));
  const deep = body?.deep === true;

  const { realHoldings } = await getCollections();
  const docs = await realHoldings.find({ userId: new ObjectId(user.id) }).toArray();
  if (docs.length === 0) {
    return NextResponse.json(
      { error: "No holdings to analyze — add one on the Holdings page first" },
      { status: 400 }
    );
  }

  const positions: Record<string, PositionInput> = {};
  for (const doc of docs) {
    positions[doc.symbol] = { qty: doc.qty, avgCost: doc.avgCost };
  }
  const symbols = Object.keys(positions);

  const { prices, bars, fundamentals } = await fetchHoldingsData(symbols);
  const diagnostics = computePortfolioDiagnostics(positions, undefined, prices, bars, fundamentals);
  if (!diagnostics) {
    return NextResponse.json({ error: "Could not compute diagnostics" }, { status: 500 });
  }
  let dataText = formatDiagnosticsForPrompt(diagnostics);

  if (deep) {
    const { barsBySymbol, fundamentalsBySymbol } = await fetchUniverseData();
    const tilts = computeFactorTilts(symbols, NIFTY_50, barsBySymbol, fundamentalsBySymbol);
    dataText += `\n\n${formatFactorTiltsForPrompt(tilts)}`;
  }

  const systemPrompt = deep ? BASE_SYSTEM_PROMPT + DEEP_ANALYSIS_CLAUSE : BASE_SYSTEM_PROMPT;

  try {
    const result = await chat(
      [
        { role: "system", content: systemPrompt },
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
