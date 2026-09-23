import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetQuote = vi.fn(async (symbol: string) => ({ symbol, price: 100 }));
vi.mock("@/lib/market-data", () => ({
  marketData: { getQuote: (symbol: string) => mockGetQuote(symbol) },
}));

interface Doc {
  _id: { toString(): string };
  cash: number;
  holdings: Record<string, { symbol: string; qty: number; avgCost: number }>;
  equityCurve?: { time: number; equity: number }[];
}
let store: Doc[] = [];

vi.mock("@/lib/db/collections", () => ({
  getCollections: async () => ({
    paperPortfolios: {
      find: () => ({ toArray: async () => store }),
      updateOne: async (filter: { _id: unknown }, update: { $set: Partial<Doc> }) => {
        const doc = store.find((d) => d._id === filter._id);
        if (doc) Object.assign(doc, update.$set);
      },
    },
  }),
}));

function req(): Request {
  return new Request("http://localhost/api/cron/snapshot-portfolios", {
    headers: { Authorization: "Bearer test-secret" },
  });
}

describe("app/api/cron/snapshot-portfolios", () => {
  beforeEach(() => {
    store = [];
    mockGetQuote.mockClear();
    vi.stubEnv("CRON_SECRET", "test-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("401s when CRON_SECRET isn't configured, even with a valid-looking header", async () => {
    vi.unstubAllEnvs();
    const { GET } = await import("./route");
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("401s on a wrong bearer token", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/x", { headers: { Authorization: "Bearer nope" } }));
    expect(res.status).toBe(401);
  });

  it("skips a cash-only portfolio (nothing to mark to market)", async () => {
    store.push({ _id: { toString: () => "a" }, cash: 100_000, holdings: {}, equityCurve: [{ time: 1, equity: 100_000 }] });
    const { GET } = await import("./route");
    const data = await (await GET(req())).json();
    expect(data).toEqual({ portfolios: 1, snapshotted: 0, skipped: 1 });
    expect(mockGetQuote).not.toHaveBeenCalled();
  });

  it("marks a held portfolio to the live quote and appends one point", async () => {
    store.push({
      _id: { toString: () => "a" },
      cash: 50_000,
      holdings: { "TCS.NS": { symbol: "TCS.NS", qty: 10, avgCost: 90 } },
      equityCurve: [{ time: 1, equity: 50_900 }],
    });
    const { GET } = await import("./route");
    const data = await (await GET(req())).json();
    expect(data).toEqual({ portfolios: 1, snapshotted: 1, skipped: 0 });
    expect(store[0].equityCurve).toHaveLength(2);
    // 50,000 cash + 10 * 100 (mocked quote) = 51,000
    expect(store[0].equityCurve?.[1].equity).toBe(51_000);
  });

  it("skips a portfolio whose last point is already from today (IST)", async () => {
    const todayIst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const todayEpoch = Math.floor(new Date(`${todayIst}T12:00:00+05:30`).getTime() / 1000);
    store.push({
      _id: { toString: () => "a" },
      cash: 50_000,
      holdings: { "TCS.NS": { symbol: "TCS.NS", qty: 10, avgCost: 90 } },
      equityCurve: [{ time: todayEpoch, equity: 51_000 }],
    });
    const { GET } = await import("./route");
    const data = await (await GET(req())).json();
    expect(data).toEqual({ portfolios: 1, snapshotted: 0, skipped: 1 });
    expect(store[0].equityCurve).toHaveLength(1);
  });

  it("batches quote fetches — one call per unique symbol, not per portfolio", async () => {
    store.push(
      {
        _id: { toString: () => "a" },
        cash: 10_000,
        holdings: { "TCS.NS": { symbol: "TCS.NS", qty: 1, avgCost: 90 } },
        equityCurve: [{ time: 1, equity: 10_090 }],
      },
      {
        _id: { toString: () => "b" },
        cash: 20_000,
        holdings: { "TCS.NS": { symbol: "TCS.NS", qty: 1, avgCost: 90 } },
        equityCurve: [{ time: 1, equity: 20_090 }],
      }
    );
    const { GET } = await import("./route");
    await GET(req());
    expect(mockGetQuote).toHaveBeenCalledTimes(1);
    expect(mockGetQuote).toHaveBeenCalledWith("TCS.NS");
  });

  it("degrades to avgCost when the quote fetch fails, rather than skipping the portfolio", async () => {
    mockGetQuote.mockImplementationOnce(async () => {
      throw new Error("provider down");
    });
    store.push({
      _id: { toString: () => "a" },
      cash: 50_000,
      holdings: { "TCS.NS": { symbol: "TCS.NS", qty: 10, avgCost: 90 } },
      equityCurve: [{ time: 1, equity: 50_900 }],
    });
    const { GET } = await import("./route");
    const data = await (await GET(req())).json();
    expect(data.snapshotted).toBe(1);
    // 50,000 + 10 * 90 (avgCost fallback) = 50,900
    expect(store[0].equityCurve?.[1].equity).toBe(50_900);
  });
});
