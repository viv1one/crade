import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const mockRequireUserOrResponse = vi.fn();
vi.mock("@/lib/auth/api", () => ({
  requireUserOrResponse: () => mockRequireUserOrResponse(),
}));

// In-memory stand-in for the one collection these routes touch — enough of
// find/findOne/insertOne/findOneAndUpdate/deleteOne's shape to exercise the
// routes' real load/merge/save logic without a real Mongo connection.
interface Doc {
  _id: { toString(): string };
  userId: { toString(): string };
  symbol?: string;
  [key: string]: unknown;
}
let store: Doc[] = [];

function matchesId(doc: Doc, id: unknown) {
  return doc._id.toString() === (id as { toString(): string }).toString();
}
function matchesUser(doc: Doc, userId: unknown) {
  return doc.userId.toString() === (userId as { toString(): string }).toString();
}

vi.mock("@/lib/db/collections", () => ({
  getCollections: async () => ({
    realHoldings: {
      find: (filter: { userId: unknown }) => ({
        sort: () => ({
          toArray: async () =>
            store
              .filter((d) => matchesUser(d, filter.userId))
              .slice()
              .reverse(),
        }),
      }),
      findOne: async (filter: { userId: unknown; symbol?: string }) =>
        store.find(
          (d) => matchesUser(d, filter.userId) && (filter.symbol === undefined || d.symbol === filter.symbol)
        ) ?? null,
      insertOne: async (doc: Doc) => {
        store.push(doc);
      },
      findOneAndUpdate: async (
        filter: { _id?: unknown; userId?: unknown },
        update: { $set: Record<string, unknown> }
      ) => {
        const doc = store.find(
          (d) =>
            (filter._id === undefined || matchesId(d, filter._id)) &&
            (filter.userId === undefined || matchesUser(d, filter.userId))
        );
        if (!doc) return null;
        Object.assign(doc, update.$set);
        return doc;
      },
      deleteOne: async (filter: { _id: unknown; userId: unknown }) => {
        const idx = store.findIndex((d) => matchesId(d, filter._id) && matchesUser(d, filter.userId));
        if (idx === -1) return { deletedCount: 0 };
        store.splice(idx, 1);
        return { deletedCount: 1 };
      },
    },
  }),
}));

const USER = { id: "5f8a1b2c3d4e5f6a7b8c9d0e", email: "user@example.com" };

function postReq(body: unknown) {
  return new Request("http://localhost/api/holdings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function patchReq(body: unknown) {
  return new Request("http://localhost/api/holdings/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/holdings routes", () => {
  beforeEach(() => {
    store = [];
    mockRequireUserOrResponse.mockReset();
    mockRequireUserOrResponse.mockResolvedValue(USER);
  });

  it("GET returns 401 when not authenticated", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireUserOrResponse.mockResolvedValue(NextResponse.json({ error: "Not authenticated" }, { status: 401 }));
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("GET returns an empty list for a new user", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("POST rejects a non-positive qty or avgCost", async () => {
    const { POST } = await import("./route");
    const res1 = await POST(postReq({ symbol: "TCS.NS", qty: 0, avgCost: 100 }));
    expect(res1.status).toBe(400);
    const res2 = await POST(postReq({ symbol: "TCS.NS", qty: 10, avgCost: -5 }));
    expect(res2.status).toBe(400);
  });

  it("POST creates a new holding and a follow-up GET sees it", async () => {
    const { GET, POST } = await import("./route");
    const res = await POST(postReq({ symbol: "tcs.ns", qty: 10, avgCost: 3500 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ symbol: "TCS.NS", qty: 10, avgCost: 3500 });

    const getRes = await GET();
    const list = await getRes.json();
    expect(list).toHaveLength(1);
    expect(list[0].symbol).toBe("TCS.NS");
  });

  it("POST with an existing symbol merges into one row with the weighted-average cost", async () => {
    const { GET, POST } = await import("./route");
    await POST(postReq({ symbol: "TCS.NS", qty: 10, avgCost: 3000 }));
    const res = await POST(postReq({ symbol: "TCS.NS", qty: 10, avgCost: 4000 }));
    const data = await res.json();
    // (10*3000 + 10*4000) / 20 = 3500
    expect(data).toMatchObject({ symbol: "TCS.NS", qty: 20, avgCost: 3500 });

    const getRes = await GET();
    const list = await getRes.json();
    expect(list).toHaveLength(1); // merged, not a duplicate row
  });

  it("POST accepts an optional purchasedAt and rejects an unparseable one", async () => {
    const { POST } = await import("./route");
    const good = await POST(postReq({ symbol: "TCS.NS", qty: 10, avgCost: 3000, purchasedAt: "2024-01-15" }));
    expect(good.status).toBe(200);
    const goodData = await good.json();
    expect(new Date(goodData.purchasedAt).toISOString().slice(0, 10)).toBe("2024-01-15");

    const bad = await POST(postReq({ symbol: "INFY.NS", qty: 1, avgCost: 1000, purchasedAt: "not-a-date" }));
    expect(bad.status).toBe(400);
  });

  it("merging into an existing holding keeps the earlier of the two purchase dates", async () => {
    const { POST } = await import("./route");
    await POST(postReq({ symbol: "TCS.NS", qty: 10, avgCost: 3000, purchasedAt: "2024-06-01" }));
    const res = await POST(postReq({ symbol: "TCS.NS", qty: 10, avgCost: 4000, purchasedAt: "2023-01-01" }));
    const data = await res.json();
    expect(new Date(data.purchasedAt).toISOString().slice(0, 10)).toBe("2023-01-01");
  });

  it("PATCH updates qty/avgCost/note for the owning user only", async () => {
    const { POST } = await import("./route");
    const created = await (await POST(postReq({ symbol: "TCS.NS", qty: 10, avgCost: 3000 }))).json();

    const { PATCH } = await import("./[id]/route");
    const res = await PATCH(patchReq({ qty: 5, note: "sold half via Groww" }), {
      params: Promise.resolve({ id: created._id.toString() }),
    });
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated).toMatchObject({ qty: 5, note: "sold half via Groww" });
  });

  it("DELETE removes a holding, and a second DELETE 404s", async () => {
    const { POST } = await import("./route");
    const created = await (await POST(postReq({ symbol: "TCS.NS", qty: 10, avgCost: 3000 }))).json();

    const { DELETE } = await import("./[id]/route");
    const res1 = await DELETE(new Request("http://localhost/api/holdings/x", { method: "DELETE" }), {
      params: Promise.resolve({ id: created._id.toString() }),
    });
    expect(res1.status).toBe(200);

    const res2 = await DELETE(new Request("http://localhost/api/holdings/x", { method: "DELETE" }), {
      params: Promise.resolve({ id: created._id.toString() }),
    });
    expect(res2.status).toBe(404);
  });
});
