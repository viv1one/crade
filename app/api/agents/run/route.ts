import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import { runTradingAgentsPipeline } from "@/lib/agents/pipeline";

// ~12 sequential/parallel chat() calls per run — see lib/agents/pipeline.ts.
// Live-tested end to end against real NVIDIA NIM capacity (free/shared
// tier, including its own transient 503s and this route's retry-on-503 —
// see lib/ai/router.ts's fetchWithBackoff): a real run took 4m43s, well
// past the 60s this was originally set to. 300s is Vercel's own ceiling for
// Fluid Compute outside Enterprise — if this is ever deployed on the Hobby
// tier specifically (which caps lower even with Fluid Compute), this route
// will still be at real risk of the platform killing it mid-run, and the
// correct fix at that point is the same async/polling design
// app/api/cron/refresh-screener/route.ts uses for its own too-slow-for-one-
// request problem (persist progress incrementally, client polls a GET
// status route) — not attempted here since the feature works correctly
// synchronously wherever the platform allows the full duration.
export const maxDuration = 300;

// Runs are persisted on every POST below but were never read back until
// this — mirrors app/api/backtest's history endpoints (full docs returned,
// UI sets its current result straight from a picked one).
export async function GET() {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const { agentRuns } = await getCollections();
  const list = await agentRuns
    .find({ userId: new ObjectId(user.id) })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();
  return NextResponse.json(list);
}

export async function POST(request: Request) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  try {
    const result = await runTradingAgentsPipeline(symbol);

    const { agentRuns } = await getCollections();
    await agentRuns.insertOne({
      _id: new ObjectId(),
      userId: new ObjectId(user.id),
      symbol,
      result,
      createdAt: new Date(),
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Trading Agents analysis failed" },
      { status: 502 }
    );
  }
}
