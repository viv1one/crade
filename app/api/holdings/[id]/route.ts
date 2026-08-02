import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: "Invalid holding id" }, { status: 400 });
  }

  const body = await request.json();
  const update: { qty?: number; avgCost?: number; note?: string } = {};

  if (body.qty !== undefined) {
    const qty = Number(body.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: "qty must be a positive number" }, { status: 400 });
    }
    update.qty = qty;
  }
  if (body.avgCost !== undefined) {
    const avgCost = Number(body.avgCost);
    if (!Number.isFinite(avgCost) || avgCost <= 0) {
      return NextResponse.json({ error: "avgCost must be a positive number" }, { status: 400 });
    }
    update.avgCost = avgCost;
  }
  if (typeof body.note === "string") {
    update.note = body.note.trim();
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { realHoldings } = await getCollections();
  const result = await realHoldings.findOneAndUpdate(
    { _id: objectId, userId: new ObjectId(user.id) },
    { $set: update },
    { returnDocument: "after" }
  );
  if (!result) {
    return NextResponse.json({ error: "Holding not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: "Invalid holding id" }, { status: 400 });
  }

  const { realHoldings } = await getCollections();
  const result = await realHoldings.deleteOne({ _id: objectId, userId: new ObjectId(user.id) });
  if (result.deletedCount === 0) {
    return NextResponse.json({ error: "Holding not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
