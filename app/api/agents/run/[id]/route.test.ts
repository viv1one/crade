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
      findOne: async (filter: { _id: { toString(): string }; userId: { toString(): string } }) =>
        store.find((d) => d._id === filter._id.toString() && d.userId === filter.userId.toString()) ?? null,
      updateOne: async (
        filter: { _id: { toString(): string }; $or?: unknown },
        update: { $set?: Record<string, unknown>; $inc?: Record<string, number> }
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
          } else (doc as unknown as Record<string, unknown>)[key] = value;
        }
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
