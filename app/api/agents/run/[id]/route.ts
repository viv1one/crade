import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import { runTradingAgentsPipeline } from "@/lib/agents/pipeline";
import type { AgentPipelineResult } from "@/lib/agents/types";

// ~12 sequential/parallel chat() calls per run — see lib/agents/pipeline.ts.
// Live-tested end to end against real NVIDIA NIM capacity (free/shared
// tier, including its own transient 503s and lib/ai/router.ts's
// retry-on-503): a real run took 4m43s, well past Next.js's 10s default.
// 300s is Vercel's own ceiling for Fluid Compute outside Enterprise — if
// this is ever deployed on the Hobby tier specifically (which caps lower
// even with Fluid Compute), this route is still at real risk of the
// platform killing it mid-run; the run doc's incremental `result` fields
// (written stage by stage below) at least mean a killed run doesn't lose
// everything, just whatever hadn't landed yet.
export const maxDuration = 300;

async function loadOwnedRun(id: string, userId: string) {
  if (!ObjectId.isValid(id)) return null;
  const { agentRuns } = await getCollections();
  return agentRuns.findOne({ _id: new ObjectId(id), userId: new ObjectId(userId) });
}

// Polled by the live-progress UI (app/trading-agents/trading-agents-run.tsx)
// while POST (below) is still executing and incrementally writing to this
// same doc. Unlike the plural GET on /api/agents/run (history list,
// complete runs only), this one deliberately returns a run in any status,
// including a partial `result` — that's the point.
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
  return NextResponse.json(run);
}

// Executes the pipeline for a run POST /api/agents/run already created —
// see that route's comment for why creation and execution are split. Not
// idempotent/re-runnable: only meaningful on a run still in "running"
// status (guards against a client accidentally firing this twice for the
// same id, e.g. a retried request).
export async function POST(
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
  if (run.status !== "running") {
    return NextResponse.json({ error: `Run is already ${run.status}` }, { status: 409 });
  }

  const { agentRuns } = await getCollections();
  const runId = run._id;

  try {
    const result = await runTradingAgentsPipeline(run.symbol, async (partial: Partial<AgentPipelineResult>) => {
      // $set with dot-notation per top-level field so this never clobbers
      // fields an earlier stage already wrote (e.g. `result.reports`
      // written by the analyst stage survives the later debate-stage
      // update, which only ever sends `{debate: ...}`).
      const set = Object.fromEntries(
        Object.entries(partial).map(([key, value]) => [`result.${key}`, value])
      );
      await agentRuns.updateOne({ _id: runId }, { $set: set });
    });

    await agentRuns.updateOne({ _id: runId }, { $set: { status: "complete", result } });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trading Agents analysis failed";
    await agentRuns.updateOne({ _id: runId }, { $set: { status: "failed", error: message } });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
