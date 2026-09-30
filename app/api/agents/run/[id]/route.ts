import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import { executeRunSlice, STALE_AFTER_MS, UNCLAIMED_AFTER_MS } from "@/lib/agents/run-executor";
import { scheduleContinuation } from "@/lib/agents/continuation";

// A run is executed in short "slices" (lib/agents/run-executor.ts) so it can
// outlive hosts that cap how long one function invocation may live: a slice
// saves what it finished and ends cleanly, and another slice continues. This
// route is the user-facing way to run a slice; the server also chains slices
// itself and a scheduled sweeper backstops both (see lib/agents/continuation.ts
// and app/api/cron/resume-agent-runs), so a run keeps going with the page closed.
// maxDuration is a ceiling where the plan honors it, not something we rely on.
export const maxDuration = 300;

async function loadOwnedRun(id: string, userId: string) {
  if (!ObjectId.isValid(id)) return null;
  const { agentRuns } = await getCollections();
  return agentRuns.findOne({ _id: new ObjectId(id), userId: new ObjectId(userId) });
}

// Polled by the live-progress UI (app/trading-agents/trading-agents-run.tsx)
// while slices execute and incrementally write to this same doc. Unlike the
// plural GET on /api/agents/run (history list, complete runs only), this one
// deliberately returns a run in any status, including a partial `result` —
// that's the point. Also reports whether the run has `stalled` (no live slice
// working on it) and how long since it last advanced (`idleMs`), computed here
// so the client never compares its own clock to the server's.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const run = await loadOwnedRun(id, user.id);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const now = Date.now();
  const beat = run.heartbeatAt?.getTime();
  const stalled =
    run.status === "running" &&
    (beat === undefined ? now - run.createdAt.getTime() > UNCLAIMED_AFTER_MS : now - beat > STALE_AFTER_MS);
  const idleMs = now - (run.lastProgressAt ?? run.createdAt).getTime();
  return NextResponse.json({ ...run, stalled, idleMs });
}

// Runs (or resumes) one slice of the run POST /api/agents/run created — see
// that route's comment for why creation and execution are split. Safe to call
// repeatedly: only one slice can hold a run at a time.
//   200 — finished, body is the full result
//   202 — this slice hit its time budget (the server has already scheduled the next)
//   409 — already finished/failed, or another slice is working on it
//   502 — the pipeline failed
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const existing = await loadOwnedRun(id, user.id);
  if (!existing) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const outcome = await executeRunSlice(existing._id);
  switch (outcome.kind) {
    case "complete":
      return NextResponse.json(outcome.result);
    case "yielded":
      scheduleContinuation(new URL(request.url).origin, id);
      return NextResponse.json({ status: "running", yielded: true }, { status: 202 });
    case "busy":
      return NextResponse.json({ error: "Run is already being worked on" }, { status: 409 });
    case "finished":
      return NextResponse.json({ error: `Run is already ${outcome.status}` }, { status: 409 });
    case "failed":
      return NextResponse.json({ error: outcome.error }, { status: 502 });
    default:
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
}
