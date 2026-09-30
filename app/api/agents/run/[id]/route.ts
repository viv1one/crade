import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import { runTradingAgentsPipeline } from "@/lib/agents/pipeline";
import type { AgentPipelineResult } from "@/lib/agents/types";
import { YieldForContinuation } from "@/lib/agents/checkpoint";

// ~12 sequential/parallel chat() calls per run — see lib/agents/pipeline.ts.
// Live-tested end to end against real NVIDIA NIM capacity (free/shared
// tier, including its own transient 503s and lib/ai/router.ts's
// retry-on-503): a real run took 4m43s, well past Next.js's 10s default.
//
// A run does NOT have to fit in one invocation. On hosts that cap function
// duration lower than that (observed: a run killed after the analyst stage,
// stuck "running" forever), one invocation works for at most
// STEP_BUDGET_MS, then ends cleanly; the run resumes in a fresh invocation
// from what was already saved (whole stages in `result`, individual AI calls
// in `checkpoints`). The polling client is what re-triggers it, whenever GET
// reports the run `stalled` — so a killed invocation is recovered the same
// way as a deliberate hand-off.
export const maxDuration = 300;

const STEP_BUDGET_MS = (Number(process.env.AGENTS_STEP_BUDGET_SECONDS) || 20) * 1000;
const HEARTBEAT_MS = 5_000;
// An invocation that hasn't heartbeated for this long is presumed dead.
const STALE_AFTER_MS = 20_000;
// A run that was created but never picked up at all (its first POST never
// arrived) counts as stalled after this long.
const UNCLAIMED_AFTER_MS = 10_000;
// Safety net: a run that keeps getting cut off without ever finishing.
const MAX_INVOCATIONS = 40;

async function loadOwnedRun(id: string, userId: string) {
  if (!ObjectId.isValid(id)) return null;
  const { agentRuns } = await getCollections();
  return agentRuns.findOne({ _id: new ObjectId(id), userId: new ObjectId(userId) });
}

// Polled by the live-progress UI (app/trading-agents/trading-agents-run.tsx)
// while an invocation (POST, below) executes and incrementally writes to this
// same doc. Unlike the plural GET on /api/agents/run (history list,
// complete runs only), this one deliberately returns a run in any status,
// including a partial `result` — that's the point. Also reports whether the
// run has `stalled` (no live invocation working on it) and how long since it
// last advanced (`idleMs`), computed here so the client never compares its
// own clock to the server's.
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

// Runs (or resumes) the pipeline for a run POST /api/agents/run already
// created — see that route's comment for why creation and execution are
// split. Safe to call repeatedly: only one invocation can hold a run at a
// time (atomic claim below), and a run that's already finished is refused.
//   200 — finished, body is the full result
//   202 — this invocation hit its time budget; call again to continue
//   409 — already finished/failed, or another invocation is working on it
//   502 — the pipeline failed
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const existing = await loadOwnedRun(id, user.id);
  if (!existing) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (existing.status !== "running") {
    return NextResponse.json({ error: `Run is already ${existing.status}` }, { status: 409 });
  }

  const { agentRuns } = await getCollections();
  const runId = existing._id;

  if ((existing.invocations ?? 0) >= MAX_INVOCATIONS) {
    const error = "The analysis didn't finish after many attempts — please run it again.";
    await agentRuns.updateOne({ _id: runId }, { $set: { status: "failed", error } });
    return NextResponse.json({ error }, { status: 502 });
  }

  // Atomic claim: succeeds only if nobody is working on this run (never
  // claimed, or the last claimant stopped heartbeating).
  const claim = await agentRuns.updateOne(
    {
      _id: runId,
      status: "running",
      $or: [{ heartbeatAt: { $exists: false } }, { heartbeatAt: { $lt: new Date(Date.now() - STALE_AFTER_MS) } }],
    },
    { $set: { heartbeatAt: new Date(), lastProgressAt: new Date() }, $inc: { invocations: 1 } }
  );
  if (claim.modifiedCount !== 1) {
    return NextResponse.json({ error: "Run is already being worked on" }, { status: 409 });
  }

  // Re-read after claiming so we resume from the freshest saved state.
  const run = (await loadOwnedRun(id, user.id)) ?? existing;
  const started = Date.now();
  const saved: Record<string, { content: string; provider: string; model: string }> = { ...(run.checkpoints ?? {}) };
  const heartbeat = setInterval(() => {
    agentRuns.updateOne({ _id: runId }, { $set: { heartbeatAt: new Date() } }).catch(() => {});
  }, HEARTBEAT_MS);

  // Called after every save: once the budget is spent, stop here (cleanly)
  // and let the next invocation continue — everything so far is stored.
  const yieldIfOutOfTime = () => {
    if (Date.now() - started > STEP_BUDGET_MS) throw new YieldForContinuation();
  };

  try {
    const result = await runTradingAgentsPipeline(
      run.symbol,
      async (partial: Partial<AgentPipelineResult>) => {
        // $set with dot-notation per top-level field so this never clobbers
        // fields an earlier stage already wrote (e.g. `result.reports`
        // written by the analyst stage survives the later debate-stage
        // update, which only ever sends `{debate: ...}`).
        const set: Record<string, unknown> = Object.fromEntries(
          Object.entries(partial).map(([key, value]) => [`result.${key}`, value])
        );
        set.lastProgressAt = new Date();
        await agentRuns.updateOne({ _id: runId }, { $set: set });
        // The last stage has nothing left to hand off.
        if (!("finalDecision" in partial)) yieldIfOutOfTime();
      },
      {
        result: run.result,
        checkpoints: {
          get: (key) => saved[key],
          save: async (key, value) => {
            saved[key] = value;
            await agentRuns.updateOne(
              { _id: runId },
              { $set: { [`checkpoints.${key}`]: value, lastProgressAt: new Date() } }
            );
            yieldIfOutOfTime();
          },
        },
      }
    );

    await agentRuns.updateOne({ _id: runId }, { $set: { status: "complete", result } });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof YieldForContinuation) {
      // Epoch heartbeat = "stalled right now", so the client's next poll
      // re-triggers immediately instead of waiting out the stale window.
      await agentRuns.updateOne({ _id: runId }, { $set: { heartbeatAt: new Date(0) } });
      return NextResponse.json({ status: "running", yielded: true }, { status: 202 });
    }
    const message = err instanceof Error ? err.message : "Trading Agents analysis failed";
    await agentRuns.updateOne({ _id: runId }, { $set: { status: "failed", error: message } });
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearInterval(heartbeat);
  }
}
