import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import { chat } from "@/lib/ai/router";

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

  const { pairsBacktests } = await getCollections();
  const doc = await pairsBacktests.findOne({ _id: objectId, ownerId });
  if (!doc) {
    return NextResponse.json({ error: "Backtest not found" }, { status: 404 });
  }

  const tradeSummary = doc.trades
    .map(
      (t) =>
        `${t.side.toUpperCase()} ${t.symbol} ${t.qty} @ ${t.price}` +
        (t.realizedPnl !== undefined ? ` (P&L ${t.realizedPnl.toFixed(2)})` : "")
    )
    .join("\n");

  const prompt = `You are reviewing a backtested pairs-trading (market-neutral spread) strategy for a personal paper-trading app (simulation only, no real money, no broker). Give a concise, plain-language critique.

Pair: ${doc.config.symbolA} / ${doc.config.symbolB}, interval ${doc.config.interval}, range ${doc.config.range}
The strategy trades the rolling z-score of log(priceA/priceB): opens a spread position when the
z-score crosses entryZ=${doc.config.params.entryZ}, closes it when it reverts to exitZ=${doc.config.params.exitZ},
using a lookback of ${doc.config.params.lookback} bars.

Metrics (from closed round trips only):
- Total return: ${doc.metrics.totalReturnPct.toFixed(2)}%
- CAGR: ${doc.metrics.cagrPct.toFixed(2)}%
- Max drawdown: ${doc.metrics.maxDrawdownPct.toFixed(2)}%
- Sharpe: ${doc.metrics.sharpe.toFixed(2)}
- Win rate: ${doc.metrics.winRatePct.toFixed(2)}% (${doc.metrics.tradeCount} round trips)

Trade log (each open/close leg is its own row):
${tradeSummary || "(no trades were made)"}

Comment on whether the spread showed real mean-reverting behavior over this window, whether the
entry/exit thresholds look sensibly tuned versus over/under-trading, signs of overfitting to this
specific window, and what you'd change before trusting it further. Keep it under 200 words.`;

  try {
    const result = await chat([{ role: "user", content: prompt }], { task: "backtest_review" });
    const aiReview = { ...result, createdAt: new Date() };
    await pairsBacktests.updateOne({ _id: objectId }, { $set: { aiReview } });
    return NextResponse.json(aiReview);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI review failed" },
      { status: 502 }
    );
  }
}
