import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "./auth.tsx";
import { listenForInstall } from "./install.ts";
import { applyTheme, getTheme } from "./theme.ts";

// Chrome fires `beforeinstallprompt` before React mounts. Miss it and there is
// no way to ask for it again — so listen here, not in a component.
listenForInstall();

// Apply the saved theme before first paint (index.html also does this inline to
// avoid a flash on cold PWA launch; this covers dev/HMR).
applyTheme(getTheme());

/**
 * Keeping an installed PWA on the current build.
 *
 * The normal path is the service worker's own: re-check on every foreground,
 * and with registerType "autoUpdate" a new SW installs, activates and reloads
 * the page. Home-screen apps only look for a new SW on a hard launch, so a
 * suspended app would otherwise serve a stale build for days.
 *
 * But that path trusts the service worker to notice, and a wedged SW has no way
 * to notice anything — which is what leaves you deleting the app from the Home
 * Screen and adding it back just to see a deploy. So we also ask a question the
 * SW can't answer for itself: /version.json is fetched from the network,
 * uncached and unprecached, and states which build the *server* is on. If we're
 * running something older and the SW can't fix it, tear the SW down, drop its
 * caches, and reload — a self-inflicted reinstall, without the user doing it.
 */
const HEAL_KEY = "paired_sw_healed"; // one heal per session; never a reload loop

async function heal() {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  // Nothing is left to serve the old shell; this reload comes off the network.
  window.location.reload();
}

registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;

    const check = async () => {
      if (document.visibilityState !== "visible") return;
      reg.update().catch(() => {});

      // Has the server moved on without us?
      let current: string | undefined;
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        current = (await res.json())?.id;
      } catch {
        return; // offline, or the file isn't deployed yet — nothing to conclude
      }
      if (!current || current === __BUILD_ID__) {
        sessionStorage.removeItem(HEAL_KEY);
        return;
      }

      // We're behind. Give the service worker a few seconds to do this the
      // ordinary way (install → activate → reload); only step in if it doesn't.
      if (sessionStorage.getItem(HEAL_KEY)) return;
      sessionStorage.setItem(HEAL_KEY, current);
      setTimeout(() => void heal(), 5000);
    };

    // pageshow + focus cover iOS standalone cases where visibilitychange doesn't fire.
    document.addEventListener("visibilitychange", check);
    window.addEventListener("pageshow", check);
    window.addEventListener("focus", check);

    // Registration resolves after the page's initial pageshow, so a cold launch
    // would miss every event above — run one check now.
    void check();

    // And while the app just sits open in the foreground, no event fires at
    // all. Once a minute is enough to make a deploy land while someone is
    // mid-session; check() bails instantly when the app isn't visible.
    setInterval(() => void check(), 60_000);
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
