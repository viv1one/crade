import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";

// Runs are persisted on every POST below but were never read back until
// this — mirrors app/api/backtest's history endpoints (full docs returned,
// UI sets its current result straight from a picked one). Only `complete`
// runs are listed here: a `running` run's `result` is partial (missing
// `finalDecision` etc. until its stage lands), and every existing consumer
// of this list (Watchlist verdict badges, Journal's trade snapshot, this
// page's own "Past analyses") assumes a full result — GET
// /api/agents/run/[id] is the one that exposes in-progress state, for the
// live-progress polling UI specifically.
// Runs still "running" older than this are no longer offered for resuming.
const UNFINISHED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const { agentRuns } = await getCollections();

  // ?unfinished=1 — analyses that started but never completed (the host cut
  // them off, or the page was closed), so the Trading Agents page can offer to
  // resume them. Just enough to render a row: the full partial result is
  // fetched by the resume flow itself.
  if (new URL(request.url).searchParams.get("unfinished") === "1") {
    const runs = await agentRuns
      .find({
        userId: new ObjectId(user.id),
        status: "running",
        createdAt: { $gt: new Date(Date.now() - UNFINISHED_MAX_AGE_MS) },
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
    return NextResponse.json(
      runs.map((r) => ({
        _id: r._id.toString(),
        symbol: r.symbol,
        createdAt: r.createdAt,
        stagesDone: Object.keys(r.result ?? {}).filter((k) =>
          ["reports", "debate", "traderPlan", "finalDecision"].includes(k)
        ).length,
      }))
    );
  }

  const list = await agentRuns
    .find({ userId: new ObjectId(user.id), status: "complete" })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();
  return NextResponse.json(list);
}

// Deliberately fast and side-effect-light: creates the run doc and returns
// its id immediately, WITHOUT running the pipeline. The client needs the id
// before the ~5-minute pipeline call resolves, so it can start polling GET
// /api/agents/run/[id] right away — POST /api/agents/run/[id] (same id) is
// what actually executes the pipeline. Splitting create from execute avoids
// the chicken-and-egg problem of "the id normally arrives in the POST
// response, but that response doesn't land until the whole run is done."
export async function POST(request: Request) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  const { agentRuns } = await getCollections();
  const runId = new ObjectId();
  await agentRuns.insertOne({
    _id: runId,
    userId: new ObjectId(user.id),
    symbol,
    status: "running",
    result: {},
    createdAt: new Date(),
  });

  return NextResponse.json({ runId: runId.toString(), symbol });
}
