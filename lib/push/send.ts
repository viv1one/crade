import webpush from "web-push";
import type { PushSubscriptionDoc } from "../db/collections";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
  process.env.VAPID_PUBLIC_KEY ?? "",
  process.env.VAPID_PRIVATE_KEY ?? ""
);

export async function sendPushNotification(
  subscription: PushSubscriptionDoc,
  payload: { title: string; body: string; url?: string }
) {
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    },
    JSON.stringify(payload)
  );
}
