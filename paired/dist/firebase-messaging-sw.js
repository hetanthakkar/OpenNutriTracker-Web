/* Firebase Cloud Messaging service worker — handles pushes while the PWA is closed.
 * Registered by the Firebase SDK under its own scope, so it coexists with the
 * vite-plugin-pwa Workbox SW (which ignores this file via globIgnores).
 *
 * Fill in the config below with your Firebase web app values (must match the
 * VITE_FB_* env vars used by the app). Until then, push is simply disabled.
 */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDTzbXm8q_QSi4DrYrtCzenArqtDSmuxE0",
  authDomain: "paired-9a3d4.firebaseapp.com",
  projectId: "paired-9a3d4",
  storageBucket: "paired-9a3d4.firebasestorage.app",
  messagingSenderId: "894874896334",
  appId: "1:894874896334:web:9dcee6da6629e6d9eb4d9f",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  self.registration.showNotification(d.title || "Paired", {
    body: d.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: d,
  });
});

/**
 * Tapping a notification takes the user to the screen it's about.
 *
 * The push carries its destination in `data.url` (e.g. "/?screen=notifications").
 * Getting there depends on whether Paired is already open:
 *
 *   open   — focus the window and postMessage the URL; the app routes in memory.
 *            We deliberately don't rely on `client.navigate()`, which on iOS
 *            tends to dump the user on the PWA's start page instead of the
 *            target. It's kept only as a fallback for a client we can't message.
 *   closed — openWindow(url); the app reads `?screen=` on boot.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (!("focus" in client)) continue;
        await client.focus();
        if ("postMessage" in client) {
          client.postMessage({ type: "paired-navigate", url });
        } else if ("navigate" in client) {
          await client.navigate(url).catch(() => {});
        }
        return;
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
