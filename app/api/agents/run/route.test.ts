import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { AgentPipelineResult } from "@/lib/agents/types";

const mockRequireUserOrResponse = vi.fn();
vi.mock("@/lib/auth/api", () => ({
  requireUserOrResponse: () => mockRequireUserOrResponse(),
}));

// The pipeline itself (~12 chained AI calls) is exercised by
// lib/agents/*.test.ts and manual live runs — this route's own tests only
// need to verify auth/validation/persistence around it, so it's mocked
// entirely rather than re-testing the AI calls here.
const mockRunPipeline = vi.fn();
vi.mock("@/lib/agents/pipeline", () => ({
  runTradingAgentsPipeline: (symbol: string) => mockRunPipeline(symbol),
}));

interface Doc {
  _id: { toString(): string };
  userId: { toString(): string };
  symbol: string;
  result: unknown;
  createdAt: Date;
}
let store: Doc[] = [];

function matchesUser(doc: Doc, userId: unknown) {
  return doc.userId.toString() === (userId as { toString(): string }).toString();
}

vi.mock("@/lib/db/collections", () => ({
  getCollections: async () => ({
    agentRuns: {
      find: (filter: { userId: unknown }) => ({
        sort: () => ({
          limit: () => ({
            toArray: async () =>
              store
                .filter((d) => matchesUser(d, filter.userId))
                .slice()
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
          }),
        }),
      }),
      insertOne: async (doc: Doc) => {
        store.push(doc);
      },
    },
  }),
}));

const USER = { id: "5f8a1b2c3d4e5f6a7b8c9d0e", email: "user@example.com" };

function postReq(body: unknown) {
  return new Request("http://localhost/api/agents/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const FAKE_RESULT = {
  symbol: "TCS.NS",
  finalDecision: { action: "hold", confidence: "low", rationale: "thin data" },
} as unknown as AgentPipelineResult;

describe("app/api/agents/run routes", () => {
  beforeEach(() => {
    store = [];
    mockRequireUserOrResponse.mockReset();
    mockRequireUserOrResponse.mockResolvedValue(USER);
    mockRunPipeline.mockReset();
  });

  it("GET returns 401 when not authenticated", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireUserOrResponse.mockResolvedValue(NextResponse.json({ error: "Not authenticated" }, { status: 401 }));
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("GET returns an empty list before any run", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(await res.json()).toEqual([]);
  });

  it("POST rejects a missing symbol without ever calling the pipeline", async () => {
    const { POST } = await import("./route");
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  it("POST runs the pipeline, persists the run, and a follow-up GET sees it", async () => {
    mockRunPipeline.mockResolvedValue(FAKE_RESULT);
    const { GET, POST } = await import("./route");

    const res = await POST(postReq({ symbol: "tcs.ns" }));
    expect(res.status).toBe(200);
    expect(mockRunPipeline).toHaveBeenCalledWith("TCS.NS");
    expect(await res.json()).toEqual(FAKE_RESULT);

    const getRes = await GET();
    const list = await getRes.json();
    expect(list).toHaveLength(1);
    expect(list[0].symbol).toBe("TCS.NS");
    expect(list[0].result).toEqual(FAKE_RESULT);
  });

  it("POST returns 502 (not a thrown exception) when the pipeline fails, and doesn't persist anything", async () => {
    mockRunPipeline.mockRejectedValue(new Error("every AI provider failed"));
    const { GET, POST } = await import("./route");

    const res = await POST(postReq({ symbol: "TCS.NS" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("every AI provider failed");

    const getRes = await GET();
    expect(await getRes.json()).toEqual([]);
  });
});
