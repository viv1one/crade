import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "test-secret";
const ORIGIN = "http://localhost";

const sliceCalls: string[] = [];
const afterTasks: Promise<void>[] = [];
vi.mock("@/lib/agents/continuation", () => ({
  // Run "after response" work inline so the test can await it.
  runAfterResponse: (fn: () => Promise<void>) => void afterTasks.push(fn()),
  runSliceAndChain: async (id: { toString(): string }, origin: string) => {
    sliceCalls.push(`${id.toString()}@${origin}`);
    return { kind: "yielded" };
  },
}));

interface Doc {
  _id: { toString(): string };
  status: string;
  createdAt: Date;
  heartbeatAt?: Date;
}
let store: Doc[] = [];
vi.mock("@/lib/db/collections", () => ({
  getCollections: async () => ({
    agentRuns: {
      find: (filter: { status: string; createdAt: { $gt: Date } }) => ({
        sort: () => ({
          limit: () => ({
            toArray: async () =>
              store
                .filter((d) => d.status === filter.status && d.createdAt > filter.createdAt.$gt)
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
          }),
        }),
      }),
    },
  }),
}));

const id = (n: number) => `${n}`.padStart(24, "0");
const doc = (n: number, over: Partial<Doc> = {}): Doc => ({
  _id: { toString: () => id(n) },
  status: "running",
  createdAt: new Date(Date.now() - 60_000),
  ...over,
});
const req = (query = "", auth: string | null = `Bearer ${SECRET}`) =>
  new Request(`${ORIGIN}/api/cron/resume-agent-runs${query}`, { headers: auth ? { Authorization: auth } : {} });

beforeEach(() => {
  store = [];
  sliceCalls.length = 0;
  afterTasks.length = 0;
  process.env.CRON_SECRET = SECRET;
});

describe("app/api/cron/resume-agent-runs", () => {
  it("fails closed when CRON_SECRET isn't configured", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("./route");
    expect((await GET(req())).status).toBe(401);
  });

  it("rejects a missing or wrong bearer token", async () => {
    const { GET } = await import("./route");
    expect((await GET(req("", null))).status).toBe(401);
    expect((await GET(req("", "Bearer nope"))).status).toBe(401);
  });

  it("chain link: answers 202 at once and runs that run's slice after responding", async () => {
    const { POST } = await import("./route");
    const res = await POST(req(`?runId=${id(7)}`));
    expect(res.status).toBe(202);
    await Promise.all(afterTasks);
    expect(sliceCalls).toEqual([`${id(7)}@${ORIGIN}`]);
  });

  it("chain link: rejects a malformed run id", async () => {
    const { POST } = await import("./route");
    expect((await POST(req("?runId=not-an-id"))).status).toBe(400);
    expect(sliceCalls).toEqual([]);
  });

  it("sweeper: resumes runs nobody is working on, and leaves healthy and finished ones alone", async () => {
    store = [
      doc(1, { heartbeatAt: new Date(Date.now() - 120_000) }), // died
      doc(2, { heartbeatAt: new Date(0) }), // handed off, chain never landed
      doc(3, { heartbeatAt: new Date() }), // actively being worked on
      doc(4), // never claimed, older than the grace period
      doc(5, { createdAt: new Date(Date.now() - 1_000) }), // brand new, first call still on its way
      doc(6, { status: "complete" }),
    ];
    const { GET } = await import("./route");
    const res = await GET(req());
    const body = await res.json();
    expect(body.resumed.sort()).toEqual([id(1), id(2), id(4)]);
    await Promise.all(afterTasks);
    expect(sliceCalls.sort()).toEqual([id(1), id(2), id(4)].map((x) => `${x}@${ORIGIN}`));
  });

  it("sweeper: ignores runs older than six hours (those are resumed by hand)", async () => {
    store = [doc(1, { createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000), heartbeatAt: new Date(0) })];
    const { GET } = await import("./route");
    expect((await (await GET(req())).json()).resumed).toEqual([]);
  });

  it("sweeper: starts at most three runs per pass", async () => {
    store = [1, 2, 3, 4, 5].map((n) => doc(n, { heartbeatAt: new Date(0) }));
    const { GET } = await import("./route");
    expect((await (await GET(req())).json()).resumed).toHaveLength(3);
  });

  it("sweeper: with a backlog, picks the newest stalled runs, not the oldest", async () => {
    store = [1, 2, 3, 4, 5].map((n) =>
      doc(n, { heartbeatAt: new Date(0), createdAt: new Date(Date.now() - (6 - n) * 3_600_000 + 60_000) })
    ); // n=5 is the newest
    const { GET } = await import("./route");
    const body = await (await GET(req())).json();
    expect(body.resumed.sort()).toEqual([id(3), id(4), id(5)]);
  });
});
