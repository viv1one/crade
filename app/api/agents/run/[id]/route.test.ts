import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { AgentPipelineResult } from "@/lib/agents/types";
import type { OnStage } from "@/lib/agents/pipeline";

const mockRequireUserOrResponse = vi.fn();
vi.mock("@/lib/auth/api", () => ({
  requireUserOrResponse: () => mockRequireUserOrResponse(),
}));

const mockRunPipeline = vi.fn();
vi.mock("@/lib/agents/pipeline", () => ({
  runTradingAgentsPipeline: (symbol: string, onStage?: OnStage) => mockRunPipeline(symbol, onStage),
}));

interface Doc {
  _id: string;
  userId: string;
  symbol: string;
  status: "running" | "complete" | "failed";
  result: Record<string, unknown>;
  error?: string;
  createdAt: Date;
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
      updateOne: async (filter: { _id: { toString(): string } }, update: { $set: Record<string, unknown> }) => {
        const doc = store.find((d) => d._id === filter._id.toString());
        if (!doc) return;
        for (const [key, value] of Object.entries(update.$set)) {
          if (key.startsWith("result.")) doc.result[key.slice("result.".length)] = value;
          else (doc as unknown as Record<string, unknown>)[key] = value;
        }
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
});
