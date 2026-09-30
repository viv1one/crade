import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCollections } from "@/lib/db/collections";
import { runAfterResponse, runSliceAndChain } from "@/lib/agents/continuation";
import { STALE_AFTER_MS, UNCLAIMED_AFTER_MS } from "@/lib/agents/run-executor";

export const maxDuration = 300;

// Runs older than this that are still "running" are treated as abandoned by
// the sweeper (the user can still resume them by hand from the Trading Agents
// page) — resuming something days old on its own would spend AI calls nobody
// is waiting for.
const SWEEP_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const SWEEP_LIMIT = 3;

// Two jobs, both so a Trading Agents run keeps going with no page open:
//
// 1. ?runId=<id> — the chain link. lib/agents/continuation.ts calls this at the
//    end of a slice to start the next one in a fresh invocation. It answers
//    202 at once and runs the slice after responding, so the caller only waits
//    for the hand-off, not the slice.
// 2. no runId — the sweeper (scheduled: .github/workflows/resume-agent-runs.yml).
//    Finds runs that are still "running" but that no slice is working on (a
//    chain link that never landed, a function the host killed) and starts a
//    slice for each. Cheap when there is nothing to do.
//
// CRON_SECRET-gated, fail closed — same convention as the other cron routes.
async function handle(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 401 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const runId = new URL(request.url).searchParams.get("runId");

  if (runId) {
    if (!ObjectId.isValid(runId)) {
      return NextResponse.json({ error: "Invalid runId" }, { status: 400 });
    }
    runAfterResponse(async () => {
      await runSliceAndChain(new ObjectId(runId), origin);
    });
    return NextResponse.json({ accepted: true, runId }, { status: 202 });
  }

  const now = Date.now();
  const { agentRuns } = await getCollections();
  const candidates = await agentRuns
    .find({ status: "running", createdAt: { $gt: new Date(now - SWEEP_MAX_AGE_MS) } })
    // Newest first: the runs someone is most likely still waiting on. Oldest-first
    // would let a backlog of stale runs starve a fresh one.
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  const stalled = candidates
    .filter((run) => {
      const beat = run.heartbeatAt?.getTime();
      return beat === undefined ? now - run.createdAt.getTime() > UNCLAIMED_AFTER_MS : now - beat > STALE_AFTER_MS;
    })
    .slice(0, SWEEP_LIMIT);

  for (const run of stalled) {
    runAfterResponse(async () => {
      await runSliceAndChain(run._id, origin);
    });
  }
  return NextResponse.json({ resumed: stalled.map((r) => r._id.toString()) }, { status: stalled.length ? 202 : 200 });
}

export const GET = handle;
export const POST = handle;
