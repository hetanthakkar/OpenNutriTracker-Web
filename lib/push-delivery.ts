import webpush from "web-push";

export type StoredPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushMessage = {
  title: string;
  body: string;
  url: string;
};

function vapidConfiguration() {
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  return subject && publicKey && privateKey ? { subject, publicKey, privateKey } : null;
}

export function isPushDeliveryConfigured() {
  return Boolean(vapidConfiguration());
}

/** Send one standards-based Web Push message using this deployment's VAPID identity. */
export async function sendPush(subscription: StoredPushSubscription, message: PushMessage) {
  const vapid = vapidConfiguration();
  if (!vapid) throw new Error("Web Push VAPID keys are not configured.");
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  await webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
    JSON.stringify(message),
    { TTL: 60 * 60 * 12, urgency: "normal" },
  );
}

export function pushStatusCode(error: unknown) {
  return typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
    ? error.statusCode
    : null;
}
