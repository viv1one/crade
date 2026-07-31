import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireUserOrResponse } from "@/lib/auth/api";
import { getCollections } from "@/lib/db/collections";

// List-only — enables the multi-device management UI on /alerts (view +
// revoke individual subscriptions). Registering a new one is still
// app/api/push/subscribe/route.ts's job.
export async function GET() {
  const user = await requireUserOrResponse();
  if (user instanceof NextResponse) return user;

  const { pushSubscriptions } = await getCollections();
  const docs = await pushSubscriptions
    .find({ userId: new ObjectId(user.id) })
    .sort({ createdAt: -1 })
    .toArray();

  return NextResponse.json(
    docs.map((d) => ({
      id: d._id.toString(),
      // The endpoint itself is a long per-browser push-service URL — its
      // host (e.g. fcm.googleapis.com, updates.push.services.mozilla.com)
      // is a reasonable stand-in for "which browser/service" without
      // exposing the full subscription URL to the client unnecessarily.
      host: (() => {
        try {
          return new URL(d.endpoint).host;
        } catch {
          return "unknown";
        }
      })(),
      createdAt: d.createdAt,
    }))
  );
}
