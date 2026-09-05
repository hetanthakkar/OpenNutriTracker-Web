const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const HEAL_KEY = "ont_sw_healed";

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

function setStandaloneMetrics(): () => void {
  const root = document.documentElement;

  const update = () => {
    const standalone = isStandalone();
    root.dataset.pwaStandalone = standalone ? "true" : "false";
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

  return () => {
    window.removeEventListener("resize", update);
    window.removeEventListener("orientationchange", update);
    window.removeEventListener("appinstalled", update);
  };
}

export function startPwaRuntime(): () => void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return () => {};

  let stopped = false;
  let registration: ServiceWorkerRegistration | null = null;
  let healTimer: number | undefined;
  let interval: number | undefined;
  let reloadingForController = false;
  const hadControllerAtStart = Boolean(navigator.serviceWorker.controller);

  const stopMetrics = setStandaloneMetrics();

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
    reloadingForController = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

  const checkForUpdate = async () => {
    if (stopped || document.visibilityState !== "visible" || !registration) return;

    registration.update().catch(() => {});

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

    // Give the normal SW update -> activate -> controllerchange path time to win.
    // If it is wedged, remove every worker/cache and reload from the network.
    healTimer = window.setTimeout(() => void healStaleWorker(), 5000);
  };

  void navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then((reg) => {
      if (stopped) return;
      registration = reg;
      void checkForUpdate();
      interval = window.setInterval(() => void checkForUpdate(), 60_000);
    })
    .catch((error) => console.warn("PWA service worker registration failed:", error));

  const onVisibility = () => void checkForUpdate();
  const onFocus = () => void checkForUpdate();
  const onPageShow = () => void checkForUpdate();

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pageshow", onPageShow);

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
    navigator.serviceWorker.removeEventListener("message", onWorkerMessage);
    navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  };
}
