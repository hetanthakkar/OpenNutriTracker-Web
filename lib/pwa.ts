const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID?.trim() || "dev";
const HEAL_KEY = "ont_sw_healed";
const LEGACY_ICON_CACHE_PURGE_KEY = "ont_legacy_icon_cache_purged_v1";

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallWindow = Window & {
  __ontInstallPrompt?: BeforeInstallPromptEvent | null;
};

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function canPromptInstall(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as InstallWindow).__ontInstallPrompt);
}

export async function promptInstall(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const w = window as InstallWindow;
  const event = w.__ontInstallPrompt;
  if (!event) return false;

  w.__ontInstallPrompt = null;
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome === "accepted";
}

async function healStaleWorker(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }

  window.location.reload();
}

/** Remove stale custom-icon responses left by earlier PWA versions once. */
async function purgeLegacyIconCaches(): Promise<void> {
  if (localStorage.getItem(LEGACY_ICON_CACHE_PURGE_KEY)) return;
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    localStorage.setItem(LEGACY_ICON_CACHE_PURGE_KEY, "true");
  } catch {
    // Cache storage is optional; a browser may deny it in private mode.
  }
}

function setViewportMetrics(): () => void {
  const root = document.documentElement;
  const visualViewport = window.visualViewport;

  const update = () => {
    const standalone = isStandalone();
    root.dataset.pwaStandalone = standalone ? "true" : "false";

    // Fixed overlays use the layout viewport, which the on-screen keyboard does
    // not consistently shrink on iOS. Keep the overlay's lower edge at the
    // visual viewport's lower edge instead, so bottom sheets land above the
    // keyboard in both browser and installed-PWA modes.
    const visibleBottom = visualViewport
      ? visualViewport.offsetTop + visualViewport.height
      : window.innerHeight;
    root.style.setProperty("--pwa-visible-bottom", `${visibleBottom}px`);

    // iOS can reposition fixed UI above the software keyboard while the app
    // shell itself remains full-height. Hide the tab bar for that short-lived
    // state so it cannot cover focused form fields or the sheet's scroll area.
    const viewportBaseline = standalone
      ? (() => {
          const portrait = window.matchMedia("(orientation: portrait)").matches;
          return portrait
            ? Math.max(window.screen.width, window.screen.height)
            : Math.min(window.screen.width, window.screen.height);
        })()
      : window.innerHeight;
    const keyboardVisible = Boolean(visualViewport && viewportBaseline - visibleBottom > 120);
    root.dataset.pwaKeyboard = keyboardVisible ? "true" : "false";

    if (!standalone) {
      root.style.removeProperty("--app-height");
      return;
    }

    let height = window.innerHeight;
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;

    // iOS can report a viewport that is too short on a cold Home Screen launch.
    // In standalone mode the real screen height is a safe lower bound.
    if (iosStandalone) {
      const portrait = window.matchMedia("(orientation: portrait)").matches;
      const screenHeight = portrait
        ? Math.max(window.screen.width, window.screen.height)
        : Math.min(window.screen.width, window.screen.height);
      height = Math.max(height, screenHeight);
    }

    root.style.setProperty("--app-height", `${height}px`);
  };

  update();
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
  window.addEventListener("appinstalled", update);
  visualViewport?.addEventListener("resize", update);
  visualViewport?.addEventListener("scroll", update);

  return () => {
    window.removeEventListener("resize", update);
    window.removeEventListener("orientationchange", update);
    window.removeEventListener("appinstalled", update);
    visualViewport?.removeEventListener("resize", update);
    visualViewport?.removeEventListener("scroll", update);
    root.style.removeProperty("--pwa-visible-bottom");
  };
}

export function startPwaRuntime(): () => void {
  if (typeof window === "undefined") return () => {};

  const stopMetrics = setViewportMetrics();
  void purgeLegacyIconCaches();
  if (!("serviceWorker" in navigator)) return stopMetrics;

  let stopped = false;
  let registration: ServiceWorkerRegistration | null = null;
  let healTimer: number | undefined;
  let interval: number | undefined;
  let checking = false;
  let reloadingForController = false;
  const hadControllerAtStart = Boolean(navigator.serviceWorker.controller);

  const onInstallPrompt = (event: Event) => {
    event.preventDefault();
    (window as InstallWindow).__ontInstallPrompt = event as BeforeInstallPromptEvent;
  };
  const onInstalled = () => {
    (window as InstallWindow).__ontInstallPrompt = null;
  };
  window.addEventListener("beforeinstallprompt", onInstallPrompt);
  window.addEventListener("appinstalled", onInstalled);

  const onWorkerMessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; url?: string } | null;
    if (data?.type !== "ont-navigate" || !data.url) return;
    window.dispatchEvent(new CustomEvent("ont:navigate", { detail: { url: data.url } }));
  };
  navigator.serviceWorker.addEventListener("message", onWorkerMessage);

  const onControllerChange = () => {
    // The first install can claim an uncontrolled tab; that should not cause an
    // unnecessary reload. Existing installed PWAs should reload immediately when
    // a deploy's new worker takes control.
    if (!hadControllerAtStart || reloadingForController) return;
    if (healTimer) window.clearTimeout(healTimer);
    reloadingForController = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

  const askWorkerToActivate = (worker: ServiceWorker | null) => {
    if (!worker) return;
    try {
      worker.postMessage({ type: "SKIP_WAITING" });
    } catch {
      // A worker can disappear between updatefound and postMessage while a
      // browser is replacing its registration. The next update check retries.
    }
  };

  const watchInstallingWorker = (worker: ServiceWorker | null) => {
    if (!worker) return;
    const onStateChange = () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        askWorkerToActivate(worker);
      }
    };
    worker.addEventListener("statechange", onStateChange);
    onStateChange();
  };

  const onUpdateFound = () => {
    if (!registration?.installing) return;
    watchInstallingWorker(registration.installing);
  };

  const checkForUpdate = async () => {
    if (stopped || document.visibilityState !== "visible" || !registration || checking) return;
    checking = true;

    try {
      // Ask for the newest script before comparing the server stamp. The
      // worker normally activates itself (install uses skipWaiting), while the
      // explicit message also handles browsers that expose a waiting worker.
      await registration.update().catch(() => undefined);
      askWorkerToActivate(registration.waiting);

      let serverBuild: string | undefined;
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        serverBuild = (await response.json())?.id;
      } catch {
        return;
      }

      if (!serverBuild || serverBuild === BUILD_ID) {
        sessionStorage.removeItem(HEAL_KEY);
        return;
      }

      if (sessionStorage.getItem(HEAL_KEY)) return;
      sessionStorage.setItem(HEAL_KEY, serverBuild);

      // Give the normal SW update -> activate -> controllerchange path time to
      // win. If it is wedged, remove every worker/cache and reload from the
      // network so a production deploy cannot remain stuck on an old shell.
      if (healTimer) window.clearTimeout(healTimer);
      healTimer = window.setTimeout(() => void healStaleWorker(), 2000);
    } finally {
      checking = false;
    }
  };

  void navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then((reg) => {
      if (stopped) return;
      registration = reg;
      registration.addEventListener("updatefound", onUpdateFound);
      watchInstallingWorker(registration.installing);
      askWorkerToActivate(registration.waiting);
      void checkForUpdate();
      interval = window.setInterval(() => void checkForUpdate(), 30_000);
    })
    .catch((error) => console.warn("PWA service worker registration failed:", error));

  const onVisibility = () => void checkForUpdate();
  const onFocus = () => void checkForUpdate();
  const onPageShow = () => void checkForUpdate();
  const onOnline = () => void checkForUpdate();

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("online", onOnline);

  return () => {
    stopped = true;
    stopMetrics();
    if (healTimer) window.clearTimeout(healTimer);
    if (interval) window.clearInterval(interval);
    window.removeEventListener("beforeinstallprompt", onInstallPrompt);
    window.removeEventListener("appinstalled", onInstalled);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("online", onOnline);
    registration?.removeEventListener("updatefound", onUpdateFound);
    navigator.serviceWorker.removeEventListener("message", onWorkerMessage);
    navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  };
}
