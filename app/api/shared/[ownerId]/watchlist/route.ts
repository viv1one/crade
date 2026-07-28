import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";

// Read-only: returns another user's watchlist symbols, but only if that
// user has an active share granting the current viewer access. This is the
// authoritative permission check — nothing upstream of this route enforces
// it, so don't add other ways to reach someone else's watchlist without
// going through the same check.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ownerId: string }> }
) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;
  const { ownerId } = await params;

  const { shares, watchlists, users } = await getCollections();
  const share = await shares.findOne({
    ownerId,
    resourceType: "watchlist",
    invitedEmail: user.email.toLowerCase(),
  });
  if (!share) {
    return NextResponse.json({ error: "Not shared with you" }, { status: 403 });
  }

  let owner = null;
  try {
    owner = await users.findOne({ _id: new ObjectId(ownerId) });
  } catch {
    return NextResponse.json({ error: "Invalid owner id" }, { status: 400 });
  }
  const doc = await watchlists.findOne({ ownerId, name: "default" });

  return NextResponse.json({
    ownerEmail: owner?.email ?? "unknown",
    symbols: doc?.symbols ?? [],
  });
}
