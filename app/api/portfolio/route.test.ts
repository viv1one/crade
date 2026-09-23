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
      updateOne: async ({ ownerId }: { ownerId: string }, update: { $set: object }) => {
        store.set(ownerId, { ...((store.get(ownerId) as object) ?? {}), ...update.$set });
      },
    },
  }),
}));

// markToMarket() calls this for every currently-held symbol after a
// buy/sell — mocked so the equityCurve tests below are deterministic and
// don't hit the real network. Always quotes ₹100, regardless of symbol.
const mockGetQuote = vi.fn(async (symbol: string) => ({ symbol, price: 100 }));
vi.mock("@/lib/market-data", () => ({
  marketData: { getQuote: (symbol: string) => mockGetQuote(symbol) },
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

  it("GET seeds a single starting equityCurve point for a brand-new user", async () => {
    const { GET } = await import("./route");
    const data = await (await GET()).json();
    expect(data.equityCurve).toHaveLength(1);
    expect(data.equityCurve[0].equity).toBe(STARTING_CASH);
  });

  it("POST buy appends one equityCurve point marked to the live quote", async () => {
    const { POST } = await import("./route");
    const data = await (await POST(req({ action: "buy", symbol: "TCS.NS", qty: 2, price: 90 }))).json();
    // Bought at 90 (cash -180), quote mock always returns 100 -> holding
    // marked at 100: (STARTING_CASH - 180) + 2*100 = STARTING_CASH + 20.
    expect(data.equityCurve).toHaveLength(2);
    expect(data.equityCurve[1].equity).toBe(STARTING_CASH + 20);
    expect(mockGetQuote).toHaveBeenCalledWith("TCS.NS");
  });

  it("POST rejects a bad trade without appending an equityCurve point or calling the quote", async () => {
    mockGetQuote.mockClear();
    const { POST } = await import("./route");
    await POST(req({ action: "buy", symbol: "TCS.NS", qty: 100_000, price: 100 }));
    const { GET } = await import("./route");
    const data = await (await GET()).json();
    expect(data.equityCurve).toHaveLength(1); // still just the seed point
    expect(mockGetQuote).not.toHaveBeenCalled();
  });

  it("a failed quote fetch degrades to avgCost rather than failing the trade", async () => {
    mockGetQuote.mockImplementationOnce(async () => {
      throw new Error("provider down");
    });
    const { POST } = await import("./route");
    const res = await POST(req({ action: "buy", symbol: "TCS.NS", qty: 2, price: 100 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    // Marked at avgCost (100) since the quote fetch failed: no change from
    // the trade price itself -> equity == STARTING_CASH.
    expect(data.equityCurve[1].equity).toBe(STARTING_CASH);
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

  it("POST reset returns to the starting balance and a single fresh equityCurve point", async () => {
    const { POST } = await import("./route");
    await POST(req({ action: "buy", symbol: "TCS.NS", qty: 2, price: 100 }));
    const res = await POST(req({ action: "reset" }));
    const data = await res.json();
    expect(data.cash).toBe(STARTING_CASH);
    expect(data.holdings).toEqual({});
    expect(data.equityCurve).toEqual([{ time: expect.any(Number), equity: STARTING_CASH }]);
  });
});
