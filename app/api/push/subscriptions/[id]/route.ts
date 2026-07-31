import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: "Invalid subscription id" }, { status: 400 });
  }

  const { pushSubscriptions } = await getCollections();
  // userId-scoped delete filter — a user can only ever revoke their own
  // subscriptions, never one belonging to another account.
  const result = await pushSubscriptions.deleteOne({ _id: objectId, userId: new ObjectId(user.id) });
  if (result.deletedCount === 0) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
