/**
 * Install-to-home-screen support.
 *
 * Two worlds, and they're not close to equal:
 *
 * - Chromium (Android, desktop): fires `beforeinstallprompt` when it considers
 *   the app installable. Cancel it, hold onto it, and `prompt()` it later from
 *   a user gesture — a real one-tap install sheet.
 * - iOS Safari: no such event, and no API to open the install sheet. Apple only
 *   allows Share → Add to Home Screen, by hand. All we can do is *say so*.
 *
 * The event fires before React mounts, so it has to be captured at module load
 * (see main.tsx) or it's gone.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const SNOOZE_KEY = "paired_install_snoozed";
const SNOOZE_DAYS = 14;

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((fn) => fn());

/** Subscribe to "can we offer a one-tap install right now?" changing. */
export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const canPrompt = () => deferred !== null;

/** Already installed — running from the home screen rather than a browser tab. */
export function isInstalled(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS marks its home-screen apps here instead of via display-mode.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac; the touch points give it away.
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

/** Dismissed recently? Asking again the next morning is how a banner becomes spam. */
export function isSnoozed(): boolean {
  const at = Number(localStorage.getItem(SNOOZE_KEY));
  if (!at) return false;
  return Date.now() - at < SNOOZE_DAYS * 86_400_000;
}

export function snooze(): void {
  localStorage.setItem(SNOOZE_KEY, String(Date.now()));
}

/** Open the browser's install sheet. Must be called from a user gesture. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  // A prompt can only be used once, and it's spent whichever way the user goes.
  deferred = null;
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === "accepted";
}

export function listenForInstall(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // stop Chrome's own mini-infobar; we ask in our own words
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    snooze(); // installed — never nag in the tab they left open
    notify();
  });
}
