import { NextResponse } from "next/server";
import { requireUserOrResponse } from "@/lib/auth/api";
import { chat } from "@/lib/ai";
import type { ScreenerRow } from "@/lib/screener/types";

// Deliberately not "will these stocks return well, how confident are you" —
// no model can genuinely predict returns, and framing it that way would be
// confidently wrong, not helpfully confident. Instead: translate the
// question into concrete, checkable criteria against the real data given,
// and explain each pick against those criteria. See CLAUDE.md / docs/plan.md
// §7 on why this app avoids anything that reads as investment advice.
const SYSTEM_PROMPT =
  "You are filtering a provided table of real Nifty 50 stock data based on what the user is asking " +
  "for. You cannot predict future returns and must never claim confidence about future performance — " +
  "only reason about the data you were given (price, % change, P/E, market cap, dividend yield, " +
  "sector). Translate the user's request into concrete criteria (e.g. 'positive momentum and P/E " +
  "under 25'), then pick stocks from the table that match those criteria, explaining each pick in " +
  "terms of the actual numbers. If the request needs information not in the table (e.g. news, " +
  "earnings forecasts), say so plainly instead of guessing. " +
  "Respond with ONLY valid JSON, no other text, in this exact shape: " +
  '{"criteria": "short description of the criteria you used", "picks": [{"symbol": "EXACT.NS", ' +
  '"reason": "why this one, citing the actual numbers"}]}. Include at most 5 picks unless the user ' +
  "asked for a specific different number.";

function formatRows(rows: ScreenerRow[]): string {
  const header = "symbol,sector,price,changePercent,peRatio,marketCap,dividendYield";
  const lines = rows.map((r) =>
    [
      r.symbol,
      r.sector,
      r.price.toFixed(2),
      r.changePercent.toFixed(2),
      r.peRatio?.toFixed(1) ?? "",
      r.marketCap ?? "",
      r.dividendYield?.toFixed(2) ?? "",
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

interface AiPick {
  symbol: string;
  reason: string;
}

export async function POST(request: Request) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const rows: ScreenerRow[] = Array.isArray(body.rows) ? body.rows : [];

  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "No screener data loaded yet" }, { status: 400 });
  }

  try {
    const result = await chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Question: ${question}\n\nData:\n${formatRows(rows)}` },
      ],
      { task: "chat" }
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

    const validSymbols = new Set(rows.map((r) => r.symbol));
    const picks = (Array.isArray(parsed.picks) ? parsed.picks : []).filter(
      (p): p is AiPick =>
        typeof p?.symbol === "string" && validSymbols.has(p.symbol) && typeof p?.reason === "string"
    );

    return NextResponse.json({
      criteria: typeof parsed.criteria === "string" ? parsed.criteria : "",
      picks,
      provider: result.provider,
      model: result.model,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI query failed" },
      { status: 502 }
    );
  }
}
