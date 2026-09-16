import { databaseQuery } from "@/lib/db";
import { isPushDeliveryConfigured, pushStatusCode, sendPush, type StoredPushSubscription } from "@/lib/push-delivery";

type OwnerSubscriptionRow = StoredPushSubscription;

/**
 * Deliver a best-effort alert to a profile owner after a partner views their
 * shared dashboard. This deliberately never throws: sharing access must not
 * depend on a browser's push subscription staying valid.
 */
export async function notifyOwnerOfSharedDashboardView({
  ownerUserId,
  viewerName,
}: {
  ownerUserId: string;
  viewerName: string;
}) {
  if (!isPushDeliveryConfigured()) return { delivered: 0, skipped: "unconfigured" as const };

  try {
    const subscriptions = await databaseQuery<OwnerSubscriptionRow>(
      `SELECT subscription.endpoint, subscription.p256dh, subscription.auth
       FROM food_catalog.app.user_preferences preferences
       JOIN food_catalog.app.push_subscriptions subscription
         ON subscription.user_id = preferences.user_id AND subscription.revoked_at IS NULL
       WHERE preferences.user_id = $1
         AND COALESCE(preferences.preferences->>'notifications', 'true') = 'true'`,
      [ownerUserId],
    );
    if (!subscriptions.rowCount) return { delivered: 0, skipped: "no_subscription" as const };

    let delivered = 0;
    for (const subscription of subscriptions.rows) {
      try {
        await sendPush(subscription, {
          title: "Shared dashboard viewed",
          body: `${viewerName} viewed your shared nutrition dashboard.`,
          url: "/?page=profile",
        });
        delivered += 1;
      } catch (error) {
        const status = pushStatusCode(error);
        if (status === 404 || status === 410) {
          await databaseQuery(
            "UPDATE food_catalog.app.push_subscriptions SET revoked_at = now() WHERE endpoint = $1",
            [subscription.endpoint],
          );
        }
        console.error("Shared dashboard push delivery failed", error);
      }
    }
    return { delivered, skipped: null };
  } catch (error) {
    console.error("Shared dashboard notification lookup failed", error);
    return { delivered: 0, skipped: "failed" as const };
  }
}
