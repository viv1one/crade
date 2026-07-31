import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import { chat } from "@/lib/ai/router";
import { STRATEGIES } from "@/lib/backtest/strategies";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;
  const ownerId = user.id;

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: "Invalid backtest id" }, { status: 400 });
  }

  const { portfolioBacktests } = await getCollections();
  const doc = await portfolioBacktests.findOne({ _id: objectId, ownerId });
  if (!doc) {
    return NextResponse.json({ error: "Backtest not found" }, { status: 404 });
  }

  const strategy = STRATEGIES[doc.config.strategyId];
  const tradeSummary = doc.trades
    .map(
      (t) =>
        `${t.side.toUpperCase()} ${t.symbol} ${t.qty} @ ${t.price}` +
        (t.realizedPnl !== undefined ? ` (P&L ${t.realizedPnl.toFixed(2)})` : "")
    )
    .join("\n");
  const bySymbolSummary = doc.bySymbol
    .map((s) => `${s.symbol}: ₹${s.startingCash.toFixed(0)} → ₹${s.finalEquity.toFixed(0)} (${s.totalReturnPct.toFixed(2)}%)`)
    .join("\n");

  const prompt = `You are reviewing a backtested trading strategy run across a basket of stocks for a personal paper-trading app (simulation only, no real money, no broker). Give a concise, plain-language critique.

Strategy: ${strategy.name} (${strategy.description})
Params: ${JSON.stringify(doc.config.params)}
Symbols: ${doc.config.symbols.join(", ")}, interval ${doc.config.interval}, range ${doc.config.range}
Starting cash was split equally across symbols, each run independently with the same strategy/params.

Metrics (combined portfolio):
- Total return: ${doc.metrics.totalReturnPct.toFixed(2)}%
- CAGR: ${doc.metrics.cagrPct.toFixed(2)}%
- Max drawdown: ${doc.metrics.maxDrawdownPct.toFixed(2)}%
- Sharpe: ${doc.metrics.sharpe.toFixed(2)}
- Win rate: ${doc.metrics.winRatePct.toFixed(2)}% (${doc.metrics.tradeCount} trades)
- Buy-and-hold return over the same period: ${doc.metrics.buyHoldReturnPct.toFixed(2)}%

Per-symbol contribution:
${bySymbolSummary || "(none)"}

Trade log:
${tradeSummary || "(no trades were made)"}

Comment on whether this strategy beat buy-and-hold, whether any single symbol is carrying or dragging the whole basket, signs of overfitting to this specific window, and what you'd change before trusting it further. Keep it under 200 words.`;

  try {
    const result = await chat([{ role: "user", content: prompt }], { task: "backtest_review" });
    const aiReview = { ...result, createdAt: new Date() };
    await portfolioBacktests.updateOne({ _id: objectId }, { $set: { aiReview } });
    return NextResponse.json(aiReview);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI review failed" },
      { status: 502 }
    );
  }
}
