import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";

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
    return NextResponse.json({ error: "Invalid share id" }, { status: 400 });
  }

  const { shares } = await getCollections();
  const result = await shares.deleteOne({ _id: objectId, ownerId: user.id });
  if (result.deletedCount === 0) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
