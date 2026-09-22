import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";

// Only outcome/outcomeAt are patchable — closing the loop on an earlier
// entry ("what actually happened") is the one edit this feature supports;
// the original symbol/action/reasoning are left as a record of what was
// actually thought at the time, not editable after the fact.
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
    return NextResponse.json({ error: "Invalid journal entry id" }, { status: 400 });
  }

  const body = await request.json();
  const outcome = typeof body.outcome === "string" ? body.outcome.trim() : "";
  if (!outcome) {
    return NextResponse.json({ error: "outcome is required" }, { status: 400 });
  }

  const { journalEntries } = await getCollections();
  const result = await journalEntries.findOneAndUpdate(
    { _id: objectId, userId: new ObjectId(user.id) },
    { $set: { outcome, outcomeAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!result) {
    return NextResponse.json({ error: "Journal entry not found" }, { status: 404 });
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
    return NextResponse.json({ error: "Invalid journal entry id" }, { status: 400 });
  }

  const { journalEntries } = await getCollections();
  const result = await journalEntries.deleteOne({ _id: objectId, userId: new ObjectId(user.id) });
  if (result.deletedCount === 0) {
    return NextResponse.json({ error: "Journal entry not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
