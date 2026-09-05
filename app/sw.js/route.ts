const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const VAPID_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY ?? "";
const SUBSCRIPTION_ENDPOINT = process.env.NEXT_PUBLIC_PUSH_SUBSCRIPTION_ENDPOINT ?? "";

export const dynamic = "force-dynamic";

function script(): string {
  return `
const BUILD_ID = ${JSON.stringify(BUILD_ID)};
const VAPID_KEY = ${JSON.stringify(VAPID_KEY)};
const SUBSCRIPTION_ENDPOINT = ${JSON.stringify(SUBSCRIPTION_ENDPOINT)};

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function base64UrlToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const nested = data.data || {};
  const title = data.title || nested.title || "OpenNutriTracker";
  const body = data.body || nested.body || "";
  const url = data.url || nested.url || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/logo.svg",
      badge: "/logo.svg",
      data: { ...nested, ...data, url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (!("focus" in client)) continue;
        await client.focus();
        if ("postMessage" in client) client.postMessage({ type: "ont-navigate", url });
        else if ("navigate" in client) await client.navigate(url).catch(() => {});
        return;
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

// Browser push subscriptions can rotate independently of the page. Refresh the
// server record even if the app is closed when that happens.
self.addEventListener("pushsubscriptionchange", (event) => {
  if (!VAPID_KEY) return;
  event.waitUntil((async () => {
    const subscription = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(VAPID_KEY),
    });
    if (!SUBSCRIPTION_ENDPOINT) return;
    await fetch(SUBSCRIPTION_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ subscription: subscription.toJSON(), name: "service-worker-refresh" }),
    }).catch(() => {});
  })());
});

// BUILD_ID is intentionally embedded in this file. A new deploy therefore
// changes the service-worker bytes, allowing registration.update() to detect it.
void BUILD_ID;
`;
}

export async function GET() {
  return new Response(script(), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
