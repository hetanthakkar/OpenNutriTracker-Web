import { useEffect, useRef } from "react";

/**
 * History-backed navigation: real URLs, and back gestures that close screens.
 *
 * The app keeps every screen in component state (see App.tsx) — nothing here
 * changes that. But each "pushed" screen (a list, a detail view, a journey
 * day, a quiz run) occupies one history entry while it's open: opening it
 * pushes the entry, going back exits the screen, and exiting in-app pops the
 * entry to keep history in step.
 *
 * In a browser tab that serves the address bar, shareable links, and the back
 * button. The installed PWA used to skip all of it (no address bar to serve) —
 * but the history stack is also what the *system* back gestures act on: iOS's
 * left-edge swipe (standalone PWAs since iOS 12.2) and Android's back
 * gesture/button both call history.back(). Keeping the stack alive installed
 * is what makes swipe-back work there; the URL writing is simply invisible.
 *
 * Bookkeeping note: history mutations are asynchronous (`history.go()` lands
 * on a later popstate), so the module keeps its own `stack` as the source of
 * truth and reconciles the real history against it — removals are batched per
 * microtask into one `go(-k)`, pushes made while a pop is in flight are
 * deferred until it lands, and a tab's base URL is applied only once the
 * stack has drained.
 */
const enabled = typeof window !== "undefined";

// ---- URL scheme -------------------------------------------------------------
export type TabKey = "main" | "activities" | "discuss" | "profile";
export const TAB_PATH: Record<TabKey, string> = {
  main: "/",
  activities: "/activities",
  discuss: "/discuss",
  profile: "/us",
};
// Mirrors ExploreScreen's collections; kept local for the same reason
// navigation.ts keeps its own list — importing would drag a screen in here.
const COLLECTIONS = ["questions", "packs", "journeys", "quizzes", "games", "tips"];

/** What a pathname asks the app to open. */
export interface BootRoute {
  tab: TabKey;
  /** /quizzes → the collection list; /quizzes/<id> → that item. */
  collection?: string;
  id?: string;
  /** /journeys/<id>?day=3 → straight to the day. */
  day?: number;
  /** /activities/<name> → that category. */
  category?: string;
  /** /saved → the bookmarks list (lives under Discuss). */
  saved?: boolean;
  /** /notifications → the inbox (lives under Home). */
  notifications?: boolean;
}

function parse(path: string, search: URLSearchParams): BootRoute {
  const seg = path.split("/").filter(Boolean);
  if (seg[0] === "activities")
    return { tab: "activities", ...(seg[1] ? { category: decodeURIComponent(seg[1]) } : {}) };
  if (seg[0] === "discuss") return { tab: "discuss" };
  if (seg[0] === "saved") return { tab: "discuss", saved: true };
  // /workday lives under the "Us" tab. Only the tab is restored, not the screen
  // — it's a settings form, not something worth deep-linking into.
  if (seg[0] === "us" || seg[0] === "workday") return { tab: "profile" };
  if (seg[0] === "notifications") return { tab: "main", notifications: true };
  if (seg[0] && COLLECTIONS.includes(seg[0])) {
    const day = Number(search.get("day"));
    return {
      tab: "main",
      collection: seg[0],
      ...(seg[1] ? { id: seg[1] } : {}),
      ...(Number.isInteger(day) && day > 0 ? { day } : {}),
    };
  }
  return { tab: "main" };
}

let boot: BootRoute | null = enabled
  ? parse(location.pathname, new URLSearchParams(location.search))
  : null;

// The loaded history entry becomes the tab root: the deeper parts of the path
// are re-pushed as real entries by the screens that restore them, so a shared
// link unwinds under the back button exactly like lived navigation would.
if (enabled && boot && location.pathname !== TAB_PATH[boot.tab]) {
  history.replaceState(null, "", TAB_PATH[boot.tab] + location.search);
}

/** The tab the page was opened on. Safe to read any time. */
export const initialTab: TabKey = boot?.tab ?? "main";

/**
 * The route the page was opened with — stable through a screen's first render
 * (so state initializers can read it), cleared after mount so remounts (tab
 * re-press, tab return) start from the screen's root.
 */
export function useBootRoute(): BootRoute | null {
  const r = useRef<BootRoute | null | undefined>(undefined);
  if (r.current === undefined) r.current = boot;
  useEffect(() => {
    boot = null;
  }, []);
  return r.current;
}

// ---- History stack ------------------------------------------------------------
interface Entry {
  /** URL shown while this screen is open; undefined keeps the current one. */
  url?: string;
  onExit: () => void;
  dead?: boolean;
}

let stack: Entry[] = [];
let deferred: Entry[] = []; // pushed while a pop was in flight
let pendingPops = 0; // history.go() calls of ours that haven't landed yet
let pendingBase: string | null = null; // tab URL to apply once the stack drains
let flushQueued = false;

const live = () => stack.filter((e) => !e.dead);

function drainIfEmpty() {
  if (pendingPops === 0 && live().length === 0 && pendingBase !== null) {
    history.replaceState(null, "", pendingBase);
    pendingBase = null;
  }
}

/** Apply pushes that had to wait for the history to catch up. */
function applyDeferred() {
  for (const e of deferred) {
    if (e.dead || !stack.includes(e)) continue; // closed again before it landed
    history.pushState({ d: live().indexOf(e) + 1 }, "", e.url);
  }
  deferred = [];
  drainIfEmpty();
}

/** Collect this tick's removals into one history.go(-k). */
function scheduleFlush() {
  if (flushQueued) return;
  flushQueued = true;
  queueMicrotask(() => {
    flushQueued = false;
    const k = stack.filter((e) => e.dead).length;
    stack = live();
    if (k > 0) {
      pendingPops += 1;
      history.go(-k);
    } else {
      applyDeferred();
    }
  });
}

function push(e: Entry) {
  stack.push(e);
  // Mid-pop the real history is behind the logical stack — pushing now would
  // put this entry where the pop is about to land. Park it until then.
  if (pendingPops || flushQueued) deferred.push(e);
  else history.pushState({ d: live().length }, "", e.url);
}

function remove(e: Entry) {
  if (e.dead || !stack.includes(e)) return;
  e.dead = true;
  scheduleFlush();
}

if (enabled) {
  window.addEventListener("popstate", (ev) => {
    // A pop we caused (in-app back, screens unmounting) — history caught up.
    if (pendingPops > 0) {
      pendingPops -= 1;
      if (pendingPops === 0) applyDeferred();
      return;
    }
    const d = (ev.state as { d?: number } | null)?.d ?? 0;
    const open = live();
    if (d > open.length) {
      // Forward button. The screens it pointed at kept no state to restore,
      // so bounce straight back.
      pendingPops += 1;
      history.go(open.length - d);
      return;
    }
    // The user went back (possibly several entries at once via the back-button
    // menu): exit every screen above the depth we landed on.
    while (stack.length > 0 && live().length > d) {
      const top = stack.pop()!;
      if (!top.dead) top.onExit();
    }
  });
}

/** The current tab's root URL. Applied once no screen entries sit above it. */
export function setTabPath(url: string) {
  if (!enabled) return;
  if (pendingPops === 0 && !flushQueued && live().length === 0) {
    history.replaceState(null, "", url);
  } else {
    pendingBase = url;
  }
}

/**
 * While `open` is true, this screen occupies one browser-history entry showing
 * `url`: browser-back calls `onExit`, and closing the screen in-app pops the
 * entry. Installed, the same entry is what the system back gesture pops.
 */
export function useScreenEntry(open: boolean, url: string | undefined, onExit: () => void) {
  const exit = useRef(onExit);
  exit.current = onExit;
  const entry = useRef<Entry | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (open && !entry.current) {
      const e: Entry = {
        url,
        onExit: () => {
          entry.current = null;
          exit.current();
        },
      };
      entry.current = e;
      push(e);
    } else if (!open && entry.current) {
      const e = entry.current;
      entry.current = null;
      remove(e);
    }
    // `url` is captured when the screen opens; it doesn't change while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(
    () => () => {
      if (entry.current) {
        remove(entry.current);
        entry.current = null;
      }
    },
    [],
  );
}
