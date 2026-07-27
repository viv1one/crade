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
    return NextResponse.json({ error: "Invalid alert id" }, { status: 400 });
  }

  const body = await request.json();
  if (body.status !== "active" && body.status !== "paused") {
    return NextResponse.json({ error: "status must be 'active' or 'paused'" }, { status: 400 });
  }

  const { alerts } = await getCollections();
  const result = await alerts.findOneAndUpdate(
    { _id: objectId, userId: new ObjectId(user.id) },
    { $set: { status: body.status } },
    { returnDocument: "after" }
  );
  if (!result) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
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
    return NextResponse.json({ error: "Invalid alert id" }, { status: 400 });
  }

  const { alerts } = await getCollections();
  const result = await alerts.deleteOne({ _id: objectId, userId: new ObjectId(user.id) });
  if (result.deletedCount === 0) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
