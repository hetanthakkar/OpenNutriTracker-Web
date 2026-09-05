import { api } from "./api";
import { FIREBASE_CONFIG, VAPID_KEY, firebaseConfigured } from "./firebase";
import { invalidate, keys } from "./query";

/** True on iOS Safari only when NOT launched from the Home Screen — iOS refuses
 *  Web Push in a normal browser tab, so the user must "Add to Home Screen". */
function iosNeedsInstall(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return isIOS && !standalone;
}

/**
 * Where this device stands on push, as the UI needs to talk about it:
 *   granted     — on.
 *   prompt      — we can still ask.
 *   blocked     — the browser won't ask again; only site settings can undo it.
 *   install     — iOS, not on the Home Screen yet, so asking can't work.
 *   unsupported — no push here at all.
 */
export type PushPermission = "granted" | "prompt" | "blocked" | "install" | "unsupported";

export function pushPermission(): PushPermission {
  if (typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window))
    return "unsupported";
  if (Notification.permission === "granted") return "granted";
  // Checked after "granted": once permission is in hand the token is registered
  // and iOS is moot. Before that, an iOS browser tab would prompt and fail.
  if (iosNeedsInstall()) return "install";
  if (Notification.permission === "denied") return "blocked";
  return "prompt";
}

/**
 * Mint this device's FCM token and hand it to the backend, assuming permission
 * is already granted. Firebase is imported lazily so it stays out of the main
 * bundle for anyone who never turns notifications on.
 *
 * Registration can't be a one-time thing at opt-in: FCM rotates tokens, and the
 * server drops the ones Firebase reports as dead. A device that only registered
 * once would eventually have permission granted and no token on file — pushes
 * would silently stop, and the *partner* would be told they'd never turned
 * notifications on. So this runs on every launch (see `syncPushToken`) and the
 * token on file stays true.
 */
/** Bound once per page load: `onMessage` stacks handlers, and enabling twice in
 *  one session would otherwise pop two notifications for one push. */
let foregroundBound = false;

async function registerToken(): Promise<string | null> {
  const { initializeApp, getApps } = await import("firebase/app");
  const { getMessaging, getToken, deleteToken, onMessage, isSupported } = await import("firebase/messaging");
  if (!(await isSupported())) return null;

  // Google sign-in may already have initialised the default app; reuse it.
  const app = getApps()[0] ?? initializeApp(FIREBASE_CONFIG as Record<string, string>);
  const messaging = getMessaging(app);

  // A push that arrives while the app is open doesn't raise a system
  // notification on its own, and the service worker stays out of it — so raise
  // it here, and refresh the bell so the badge counts it immediately.
  if (!foregroundBound) {
    foregroundBound = true;
    onMessage(messaging, (payload) => {
      const d = payload.data ?? {};
      new Notification(d.title ?? "Together", { body: d.body ?? "", icon: "/icon-192.png" });
      invalidate(keys.nudges);
    });
  }

  // FCM reuses the browser's existing PushSubscription. If that subscription is
  // stale — a rotated VAPID key, a service worker replaced by a deploy, a token
  // the server has since pruned — `getToken` fails rather than healing itself.
  // Tear the subscription down and mint a fresh one, which is the only way back
  // for a device that has already subscribed once.
  let token: string | null = null;
  try {
    token = await getToken(messaging, { vapidKey: VAPID_KEY });
  } catch (e) {
    console.warn("getToken failed; resubscribing from scratch:", e);
    await deleteToken(messaging).catch(() => {});
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe().catch(() => {});
    token = await getToken(messaging, { vapidKey: VAPID_KEY });
  }
  if (!token) return null;

  await api("/api/devices/", { method: "POST", body: { token, name: navigator.userAgent.slice(0, 80) } });
  return token;
}

/**
 * Re-register this device on launch when permission is already granted, so the
 * backend's idea of "can we reach them" keeps matching reality. Silent by
 * design: there's no user intent behind it and nothing for them to act on.
 */
export async function syncPushToken(): Promise<void> {
  if (!firebaseConfigured || pushPermission() !== "granted") return;
  try {
    await registerToken();
  } catch (e) {
    console.warn("push token sync failed:", e);
  }
}

/** Ask for permission and register the token. Returns a human-readable status. */
export async function enableNotifications(): Promise<string> {
  if (!firebaseConfigured) return "Notifications aren't configured yet (add Firebase keys).";
  if (iosNeedsInstall()) return "On iPhone, add Together to your Home Screen first, then enable.";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "This device doesn't support push.";

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "Notifications were not allowed.";

    const token = await registerToken();
    if (!token) return "Could not get a push token.";
    return "Notifications enabled.";
  } catch (e) {
    console.error("enableNotifications failed:", e);
    // Say what actually broke. "Something went wrong" leaves the user with no
    // move and us with nothing to debug — Firebase's own codes
    // (messaging/token-subscribe-failed, …) are at least searchable, and they
    // distinguish "your browser blocked it" from "the push service is down".
    const code = (e as { code?: string }).code;
    const detail = code || (e instanceof Error ? e.message : String(e));
    return `Couldn't enable notifications: ${detail}`;
  }
}
