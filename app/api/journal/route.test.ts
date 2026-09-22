import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const mockRequireUserOrResponse = vi.fn();
vi.mock("@/lib/auth/api", () => ({
  requireUserOrResponse: () => mockRequireUserOrResponse(),
}));

// Same in-memory stand-in shape as app/api/holdings/route.test.ts — enough
// of find/insertOne/findOneAndUpdate/deleteOne to exercise the routes' real
// validation/scoping logic without a real Mongo connection.
interface Doc {
  _id: { toString(): string };
  userId: { toString(): string };
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
    journalEntries: {
      find: (filter: { userId: unknown }) => ({
        sort: () => ({
          toArray: async () =>
            store
              .filter((d) => matchesUser(d, filter.userId))
              .slice()
              .reverse(),
        }),
      }),
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
  return new Request("http://localhost/api/journal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function patchReq(body: unknown) {
  return new Request("http://localhost/api/journal/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/journal routes", () => {
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

  it("POST rejects a missing symbol, invalid action, or missing reasoning", async () => {
    const { POST } = await import("./route");
    const noSymbol = await POST(postReq({ action: "buy", reasoning: "why not" }));
    expect(noSymbol.status).toBe(400);

    const badAction = await POST(postReq({ symbol: "TCS.NS", action: "hold", reasoning: "why not" }));
    expect(badAction.status).toBe(400);

    const noReasoning = await POST(postReq({ symbol: "TCS.NS", action: "buy", reasoning: "" }));
    expect(noReasoning.status).toBe(400);
  });

  it("POST rejects a non-numeric price when given", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      postReq({ symbol: "TCS.NS", action: "buy", reasoning: "breakout", price: "not-a-number" })
    );
    expect(res.status).toBe(400);
  });

  it("POST creates an entry (uppercasing the symbol) and a follow-up GET sees it", async () => {
    const { GET, POST } = await import("./route");
    const res = await POST(
      postReq({ symbol: "tcs.ns", action: "buy", reasoning: "breakout above 20-day SMA", price: 3500 })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ symbol: "TCS.NS", action: "buy", reasoning: "breakout above 20-day SMA", price: 3500 });
    expect(data.outcome).toBeUndefined();

    const getRes = await GET();
    const list = await getRes.json();
    expect(list).toHaveLength(1);
    expect(list[0].symbol).toBe("TCS.NS");
  });

  it("POST omits price entirely when not given, rather than storing it as undefined/null", async () => {
    const { POST } = await import("./route");
    const res = await POST(postReq({ symbol: "TCS.NS", action: "watch", reasoning: "just watching" }));
    const data = await res.json();
    expect("price" in data).toBe(false);
  });

  it("PATCH sets outcome/outcomeAt for the owning user only, and rejects an empty outcome", async () => {
    const { POST } = await import("./route");
    const created = await (
      await POST(postReq({ symbol: "TCS.NS", action: "buy", reasoning: "breakout" }))
    ).json();

    const { PATCH } = await import("./[id]/route");
    const empty = await PATCH(patchReq({ outcome: "" }), {
      params: Promise.resolve({ id: created._id.toString() }),
    });
    expect(empty.status).toBe(400);

    const res = await PATCH(patchReq({ outcome: "closed at 3800, up 8.5%" }), {
      params: Promise.resolve({ id: created._id.toString() }),
    });
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.outcome).toBe("closed at 3800, up 8.5%");
    expect(updated.outcomeAt).toBeTruthy();
  });

  it("PATCH 404s for an id that doesn't belong to the user", async () => {
    const { PATCH } = await import("./[id]/route");
    const { ObjectId } = await import("mongodb");
    const res = await PATCH(patchReq({ outcome: "whatever" }), {
      params: Promise.resolve({ id: new ObjectId().toString() }),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE removes an entry, and a second DELETE 404s", async () => {
    const { POST } = await import("./route");
    const created = await (
      await POST(postReq({ symbol: "TCS.NS", action: "buy", reasoning: "breakout" }))
    ).json();

    const { DELETE } = await import("./[id]/route");
    const res1 = await DELETE(new Request("http://localhost/api/journal/x", { method: "DELETE" }), {
      params: Promise.resolve({ id: created._id.toString() }),
    });
    expect(res1.status).toBe(200);

    const res2 = await DELETE(new Request("http://localhost/api/journal/x", { method: "DELETE" }), {
      params: Promise.resolve({ id: created._id.toString() }),
    });
    expect(res2.status).toBe(404);
  });
});
