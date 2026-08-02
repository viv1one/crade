import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";

export async function GET() {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const { realHoldings } = await getCollections();
  const list = await realHoldings
    .find({ userId: new ObjectId(user.id) })
    .sort({ _id: -1 })
    .toArray();
  return NextResponse.json(list);
}

// Adding a symbol the user already holds merges into the existing entry
// (qty accumulates, avgCost becomes the weighted average) instead of
// creating a duplicate row — the realistic case of "I bought more of this
// later." Same weighted-average formula lib/paper-trading/store.ts's
// applyBuy uses, reimplemented here rather than imported — importing from
// the simulated-trading store would blur the boundary between the two
// features the user asked to keep separate.
export async function POST(request: Request) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const qty = Number(body.qty);
  const avgCost = Number(body.avgCost);
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined;

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: "qty must be a positive number" }, { status: 400 });
  }
  if (!Number.isFinite(avgCost) || avgCost <= 0) {
    return NextResponse.json({ error: "avgCost must be a positive number" }, { status: 400 });
  }

  const { realHoldings } = await getCollections();
  const userId = new ObjectId(user.id);
  const existing = await realHoldings.findOne({ userId, symbol });

  if (existing) {
    const newQty = existing.qty + qty;
    const newAvgCost = (existing.qty * existing.avgCost + qty * avgCost) / newQty;
    const result = await realHoldings.findOneAndUpdate(
      { _id: existing._id },
      { $set: { qty: newQty, avgCost: newAvgCost, ...(note ? { note } : {}) } },
      { returnDocument: "after" }
    );
    return NextResponse.json(result);
  }

  const doc = {
    _id: new ObjectId(),
    userId,
    symbol,
    qty,
    avgCost,
    ...(note ? { note } : {}),
    createdAt: new Date(),
  };
  await realHoldings.insertOne(doc);
  return NextResponse.json(doc);
}
