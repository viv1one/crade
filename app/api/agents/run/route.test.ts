import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const mockRequireUserOrResponse = vi.fn();
vi.mock("@/lib/auth/api", () => ({
  requireUserOrResponse: () => mockRequireUserOrResponse(),
}));

interface Doc {
  _id: { toString(): string };
  userId: { toString(): string };
  symbol: string;
  status: "running" | "complete" | "failed";
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
      find: (filter: { userId: unknown; status?: string; createdAt?: { $gt: Date } }) => ({
        sort: () => ({
          limit: () => ({
            toArray: async () =>
              store
                .filter(
                  (d) =>
                    matchesUser(d, filter.userId) &&
                    (!filter.status || d.status === filter.status) &&
                    (!filter.createdAt || d.createdAt > filter.createdAt.$gt)
                )
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

// This route only creates the run doc and hands back its id — see
// [id]/route.test.ts for the actual pipeline-execution (POST) and
// polling (GET) behavior, which is deliberately a separate endpoint (the
// client needs the id before the ~5-minute execute call resolves, to start
// polling right away — see app/api/agents/run/route.ts's own comment).
describe("app/api/agents/run (create)", () => {
  beforeEach(() => {
    store = [];
    mockRequireUserOrResponse.mockReset();
    mockRequireUserOrResponse.mockResolvedValue(USER);
  });

  it("GET returns 401 when not authenticated", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireUserOrResponse.mockResolvedValue(NextResponse.json({ error: "Not authenticated" }, { status: 401 }));
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/agents/run"));
    expect(res.status).toBe(401);
  });

  it("GET returns an empty list before any run", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/agents/run"));
    expect(await res.json()).toEqual([]);
  });

  it("POST rejects a missing symbol without creating a run", async () => {
    const { POST } = await import("./route");
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    expect(store).toHaveLength(0);
  });

  it("POST creates a running run and returns its id immediately, without executing the pipeline", async () => {
    const { POST } = await import("./route");
    const res = await POST(postReq({ symbol: "tcs.ns" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.symbol).toBe("TCS.NS");
    expect(typeof body.runId).toBe("string");

    expect(store).toHaveLength(1);
    expect(store[0].status).toBe("running");
    expect(store[0].result).toEqual({});
  });

  it("GET (history list) only ever shows complete runs, never running ones", async () => {
    store.push({
      _id: { toString: () => "r1" },
      userId: { toString: () => USER.id },
      symbol: "TCS.NS",
      status: "running",
      result: {},
      createdAt: new Date(),
    });
    const { GET } = await import("./route");
    expect(await (await GET(new Request("http://localhost/api/agents/run"))).json()).toEqual([]);
  });

  describe("?unfinished=1 (resumable runs)", () => {
    const listReq = () => new Request("http://localhost/api/agents/run?unfinished=1");
    const doc = (over: Partial<Doc> & { id: string }): Doc => ({
      _id: { toString: () => over.id },
      userId: { toString: () => USER.id },
      symbol: "TCS.NS",
      status: "running",
      result: {},
      createdAt: new Date(),
      ...over,
    });

    it("lists this user's running runs with how many steps they finished", async () => {
      store.push(doc({ id: "r1", symbol: "JSWHL.NS", result: { reports: {}, debate: {}, checkpoints: 1 } }));
      const { GET } = await import("./route");
      const body = await (await GET(listReq())).json();
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({ _id: "r1", symbol: "JSWHL.NS", stagesDone: 2 });
    });

    it("leaves out complete runs, other users' runs, and runs older than a week", async () => {
      store.push(
        doc({ id: "done", status: "complete" }),
        doc({ id: "other", userId: { toString: () => "someone-else" } }),
        doc({ id: "old", createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) })
      );
      const { GET } = await import("./route");
      expect(await (await GET(listReq())).json()).toEqual([]);
    });
  });
});
