import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";

export async function POST(request: Request) {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const body = await request.json();
  const endpoint = body?.endpoint;
  const keys = body?.keys;
  if (typeof endpoint !== "string" || typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string") {
    return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
  }

  const { pushSubscriptions } = await getCollections();
  await pushSubscriptions.updateOne(
    { userId: new ObjectId(user.id), endpoint },
    {
      $set: {
        userId: new ObjectId(user.id),
        endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
  return NextResponse.json({ ok: true });
}
