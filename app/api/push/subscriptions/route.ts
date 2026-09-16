import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SubscriptionInput = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

function validSubscription(value: unknown): value is Required<SubscriptionInput> & { keys: { p256dh: string; auth: string } } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const subscription = value as SubscriptionInput;
  return typeof subscription.endpoint === "string" && subscription.endpoint.startsWith("https://") && subscription.endpoint.length <= 2_000
    && typeof subscription.keys?.p256dh === "string" && subscription.keys.p256dh.length >= 16 && subscription.keys.p256dh.length <= 1_000
    && typeof subscription.keys.auth === "string" && subscription.keys.auth.length >= 8 && subscription.keys.auth.length <= 1_000;
}

function deviceName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : "This device";
}

/** Store the current browser's Web Push subscription for the active profile. */
export async function POST(request: NextRequest) {
  let body: { subscription?: unknown; name?: unknown };
  try {
    body = await request.json() as { subscription?: unknown; name?: unknown };
  } catch {
    return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!validSubscription(body.subscription)) return NextResponse.json({ message: "Invalid push subscription." }, { status: 400 });

  try {
    const user = await getOrCreateCurrentUser(request);
    await databaseQuery(
      `INSERT INTO food_catalog.app.push_subscriptions
         (endpoint, user_id, profile_id, p256dh, auth, device_name, revoked_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, now())
       ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, profile_id = excluded.profile_id,
         p256dh = excluded.p256dh, auth = excluded.auth, device_name = excluded.device_name,
         revoked_at = NULL, updated_at = now()`,
      [body.subscription.endpoint, user.id, user.profileId, body.subscription.keys.p256dh, body.subscription.keys.auth, deviceName(body.name)],
    );
    return attachCurrentUserCookie(NextResponse.json({ status: "stored" }, { status: 201 }), user);
  } catch (error) {
    console.error("Store push subscription failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Push subscription storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}

/** Revoke one browser's Web Push subscription without affecting other devices. */
export async function DELETE(request: NextRequest) {
  let body: { subscription?: { endpoint?: unknown } };
  try {
    body = await request.json() as { subscription?: { endpoint?: unknown } };
  } catch {
    return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 });
  }
  const endpoint = body.subscription?.endpoint;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 2_000) return NextResponse.json({ message: "Invalid push subscription." }, { status: 400 });

  try {
    const user = await getOrCreateCurrentUser(request);
    await databaseQuery("UPDATE food_catalog.app.push_subscriptions SET revoked_at = now() WHERE user_id = $1 AND endpoint = $2", [user.id, endpoint]);
    return attachCurrentUserCookie(new NextResponse(null, { status: 204 }), user);
  } catch (error) {
    console.error("Revoke push subscription failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Push subscription storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
