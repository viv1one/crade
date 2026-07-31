import { beforeEach, describe, expect, it, vi } from "vitest";
import { STARTING_CASH } from "@/lib/paper-trading/types";

const mockRequireUserOrResponse = vi.fn();
vi.mock("@/lib/auth/api", () => ({
  requireUserOrResponse: () => mockRequireUserOrResponse(),
}));

// In-memory stand-in for the one collection this route touches —
// enough of findOne/updateOne's shape to exercise the route's actual
// load/apply/save logic without a real Mongo connection.
const store = new Map<string, unknown>();
vi.mock("@/lib/db/collections", () => ({
  getCollections: async () => ({
    paperPortfolios: {
      findOne: async ({ ownerId }: { ownerId: string }) => store.get(ownerId) ?? null,
      updateOne: async ({ ownerId }: { ownerId: string }, update: { $set: unknown }) => {
        store.set(ownerId, update.$set);
      },
    },
  }),
}));

const USER = { id: "user-1", email: "user@example.com" };

function req(body: unknown) {
  return new Request("http://localhost/api/portfolio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/portfolio/route", () => {
  beforeEach(() => {
    store.clear();
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

  it("GET returns an empty starting portfolio for a new user", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    const data = await res.json();
    expect(data.cash).toBe(STARTING_CASH);
    expect(data.holdings).toEqual({});
  });

  it("POST buy deducts cash, persists the new state, and a follow-up GET sees it", async () => {
    const { GET, POST } = await import("./route");
    const buyRes = await POST(req({ action: "buy", symbol: "TCS.NS", qty: 2, price: 100 }));
    expect(buyRes.status).toBe(200);
    const buyData = await buyRes.json();
    expect(buyData.cash).toBe(STARTING_CASH - 200);
    expect(buyData.holdings["TCS.NS"]).toMatchObject({ qty: 2, avgCost: 100 });

    const getRes = await GET();
    const getData = await getRes.json();
    expect(getData.cash).toBe(STARTING_CASH - 200);
  });

  it("POST buy beyond available cash rejects with the AppError message, not a raw stack", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({ action: "buy", symbol: "TCS.NS", qty: 100_000, price: 100 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/insufficient/i);
  });

  it("POST with an unknown action returns 400", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({ action: "yolo" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Unknown action");
  });

  it("POST reset returns to the starting balance", async () => {
    const { POST } = await import("./route");
    await POST(req({ action: "buy", symbol: "TCS.NS", qty: 2, price: 100 }));
    const res = await POST(req({ action: "reset" }));
    const data = await res.json();
    expect(data.cash).toBe(STARTING_CASH);
    expect(data.holdings).toEqual({});
  });
});
