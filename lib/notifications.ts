const VAPID_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY;
const SUBSCRIPTION_ENDPOINT = process.env.NEXT_PUBLIC_PUSH_SUBSCRIPTION_ENDPOINT;
const LOCAL_KEY = "ont_push_subscription";

export type PushPermission = "granted" | "prompt" | "blocked" | "install" | "unsupported" | "unconfigured";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushPermission(): PushPermission {
  if (typeof window === "undefined") return "unsupported";
  if (!VAPID_KEY) return "unconfigured";
  if (typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted") return "granted";
  if (isIOS() && !isStandalone()) return "install";
  if (Notification.permission === "denied") return "blocked";
  return "prompt";
}

function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameApplicationServerKey(subscription: PushSubscription, expected: Uint8Array<ArrayBuffer>): boolean {
  const existing = subscription.options.applicationServerKey;
  if (!existing) return false;
  const current = new Uint8Array(existing);
  if (current.byteLength !== expected.byteLength) return false;
  return current.every((byte, index) => byte === expected[index]);
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

async function sendSubscription(subscription: PushSubscription, method: "POST" | "DELETE" = "POST"): Promise<void> {
  const payload = {
    subscription: subscription.toJSON(),
    name: navigator.userAgent.slice(0, 120),
  };

  localStorage.setItem(LOCAL_KEY, JSON.stringify(payload.subscription));
  if (!SUBSCRIPTION_ENDPOINT) return;

  const response = await fetch(SUBSCRIPTION_ENDPOINT, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Push subscription sync failed (${response.status})`);
  }
}

async function ensureSubscription(): Promise<PushSubscription> {
  if (!VAPID_KEY) throw new Error("NEXT_PUBLIC_WEB_PUSH_VAPID_KEY is not configured");

  const registration = await getRegistration();
  const applicationServerKey = base64UrlToUint8Array(VAPID_KEY);
  let subscription = await registration.pushManager.getSubscription();

  // If the VAPID key changed, the old subscription cannot be repaired in place.
  if (subscription && !sameApplicationServerKey(subscription, applicationServerKey)) {
    await subscription.unsubscribe().catch(() => false);
    subscription = null;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  await sendSubscription(subscription, "POST");
  return subscription;
}

/**
 * Re-sync on every launch when permission is already granted. This mirrors the
 * Paired app's token refresh behavior: the server's idea of reachable devices
 * should never depend on a one-time opt-in from months ago.
 */
export async function syncPushSubscription(): Promise<void> {
  if (pushPermission() !== "granted") return;
  try {
    await ensureSubscription();
  } catch (error) {
    console.warn("Push subscription sync failed:", error);
  }
}

/** Must be called from a user gesture. */
export async function enableNotifications(): Promise<string> {
  const state = pushPermission();
  if (state === "unconfigured") return "Push notifications are not configured yet.";
  if (state === "unsupported") return "This device does not support web push.";
  if (state === "install") return "On iPhone, add OpenNutriTracker to the Home Screen first, then enable notifications.";
  if (state === "blocked") return "Notifications are blocked in browser settings.";

  try {
    const permission = state === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") return "Notifications were not allowed.";

    await ensureSubscription();
    return SUBSCRIPTION_ENDPOINT
      ? "Notifications enabled."
      : "Notifications enabled on this device; configure the push subscription endpoint to send server pushes.";
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Enabling notifications failed:", error);
    return `Couldn't enable notifications: ${detail}`;
  }
}

export async function disableNotifications(): Promise<string> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return "Notifications are off.";

  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();

    if (subscription) {
      if (SUBSCRIPTION_ENDPOINT) await sendSubscription(subscription, "DELETE").catch(() => {});
      await subscription.unsubscribe();
    }

    localStorage.removeItem(LOCAL_KEY);
    return "Notifications disabled for this device.";
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `Couldn't disable notifications: ${detail}`;
  }
}
