import { after } from "next/server";
import { executeRunSlice } from "./run-executor";
import type { ObjectId } from "mongodb";

// Runs `fn` after the current response has been sent, keeping the function
// alive until it finishes (Next's after()). Outside a request scope (unit
// tests, scripts) there is no such thing, so just run it in the background.
export function runAfterResponse(fn: () => Promise<void>): void {
  try {
    after(fn);
  } catch {
    void fn().catch(() => {});
  }
}

export function continuationEnabled(): boolean {
  return !!process.env.CRON_SECRET;
}

// Asks the server to run the run's next slice in a fresh invocation, so a run
// keeps going even if nobody has the page open. The receiving route answers
// 202 immediately and does the work after responding, which means this only
// waits for the hand-off itself (well under a second), never for the slice.
// Best effort: if it doesn't land, the open page or the scheduled sweeper picks
// the run up instead. Needs CRON_SECRET (the receiving route is a cron route
// and fails closed without one).
export function scheduleContinuation(origin: string, runId: string): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  runAfterResponse(async () => {
    await fetch(`${origin}/api/cron/resume-agent-runs?runId=${encodeURIComponent(runId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {});
  });
}

// One slice, then — if it handed off rather than finished — chain the next.
export async function runSliceAndChain(runId: ObjectId, origin: string) {
  const outcome = await executeRunSlice(runId);
  if (outcome.kind === "yielded") scheduleContinuation(origin, runId.toString());
  return outcome;
}
