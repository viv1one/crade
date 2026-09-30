import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { AgentPipelineResult } from "@/lib/agents/types";
import type { OnStage, ResumeState } from "@/lib/agents/pipeline";

const mockRequireUserOrResponse = vi.fn();
vi.mock("@/lib/auth/api", () => ({
  requireUserOrResponse: () => mockRequireUserOrResponse(),
}));

const mockRunPipeline = vi.fn();
vi.mock("@/lib/agents/pipeline", () => ({
  runTradingAgentsPipeline: (symbol: string, onStage?: OnStage, resume?: ResumeState) =>
    mockRunPipeline(symbol, onStage, resume),
}));

interface Doc {
  _id: string;
  userId: string;
  symbol: string;
  status: "running" | "complete" | "failed";
  result: Record<string, unknown>;
  error?: string;
  createdAt: Date;
  checkpoints?: Record<string, unknown>;
  heartbeatAt?: Date;
  lastProgressAt?: Date;
  invocations?: number;
  stepAttempts?: Record<string, number>;
  claimedAt?: Date;
  inflightKey?: string;
  learnedLimitMs?: number;
  deathLifetimesMs?: number[];
}
let store: Doc[] = [];

// Minimal fake ObjectId — just needs isValid()/toString()/equality by
// string value, which is all this route's own code and this mock touch.
class FakeObjectId {
  constructor(private value: string = "000000000000000000000001") {}
  toString() {
    return this.value;
  }
  static isValid(v: string) {
    return /^[0-9a-fA-F]{24}$/.test(v);
  }
}
vi.mock("mongodb", () => ({ ObjectId: FakeObjectId }));

vi.mock("@/lib/db/collections", () => ({
  getCollections: async () => ({
    agentRuns: {
      findOne: async (filter: { _id: { toString(): string }; userId?: { toString(): string } }) =>
        store.find(
          (d) => d._id === filter._id.toString() && (filter.userId === undefined || d.userId === filter.userId.toString())
        ) ?? null,
      updateOne: async (
        filter: { _id: { toString(): string }; $or?: unknown },
        update: { $set?: Record<string, unknown>; $inc?: Record<string, number>; $unset?: Record<string, unknown> }
      ) => {
        const doc = store.find((d) => d._id === filter._id.toString());
        if (!doc) return { modifiedCount: 0 };
        // The atomic claim: only matches when nobody has claimed the run yet
        // or the last heartbeat is older than the cutoff in the filter.
        if (filter.$or) {
          const clauses = filter.$or as { heartbeatAt: { $exists?: boolean; $lt?: Date } }[];
          const matches = clauses.some((c) =>
            c.heartbeatAt.$exists === false
              ? doc.heartbeatAt === undefined
              : doc.heartbeatAt !== undefined && doc.heartbeatAt < (c.heartbeatAt.$lt as Date)
          );
          if (!matches) return { modifiedCount: 0 };
        }
        for (const [key, value] of Object.entries(update.$set ?? {})) {
          if (key.startsWith("result.")) doc.result[key.slice("result.".length)] = value;
          else if (key.startsWith("checkpoints.")) {
            doc.checkpoints = { ...(doc.checkpoints ?? {}), [key.slice("checkpoints.".length)]: value };
          } else if (key.startsWith("stepAttempts.")) {
            doc.stepAttempts = { ...(doc.stepAttempts ?? {}), [key.slice("stepAttempts.".length)]: value as number };
          } else (doc as unknown as Record<string, unknown>)[key] = value;
        }
        for (const key of Object.keys(update.$unset ?? {})) delete (doc as unknown as Record<string, unknown>)[key];
        for (const [key, by] of Object.entries(update.$inc ?? {})) {
          const rec = doc as unknown as Record<string, number | undefined>;
          rec[key] = (rec[key] ?? 0) + by;
        }
        return { modifiedCount: 1 };
      },
    },
  }),
}));

const USER = { id: "000000000000000000000099", email: "user@example.com" };
const RUN_ID = "000000000000000000000042";

function req() {
  return new Request(`http://localhost/api/agents/run/${RUN_ID}`);
}
function params() {
  return { params: Promise.resolve({ id: RUN_ID }) };
}

const FAKE_RESULT = {
  symbol: "TCS.NS",
  finalDecision: { action: "hold", confidence: "low", rationale: "thin data" },
} as unknown as AgentPipelineResult;

describe("app/api/agents/run/[id] (poll + execute)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AGENTS_STEP_BUDGET_SECONDS;
    store = [
      { _id: RUN_ID, userId: USER.id, symbol: "TCS.NS", status: "running", result: {}, createdAt: new Date() },
    ];
    mockRequireUserOrResponse.mockReset();
    mockRequireUserOrResponse.mockResolvedValue(USER);
    mockRunPipeline.mockReset();
  });

  it("GET 404s for a run that doesn't belong to this user", async () => {
    store[0].userId = "someone-else";
    const { GET } = await import("./route");
    const res = await GET(req(), params());
    expect(res.status).toBe(404);
  });

  it("GET returns the run's current (possibly partial) state", async () => {
    const { GET } = await import("./route");
    const res = await GET(req(), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("running");
    expect(body.result).toEqual({});
  });

  it("POST executes the pipeline, writes incremental progress via onStage, then marks complete", async () => {
    mockRunPipeline.mockImplementation(async (_symbol: string, onStage?: OnStage) => {
      await onStage?.({ reports: FAKE_RESULT.reports });
      // Mid-run, GET should already see the partial field onStage just wrote.
      const { GET } = await import("./route");
      const mid = await (await GET(req(), params())).json();
      expect(mid.status).toBe("running");
      expect(mid.result.reports).toEqual(FAKE_RESULT.reports);

      await onStage?.({ finalDecision: FAKE_RESULT.finalDecision });
      return FAKE_RESULT;
    });

    const { POST } = await import("./route");
    const res = await POST(req(), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(FAKE_RESULT);
    expect(store[0].status).toBe("complete");
    expect(store[0].result).toEqual(FAKE_RESULT);
  });

  it("POST marks the run failed (not complete) and returns 502 when the pipeline throws", async () => {
    mockRunPipeline.mockRejectedValue(new Error("every AI provider failed"));
    const { POST } = await import("./route");
    const res = await POST(req(), params());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("every AI provider failed");
    expect(store[0].status).toBe("failed");
  });

  it("POST refuses to re-execute a run that's already complete", async () => {
    store[0].status = "complete";
    const { POST } = await import("./route");
    const res = await POST(req(), params());
    expect(res.status).toBe(409);
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  describe("resumable execution", () => {
    it("GET reports a run with a fresh heartbeat as not stalled", async () => {
      store[0].heartbeatAt = new Date();
      const { GET } = await import("./route");
      const body = await (await GET(req(), params())).json();
      expect(body.stalled).toBe(false);
    });

    it("GET reports a run whose heartbeat went stale as stalled", async () => {
      store[0].heartbeatAt = new Date(Date.now() - 60_000);
      const { GET } = await import("./route");
      expect((await (await GET(req(), params())).json()).stalled).toBe(true);
    });

    it("GET reports a handed-off run (epoch heartbeat) as stalled immediately", async () => {
      store[0].heartbeatAt = new Date(0);
      const { GET } = await import("./route");
      expect((await (await GET(req(), params())).json()).stalled).toBe(true);
    });

    it("GET reports a brand-new, never-claimed run as not stalled, but an old unclaimed one as stalled", async () => {
      const { GET } = await import("./route");
      expect((await (await GET(req(), params())).json()).stalled).toBe(false);
      store[0].createdAt = new Date(Date.now() - 60_000);
      expect((await (await GET(req(), params())).json()).stalled).toBe(true);
    });

    it("GET never reports a finished run as stalled", async () => {
      store[0].status = "complete";
      store[0].heartbeatAt = new Date(0);
      const { GET } = await import("./route");
      expect((await (await GET(req(), params())).json()).stalled).toBe(false);
    });

    it("POST refuses (409) while another invocation is actively working on the run", async () => {
      store[0].heartbeatAt = new Date();
      const { POST } = await import("./route");
      const res = await POST(req(), params());
      expect(res.status).toBe(409);
      expect(mockRunPipeline).not.toHaveBeenCalled();
    });

    it("POST takes over a run whose previous invocation stopped heartbeating, resuming from what was saved", async () => {
      store[0].heartbeatAt = new Date(Date.now() - 60_000);
      store[0].result = { reports: FAKE_RESULT.reports } as Record<string, unknown>;
      store[0].checkpoints = { debate_bull: { content: "bull", provider: "p", model: "m" } };
      mockRunPipeline.mockImplementation(async (_s: string, _o: OnStage | undefined, resume?: ResumeState) => {
        expect(resume?.result).toEqual({ reports: FAKE_RESULT.reports });
        expect(resume?.checkpoints?.get("debate_bull")).toEqual({ content: "bull", provider: "p", model: "m" });
        return FAKE_RESULT;
      });
      const { POST } = await import("./route");
      const res = await POST(req(), params());
      expect(res.status).toBe(200);
      expect(store[0].status).toBe("complete");
      expect(store[0].invocations).toBe(1);
    });

    it("saves each finished AI call as a checkpoint", async () => {
      mockRunPipeline.mockImplementation(async (_s: string, _o: OnStage | undefined, resume?: ResumeState) => {
        await resume?.checkpoints?.save("debate_bull", { content: "bull case", provider: "p", model: "m" });
        expect(resume?.checkpoints?.get("debate_bull")?.content).toBe("bull case");
        return FAKE_RESULT;
      });
      const { POST } = await import("./route");
      await POST(req(), params());
      expect(store[0].checkpoints).toEqual({ debate_bull: { content: "bull case", provider: "p", model: "m" } });
    });

    it("ends the invocation with 202 once its time budget is spent, leaving the run resumable", async () => {
      process.env.AGENTS_STEP_BUDGET_SECONDS = "0.001"; // 1ms
      mockRunPipeline.mockImplementation(async (_s: string, onStage?: OnStage) => {
        await new Promise((r) => setTimeout(r, 15));
        await onStage?.({ reports: FAKE_RESULT.reports }); // saved, then the route yields
        throw new Error("should not get here — the save hook yields first");
      });
      const { POST, GET } = await import("./route");
      const res = await POST(req(), params());
      expect(res.status).toBe(202);
      expect(await res.json()).toMatchObject({ status: "running", yielded: true });
      expect(store[0].status).toBe("running"); // not failed
      expect(store[0].result.reports).toEqual(FAKE_RESULT.reports); // progress kept
      // ...and it reads as stalled right away, so the client continues without waiting.
      expect((await (await GET(req(), params())).json()).stalled).toBe(true);
    });

    it("does not hand off after the final stage (nothing left to continue)", async () => {
      process.env.AGENTS_STEP_BUDGET_SECONDS = "0.001";
      mockRunPipeline.mockImplementation(async (_s: string, onStage?: OnStage) => {
        await new Promise((r) => setTimeout(r, 15));
        await onStage?.({ riskDebate: FAKE_RESULT.riskDebate, finalDecision: FAKE_RESULT.finalDecision });
        return FAKE_RESULT;
      });
      const { POST } = await import("./route");
      expect((await POST(req(), params())).status).toBe(200);
      expect(store[0].status).toBe("complete");
    });

    it("gives each AI call the invocation's deadline, and rotates the provider on a retry", async () => {
      store[0].stepAttempts = { debate_bull: 2 };
      let seen: { a: unknown; b: unknown } | undefined;
      mockRunPipeline.mockImplementation(async (_s: string, _o: OnStage | undefined, resume?: ResumeState) => {
        seen = { a: resume?.checkpoints?.callOptions?.("debate_bull"), b: resume?.checkpoints?.callOptions?.("debate_bear") };
        return FAKE_RESULT;
      });
      const before = Date.now();
      const { POST } = await import("./route");
      await POST(req(), params());
      const a = seen!.a as { deadline: number; startAt: number };
      const b = seen!.b as { deadline: number; startAt: number };
      expect(a.startAt).toBe(2); // the step that timed out twice starts two providers along
      expect(b.startAt).toBe(0);
      expect(a.deadline).toBeGreaterThan(before);
      expect(a.deadline).toBeLessThan(before + 300_000); // inside the assumed invocation limit
    });

    describe("learning the host's real limit from a slice it killed", () => {
      const T = Date.now() - 200_000;
      const killedMidCall = (lifetimeMs: number, extra: Partial<Doc> = {}): Partial<Doc> => ({
        claimedAt: new Date(T),
        heartbeatAt: new Date(T + lifetimeMs), // last sign of life; long since stale
        inflightKey: "debate_bull",
        ...extra,
      });
      let seen: { deadline: number; startAt: number; concise?: boolean } | undefined;
      let startedAt = 0;
      beforeEach(() => {
        seen = undefined;
        mockRunPipeline.mockImplementation(async (_s: string, _o: OnStage | undefined, resume?: ResumeState) => {
          startedAt = Date.now();
          seen = resume?.checkpoints?.callOptions?.("debate_bull") as typeof seen;
          return FAKE_RESULT;
        });
      });

      it("does not set a limit from a single death, but does count the call as an attempt", async () => {
        Object.assign(store[0], killedMidCall(60_000));
        const { POST } = await import("./route");
        await POST(req(), params());
        expect(store[0].learnedLimitMs).toBeUndefined();
        expect(store[0].deathLifetimesMs).toEqual([60_000]);
        expect(store[0].stepAttempts).toEqual({ debate_bull: 1 });
        expect(seen!.startAt).toBe(1); // a different provider first this time
      });

      it("keeps later calls inside the limit once two slices have died at about the same age", async () => {
        Object.assign(store[0], killedMidCall(58_000, { deathLifetimesMs: [60_000] }));
        const { POST } = await import("./route");
        await POST(req(), params());
        expect(store[0].learnedLimitMs).toBe(60_000); // the larger of the two
        // deadline = this slice's start + learned limit - margin (a few seconds), not the 300s default
        expect(seen!.deadline - startedAt).toBeGreaterThan(50_000);
        expect(seen!.deadline - startedAt).toBeLessThan(60_000);
      });

      it("a stray crash followed by a real host kill doesn't cap the run at the crash's age", async () => {
        Object.assign(store[0], killedMidCall(60_000, { deathLifetimesMs: [9_000] }));
        const { POST } = await import("./route");
        await POST(req(), params());
        expect(store[0].learnedLimitMs).toBe(60_000);
      });

      it("never learns a limit below 30s (two quick crashes aren't a host limit)", async () => {
        Object.assign(store[0], killedMidCall(4_000, { deathLifetimesMs: [5_000] }));
        const { POST } = await import("./route");
        await POST(req(), params());
        expect(store[0].learnedLimitMs).toBe(30_000);
      });

      it("only ever tightens the limit", async () => {
        Object.assign(store[0], killedMidCall(90_000, { deathLifetimesMs: [90_000], learnedLimitMs: 45_000 }));
        const { POST } = await import("./route");
        await POST(req(), params());
        expect(store[0].learnedLimitMs).toBe(45_000);
      });

      it("learns nothing from a clean hand-off (epoch heartbeat), even with a call marked in flight", async () => {
        Object.assign(store[0], killedMidCall(60_000, { heartbeatAt: new Date(0) }));
        const { POST } = await import("./route");
        await POST(req(), params());
        expect(store[0].learnedLimitMs).toBeUndefined();
        expect(store[0].stepAttempts).toBeUndefined();
      });

      it("asks for a shorter answer once the same call has timed out twice", async () => {
        Object.assign(store[0], killedMidCall(60_000, { stepAttempts: { debate_bull: 1 }, deathLifetimesMs: [60_000] })); // this death makes it 2
        const { POST } = await import("./route");
        await POST(req(), params());
        expect(seen!.concise).toBe(true);
      });

      it("fails the run, naming the step and the host limit, once one call has been killed too often", async () => {
        Object.assign(store[0], killedMidCall(60_000, { stepAttempts: { debate_bull: 3 }, deathLifetimesMs: [60_000] }));
        const { POST } = await import("./route");
        const res = await POST(req(), params());
        expect(res.status).toBe(502);
        const { error } = await res.json();
        expect(error).toMatch(/too slow/i);
        expect(error).toMatch(/research debate/i);
        expect(error).toMatch(/60s/);
        expect(mockRunPipeline).not.toHaveBeenCalled();
      });

      it("records which call is in flight, and clears it once the call is saved", async () => {
        mockRunPipeline.mockImplementation(async (_s: string, _o: OnStage | undefined, resume?: ResumeState) => {
          await resume?.checkpoints?.began?.("debate_bear");
          expect(store[0].inflightKey).toBe("debate_bear");
          await resume?.checkpoints?.save("debate_bear", { content: "x", provider: "p", model: "m" });
          expect(store[0].inflightKey).toBeUndefined();
          return FAKE_RESULT;
        });
        const { POST } = await import("./route");
        await POST(req(), params());
        expect(store[0].claimedAt).toBeInstanceOf(Date);
      });
    });

    it("treats a call that ran out of time as a retry (202), not a failure, and counts the attempt", async () => {
      const { StepDeadlineError } = await import("@/lib/agents/checkpoint");
      mockRunPipeline.mockRejectedValue(new StepDeadlineError("debate_bull"));
      const { POST, GET } = await import("./route");
      const res = await POST(req(), params());
      expect(res.status).toBe(202);
      expect(store[0].status).toBe("running");
      expect(store[0].stepAttempts).toEqual({ debate_bull: 1 });
      expect((await (await GET(req(), params())).json()).stalled).toBe(true); // continues right away
    });

    it("fails the run with a clear message once the same call has timed out too many times", async () => {
      const { StepDeadlineError } = await import("@/lib/agents/checkpoint");
      store[0].stepAttempts = { risk_fm: 3 };
      mockRunPipeline.mockRejectedValue(new StepDeadlineError("risk_fm"));
      const { POST } = await import("./route");
      const res = await POST(req(), params());
      expect(res.status).toBe(502);
      const { error } = await res.json();
      expect(error).toMatch(/too slow/i);
      expect(error).toMatch(/fund manager/i);
      expect(store[0].status).toBe("failed");
    });

    it("gives up on a run that has been attempted too many times", async () => {
      store[0].invocations = 40;
      const { POST } = await import("./route");
      const res = await POST(req(), params());
      expect(res.status).toBe(502);
      expect(store[0].status).toBe("failed");
      expect(mockRunPipeline).not.toHaveBeenCalled();
    });
  });
});
