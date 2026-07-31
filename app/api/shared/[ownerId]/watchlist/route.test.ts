import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const mockRequireUserOrResponse = vi.fn();
vi.mock("@/lib/auth/api", () => ({
  requireUserOrResponse: () => mockRequireUserOrResponse(),
}));

interface FakeShare {
  ownerId: string;
  resourceType: string;
  invitedEmail: string;
}
interface FakeUser {
  _id: ObjectId;
  email: string;
}
interface FakeWatchlist {
  ownerId: string;
  name: string;
  symbols: string[];
}

const shares: FakeShare[] = [];
const users: FakeUser[] = [];
const watchlists: FakeWatchlist[] = [];

vi.mock("@/lib/db/collections", () => ({
  getCollections: async () => ({
    shares: {
      findOne: async (query: Partial<FakeShare>) =>
        shares.find(
          (s) =>
            s.ownerId === query.ownerId &&
            s.resourceType === query.resourceType &&
            s.invitedEmail === query.invitedEmail
        ) ?? null,
    },
    users: {
      findOne: async (query: { _id: ObjectId }) =>
        users.find((u) => u._id.equals(query._id)) ?? null,
    },
    watchlists: {
      findOne: async (query: { ownerId: string; name: string }) =>
        watchlists.find((w) => w.ownerId === query.ownerId && w.name === query.name) ?? null,
    },
  }),
}));

const VIEWER = { id: "viewer-1", email: "viewer@example.com" };

function callGet(ownerId: string) {
  return import("./route").then(({ GET }) =>
    GET(new Request("http://localhost/api/shared/x/watchlist"), { params: Promise.resolve({ ownerId }) })
  );
}

describe("GET /api/shared/[ownerId]/watchlist — the one authoritative cross-user check", () => {
  beforeEach(() => {
    shares.length = 0;
    users.length = 0;
    watchlists.length = 0;
    mockRequireUserOrResponse.mockReset();
    mockRequireUserOrResponse.mockResolvedValue(VIEWER);
  });

  it("403s an uninvited viewer — no Share doc means no access, full stop", async () => {
    const ownerId = new ObjectId().toString();
    users.push({ _id: new ObjectId(ownerId), email: "owner@example.com" });
    watchlists.push({ ownerId, name: "default", symbols: ["RELIANCE.NS"] });
    // deliberately no share for VIEWER.email

    const res = await callGet(ownerId);
    expect(res.status).toBe(403);
  });

  it("200s an invited viewer with the owner's real symbols", async () => {
    const ownerId = new ObjectId().toString();
    users.push({ _id: new ObjectId(ownerId), email: "owner@example.com" });
    watchlists.push({ ownerId, name: "default", symbols: ["RELIANCE.NS", "TCS.NS"] });
    shares.push({ ownerId, resourceType: "watchlist", invitedEmail: VIEWER.email });

    const res = await callGet(ownerId);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ownerEmail).toBe("owner@example.com");
    expect(data.symbols).toEqual(["RELIANCE.NS", "TCS.NS"]);
  });

  it("returns an empty symbol list rather than erroring when the owner has no watchlist doc yet", async () => {
    const ownerId = new ObjectId().toString();
    users.push({ _id: new ObjectId(ownerId), email: "owner@example.com" });
    shares.push({ ownerId, resourceType: "watchlist", invitedEmail: VIEWER.email });

    const res = await callGet(ownerId);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.symbols).toEqual([]);
  });

  it("400s an invalid ownerId even if (implausibly) a share row matched it", async () => {
    const ownerId = "not-a-valid-object-id";
    shares.push({ ownerId, resourceType: "watchlist", invitedEmail: VIEWER.email });

    const res = await callGet(ownerId);
    expect(res.status).toBe(400);
  });

  it("401s when the caller isn't authenticated at all", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireUserOrResponse.mockResolvedValue(NextResponse.json({ error: "Not authenticated" }, { status: 401 }));
    const res = await callGet(new ObjectId().toString());
    expect(res.status).toBe(401);
  });
});
