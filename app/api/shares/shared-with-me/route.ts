import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";

export async function GET() {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const { shares, users } = await getCollections();
  const list = await shares.find({ invitedEmail: user.email.toLowerCase() }).toArray();

  const ownerIds = [...new Set(list.map((s) => s.ownerId))];
  const owners = await users
    .find({ _id: { $in: ownerIds.map((id) => new ObjectId(id)) } })
    .toArray();
  const emailByOwnerId = new Map(owners.map((o) => [o._id.toString(), o.email]));

  return NextResponse.json(
    list.map((s) => ({
      _id: s._id,
      ownerId: s.ownerId,
      ownerEmail: emailByOwnerId.get(s.ownerId) ?? "unknown",
      resourceType: s.resourceType,
    }))
  );
}
