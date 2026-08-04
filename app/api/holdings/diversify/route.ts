import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import { fetchHoldingsData } from "@/lib/portfolio/fetch";
import { computePortfolioDiagnostics, type PositionInput } from "@/lib/portfolio/diagnostics";
import { formatScreenerRowsForPrompt } from "@/lib/screener/format";
import { SECTORS } from "@/lib/screener/universe";
import { chat } from "@/lib/ai";

// Same anti-prediction, "pick from the real table only" discipline as
// app/api/screener/ai-query/route.ts — this is that route's sibling, just
// with the criteria derived from the portfolio's own sector gaps instead
// of a free-text question.
const SYSTEM_PROMPT =
  "You are suggesting Nifty 50 stocks that would diversify a user's real investment portfolio, " +
  "based on the portfolio's current sector exposure (given below) and a table of real, current " +
  "Nifty 50 stock data. You cannot predict future returns and must never claim confidence about " +
  "future performance — only reason about the data you were given (sector, price, % change, " +
  "P/E, market cap, dividend yield). Prefer stocks from sectors the portfolio has little or no " +
  "exposure to. Never suggest a symbol already in the user's holdings (listed below) — exclude " +
  "those entirely. Explain each pick in terms of the actual numbers and how it would change the " +
  "portfolio's sector mix, not a return forecast. " +
  "Respond with ONLY valid JSON, no other text, in this exact shape: " +
  '{"criteria": "short description of the diversification approach used", "picks": [{"symbol": ' +
  '"EXACT.NS", "reason": "why this one, citing the actual numbers and sector gap"}]}. Include at ' +
  "most 5 picks.";

const MAX_SNAPSHOT_AGE_MS = 60 * 60 * 1000;

interface AiPick {
  symbol: string;
  reason: string;
}

export async function POST() {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const { realHoldings, screenerSnapshots } = await getCollections();
  const docs = await realHoldings.find({ userId: new ObjectId(user.id) }).toArray();
  if (docs.length === 0) {
    return NextResponse.json(
      { error: "No holdings to diversify — add one on the Holdings page first" },
      { status: 400 }
    );
  }

  const positions: Record<string, PositionInput> = {};
  for (const doc of docs) {
    positions[doc.symbol] = { qty: doc.qty, avgCost: doc.avgCost };
  }
  const symbols = Object.keys(positions);
  const heldSymbols = new Set(symbols);

  const { prices, bars, fundamentals } = await fetchHoldingsData(symbols);
  const diagnostics = computePortfolioDiagnostics(positions, undefined, prices, bars, fundamentals);
  if (!diagnostics) {
    return NextResponse.json({ error: "Could not compute portfolio diagnostics" }, { status: 500 });
  }

  const snapshot = await screenerSnapshots.findOne({ universe: "nifty50" });
  if (!snapshot || snapshot.rows.length === 0) {
    return NextResponse.json(
      { error: "No screener data available yet — visit the Screener page first" },
      { status: 400 }
    );
  }
  if (Date.now() - snapshot.fetchedAt.getTime() > MAX_SNAPSHOT_AGE_MS) {
    return NextResponse.json(
      { error: "Screener data is over an hour old — visit the Screener page to refresh it first" },
      { status: 400 }
    );
  }

  const sectorSummary =
    diagnostics.sectorAllocations.length > 0
      ? diagnostics.sectorAllocations.map((s) => `${s.sector}: ${s.allocationPct.toFixed(1)}%`).join(", ")
      : "none";
  const missingSectors = SECTORS.filter(
    (sector) => !diagnostics.sectorAllocations.some((s) => s.sector === sector)
  );

  const portfolioText =
    `Current sector exposure: ${sectorSummary}.\n` +
    `Sectors with no exposure at all: ${missingSectors.length > 0 ? missingSectors.join(", ") : "none"}.\n` +
    `Already-held symbols (do not suggest these): ${symbols.join(", ")}.`;

  try {
    const result = await chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Portfolio:\n${portfolioText}\n\nNifty 50 data:\n${formatScreenerRowsForPrompt(snapshot.rows)}`,
        },
      ],
      { task: "portfolio_review" }
    );

    let parsed: { criteria: string; picks: AiPick[] };
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : result.content);
    } catch {
      return NextResponse.json(
        { error: "AI response wasn't valid JSON", raw: result.content },
        { status: 502 }
      );
    }

    const validSymbols = new Set(snapshot.rows.map((r) => r.symbol));
    const picks = (Array.isArray(parsed.picks) ? parsed.picks : []).filter(
      (p): p is AiPick =>
        typeof p?.symbol === "string" &&
        validSymbols.has(p.symbol) &&
        !heldSymbols.has(p.symbol) &&
        typeof p?.reason === "string"
    );

    return NextResponse.json({
      criteria: typeof parsed.criteria === "string" ? parsed.criteria : "",
      picks,
      provider: result.provider,
      model: result.model,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Diversification query failed" },
      { status: 502 }
    );
  }
}
