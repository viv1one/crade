import { ObjectId } from "mongodb";
import { getCollections } from "../db/collections";
import { runTradingAgentsPipeline } from "./pipeline";
import { StepDeadlineError, YieldForContinuation, type StoredChat } from "./checkpoint";
import type { AgentPipelineResult } from "./types";

// A Trading Agents run is ~12 AI calls and can take minutes, longer than some
// hosts allow one function invocation to live. So a run is executed in
// "slices": each slice claims the run, works for a short while, saves what it
// finished, and ends cleanly; another slice continues from the saved state.
// Who starts the next slice: the run route's caller (the open page), the
// server itself (lib/agents/continuation.ts chains one slice into the next),
// or the scheduled sweeper (app/api/cron/resume-agent-runs) as a backstop —
// the atomic claim below makes any number of them safe to fire at once.

/** How long a slice keeps starting new work before it hands off. */
export const STEP_BUDGET_MS = (Number(process.env.AGENTS_STEP_BUDGET_SECONDS) || 20) * 1000;
/**
 * How long one invocation is assumed to be allowed to live until we learn
 * otherwise (matches the routes' maxDuration). AI calls get a deadline inside
 * it so a call that can't finish is abandoned and retried elsewhere rather than
 * left running until the host kills the function. Nothing needs configuring:
 * when a slice is killed mid-call, its lifetime becomes the new limit for the
 * rest of the run (see learnLimit below). AGENTS_INVOCATION_LIMIT_SECONDS
 * overrides the starting assumption.
 */
export const INVOCATION_LIMIT_MS = (Number(process.env.AGENTS_INVOCATION_LIMIT_SECONDS) || 300) * 1000;
/** A killed slice never teaches a limit below this (a random crash isn't a host limit). */
const MIN_LEARNED_LIMIT_MS = 30_000;
/** From this many timeouts of the same call, ask the model for a shorter answer. */
const CONCISE_FROM_ATTEMPT = 2;
/** Headroom left after the last AI call for saving state and responding. */
const DEADLINE_MARGIN_MS = 4_000;

export const HEARTBEAT_MS = 5_000;
/** A slice that hasn't heartbeated for this long is presumed dead. */
export const STALE_AFTER_MS = 20_000;
/** A run that was created but never picked up counts as stalled after this. */
export const UNCLAIMED_AFTER_MS = 10_000;
/** Safety net: a run that keeps getting cut off without ever finishing. */
export const MAX_INVOCATIONS = 40;
/** The same AI call timing out this many times means it can't work here. */
export const MAX_STEP_ATTEMPTS = 4;

export type SliceOutcome =
  | { kind: "complete"; result: AgentPipelineResult }
  | { kind: "yielded" }
  | { kind: "busy" }
  | { kind: "finished"; status: "complete" | "failed" }
  | { kind: "not_found" }
  | { kind: "failed"; error: string };

function describeStep(key: string): string {
  if (key.startsWith("analyst_")) return `the ${key.slice("analyst_".length)} analyst`;
  if (key.startsWith("debate_")) return `the research debate (${key.slice("debate_".length)})`;
  if (key.startsWith("risk_")) return `the risk debate (${key.slice("risk_".length).replace("fm", "fund manager")})`;
  return key === "trader" ? "the trader's plan" : key;
}

/**
 * Runs one slice of a run. Never throws for expected outcomes; the caller maps
 * the outcome to a response (or, for the sweeper, just to a log line).
 */
export async function executeRunSlice(runId: ObjectId): Promise<SliceOutcome> {
  const { agentRuns } = await getCollections();
  const existing = await agentRuns.findOne({ _id: runId });
  if (!existing) return { kind: "not_found" };
  if (existing.status !== "running") return { kind: "finished", status: existing.status };

  if ((existing.invocations ?? 0) >= MAX_INVOCATIONS) {
    const error = "The analysis didn't finish after many attempts — please run it again.";
    await agentRuns.updateOne({ _id: runId }, { $set: { status: "failed", error } });
    return { kind: "failed", error };
  }

  // What the previous slice left behind, captured before our own claim
  // overwrites it.
  const prev = { heartbeatAt: existing.heartbeatAt, claimedAt: existing.claimedAt, inflightKey: existing.inflightKey };

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
  if (claim.modifiedCount !== 1) return { kind: "busy" };

  // Re-read after claiming so we resume from the freshest saved state.
  const run = (await agentRuns.findOne({ _id: runId })) ?? existing;
  const started = Date.now();
  const saved: Record<string, StoredChat> = { ...(run.checkpoints ?? {}) };
  const attempts: Record<string, number> = { ...(run.stepAttempts ?? {}) };

  // Was the previous slice killed mid-call (not a clean hand-off, which leaves
  // an epoch heartbeat)? Then that call didn't finish where the host let it
  // run: count it as an attempt so the retry uses another provider and a
  // shorter answer, and remember how long the slice lived — that's the host's
  // real limit, so later calls are kept inside it.
  let learnedLimitMs = run.learnedLimitMs;
  if (prev.heartbeatAt && prev.heartbeatAt.getTime() > 0 && prev.claimedAt && prev.inflightKey) {
    const key = prev.inflightKey;
    const lifetime = prev.heartbeatAt.getTime() - prev.claimedAt.getTime();
    // One death could be a crash or a deploy; two slices dying at about the same
    // age is the host's limit. Take the larger of the last two so a stray crash
    // never caps a run that the host would have let finish.
    const deaths = [...(run.deathLifetimesMs ?? []), lifetime].slice(-2);
    if (deaths.length >= 2) {
      const learned = Math.max(MIN_LEARNED_LIMIT_MS, ...deaths);
      if (learned < (learnedLimitMs ?? INVOCATION_LIMIT_MS)) learnedLimitMs = learned;
    }
    attempts[key] = (attempts[key] ?? 0) + 1;
    await agentRuns.updateOne(
      { _id: runId },
      {
        $set: {
          deathLifetimesMs: deaths,
          ...(learnedLimitMs !== undefined ? { learnedLimitMs } : {}),
          [`stepAttempts.${key}`]: attempts[key],
        },
      }
    );
    if (attempts[key] >= MAX_STEP_ATTEMPTS) {
      const limitNote = learnedLimitMs ? ` (about ${Math.round(learnedLimitMs / 1000)}s per request)` : "";
      const error =
        `The AI provider was too slow to finish ${describeStep(key)} within this host's time limit${limitNote}. ` +
        `Try again later, or configure a faster AI provider.`;
      await agentRuns.updateOne({ _id: runId }, { $set: { status: "failed", error } });
      return { kind: "failed", error };
    }
  }
  await agentRuns.updateOne({ _id: runId }, { $set: { claimedAt: new Date(started) }, $unset: { inflightKey: "" } });
  const limitMs = learnedLimitMs ?? INVOCATION_LIMIT_MS;
  const heartbeat = setInterval(() => {
    agentRuns.updateOne({ _id: runId }, { $set: { heartbeatAt: new Date() } }).catch(() => {});
  }, HEARTBEAT_MS);

  // Called after every save: once the budget is spent, stop here (cleanly)
  // and let the next slice continue — everything so far is stored.
  const yieldIfOutOfTime = () => {
    if (Date.now() - started > STEP_BUDGET_MS) throw new YieldForContinuation();
  };

  try {
    const result = await runTradingAgentsPipeline(
      run.symbol,
      async (partial: Partial<AgentPipelineResult>) => {
        // $set with dot-notation per top-level field so this never clobbers
        // fields an earlier stage already wrote.
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
              { $set: { [`checkpoints.${key}`]: value, lastProgressAt: new Date() }, $unset: { inflightKey: "" } }
            );
            yieldIfOutOfTime();
          },
          began: async (key) => {
            await agentRuns.updateOne({ _id: runId }, { $set: { inflightKey: key } });
          },
          callOptions: (key) => ({
            // Abandon a call that can't finish before this invocation must
            // end, and on a retry begin with a different provider and ask for
            // a shorter answer.
            deadline: started + limitMs - DEADLINE_MARGIN_MS,
            startAt: attempts[key] ?? 0,
            concise: (attempts[key] ?? 0) >= CONCISE_FROM_ATTEMPT,
          }),
        },
      }
    );

    await agentRuns.updateOne({ _id: runId }, { $set: { status: "complete", result } });
    return { kind: "complete", result };
  } catch (err) {
    if (err instanceof YieldForContinuation) {
      // Epoch heartbeat = "stalled right now", so whoever is watching can
      // start the next slice immediately instead of waiting out the stale window.
      await agentRuns.updateOne({ _id: runId }, { $set: { heartbeatAt: new Date(0) } });
      return { kind: "yielded" };
    }
    if (err instanceof StepDeadlineError) {
      const count = (attempts[err.key] ?? 0) + 1;
      if (count >= MAX_STEP_ATTEMPTS) {
        const error =
          `The AI provider was too slow to finish ${describeStep(err.key)} (${count} attempts). ` +
          `Try again later, or configure a faster AI provider.`;
        await agentRuns.updateOne({ _id: runId }, { $set: { status: "failed", error } });
        return { kind: "failed", error };
      }
      await agentRuns.updateOne(
        { _id: runId },
        { $set: { heartbeatAt: new Date(0), [`stepAttempts.${err.key}`]: count } }
      );
      return { kind: "yielded" };
    }
    const error = err instanceof Error ? err.message : "Trading Agents analysis failed";
    await agentRuns.updateOne({ _id: runId }, { $set: { status: "failed", error } });
    return { kind: "failed", error };
  } finally {
    clearInterval(heartbeat);
  }
}
