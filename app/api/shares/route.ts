import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";
import type { ShareResourceType } from "@/lib/db/collections";

const RESOURCE_TYPES: ShareResourceType[] = ["watchlist"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const { shares } = await getCollections();
  const list = await shares.find({ ownerId: user.id }).sort({ _id: -1 }).toArray();
  return NextResponse.json(list);
}

export async function POST(request: Request) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const invitedEmail = typeof body.invitedEmail === "string" ? body.invitedEmail.trim().toLowerCase() : "";
  const resourceType: ShareResourceType = RESOURCE_TYPES.includes(body.resourceType)
    ? body.resourceType
    : "watchlist";

  if (!EMAIL_RE.test(invitedEmail)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (invitedEmail === user.email.toLowerCase()) {
    return NextResponse.json({ error: "You can't share with yourself" }, { status: 400 });
  }

  const { shares } = await getCollections();
  const existing = await shares.findOne({ ownerId: user.id, resourceType, invitedEmail });
  if (existing) {
    return NextResponse.json(existing);
  }

  const doc = {
    _id: new ObjectId(),
    ownerId: user.id,
    resourceType,
    invitedEmail,
    createdAt: new Date(),
  };
  await shares.insertOne(doc);
  return NextResponse.json(doc);
}
