/**
 * Where a tapped notification wants to take us.
 *
 * There are two ways in, because a push can be tapped in two very different
 * states, and the service worker (see `firebase-messaging-sw.js`) handles each:
 *
 *   app closed — it opens "/?screen=…", and we read that off the URL at boot.
 *   app open   — it postMessages the same URL, and we route in memory. No
 *                navigation, which is what makes this work on iOS, where
 *                `WindowClient.navigate` tends to land on the start page.
 *
 * Both funnel into one `Target` so App has a single thing to react to.
 */

/** Mirrors the API's singular content types. Kept local rather than imported
 *  from ExploreScreen, which would drag a screen's worth of React into the
 *  module the service worker path depends on. */
const CONTENT_TYPES = ["question", "pack", "journey", "quiz", "game", "tip"];

export type Target =
  | { screen: "notifications" }
  | { screen: "discuss" }
  | { screen: "us" }
  | { screen: "home" }
  /** A specific piece of content — what a nudge is usually *about*.
   *  `day` is set when it's a journey, so we land on the day, not the overview. */
  | { screen: "item"; contentType: string; objectId: string; day?: number };

/** Parse "/?screen=item&type=question&id=abc" (or any URL carrying a target). */
function targetFromUrl(url: string): Target | null {
  let params: URLSearchParams;
  try {
    params = new URL(url, location.origin).searchParams;
  } catch {
    return null;
  }

  switch (params.get("screen")) {
    case "notifications":
      return { screen: "notifications" };
    case "discuss":
      return { screen: "discuss" };
    case "us":
      return { screen: "us" };
    case "home":
      return { screen: "home" };
    case "item": {
      const contentType = params.get("type");
      const objectId = params.get("id");
      // An unknown type would route to a collection that doesn't exist and
      // leave the user on a blank screen — better to ignore the link entirely.
      if (!contentType || !objectId || !CONTENT_TYPES.includes(contentType)) return null;
      const day = Number(params.get("day"));
      return {
        screen: "item",
        contentType,
        objectId,
        ...(Number.isInteger(day) && day > 0 ? { day } : {}),
      };
    }
    default:
      return null;
  }
}

const listeners = new Set<(t: Target) => void>();

export function onNavigate(fn: (t: Target) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as { type?: string; url?: string } | null;
    if (data?.type !== "paired-navigate" || !data.url) return;
    const target = targetFromUrl(data.url);
    if (target) listeners.forEach((fn) => fn(target));
  });
}

/**
 * The target this page was opened with, if any — read once, then scrubbed from
 * the address bar so a reload (or an "add to home screen" from here) doesn't
 * strand the user on a screen they were only passing through.
 */
export function consumeInitialTarget(): Target | null {
  const target = targetFromUrl(location.href);
  if (target) history.replaceState(null, "", location.pathname);
  return target;
}
