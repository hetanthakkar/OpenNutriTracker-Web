import { useCallback, useEffect, useReducer, useRef, useState } from "react";

/**
 * A tiny stale-while-revalidate cache for the read endpoints in `api.ts`.
 *
 * The screens are unmounted whenever the user switches tabs or opens a detail
 * view, so a plain `useEffect(() => fetch().then(setState), [])` means a
 * spinner and a round trip every time they come back. Here the cached value is
 * painted immediately and the refetch happens behind it, so a return visit is
 * instant but never shows data the server has since changed.
 *
 * Freshness matters for most of what this app fetches — whether the partner
 * has answered flips underneath us — so entries revalidate on mount once they
 * pass `staleTime`, and `refetch()` always goes to the network.
 *
 * Only GETs belong here. A POST that mints something (pairing codes, shuffles)
 * must not be replayed from cache.
 */

const cache = new Map<string, unknown>();
const fetchedAt = new Map<string, number>();
const inflight = new Map<string, Promise<unknown>>();
/**
 * `refill` distinguishes the two reasons a key changes. A *write* (fetch
 * landed, optimistic edit) hands mounted readers a value, so they only repaint.
 * A *drop* (`invalidate`) leaves them with nothing, so they must also refetch
 * or they would spin forever. Repainting on a write must never refetch, or a
 * `staleTime: 0` query would fetch, write, notify, and fetch again for ever.
 */
type Listener = (refill: boolean) => void;
const listeners = new Map<string, Set<Listener>>();

const DEFAULT_STALE_TIME = 30_000;

/**
 * Every mounted query that is willing to be revalidated on focus. The partner
 * can change any of this from their own phone while our tab sits in the
 * background, so coming back to the app is the one moment we always recheck —
 * `staleTime` does not get a vote. Entries with an infinite `staleTime` (static
 * content bodies) opt out.
 */
const onFocus = new Set<() => void>();

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") onFocus.forEach((fn) => fn());
  });
}

function notify(key: string, refill = false) {
  listeners.get(key)?.forEach((fn) => fn(refill));
}

function subscribe(key: string, fn: Listener) {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) listeners.delete(key);
  };
}

/** Write a value straight into the cache and repaint every reader of `key`. */
export function setCache<T>(key: string, value: T) {
  cache.set(key, value);
  fetchedAt.set(key, Date.now());
  notify(key);
}

/**
 * Drop `key` and any `key:*` children so the next read refetches. Mounted
 * readers repaint from the network; unmounted ones simply miss on next mount.
 */
export function invalidate(prefix: string) {
  for (const key of [...cache.keys()]) {
    if (key === prefix || key.startsWith(`${prefix}:`)) {
      cache.delete(key);
      fetchedAt.delete(key);
      notify(key, true);
    }
  }
}

/**
 * Wipe everything, without refetching. Called when the session itself changes —
 * logout, pairing, unpairing — where a mounted screen refetching immediately
 * would either 401 or ask as the wrong person. The screens that survive will
 * refill on their next mount.
 */
export function clearCache() {
  const keys = [...cache.keys()];
  cache.clear();
  fetchedAt.clear();
  inflight.clear();
  keys.forEach((key) => notify(key, false));
}

/** Collapse concurrent reads of the same key onto one request. */
function fetchOnce<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const p = fetcher().then(
    (value) => {
      inflight.delete(key);
      setCache(key, value);
      return value;
    },
    (err) => {
      inflight.delete(key);
      throw err;
    },
  );
  inflight.set(key, p);
  return p;
}

export interface QueryResult<T> {
  data: T | undefined;
  /** True only when there is nothing to paint yet — a cache hit never spins. */
  loading: boolean;
  error: unknown;
  /** Always hits the network, ignoring `staleTime`. */
  refetch: () => void;
  /** Write through to the cache, for optimistic local edits. */
  set: (next: T | ((prev: T | undefined) => T)) => void;
}

/**
 * Read `key`, fetching if it is missing or stale. Pass `key: null` to hold off
 * entirely (a section that has not been expanded yet, say).
 *
 * `loading` is derived from the absence of both data and error rather than
 * tracked separately, which assumes no endpoint here resolves to `undefined` —
 * they all return an object or an array.
 */
export function useQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts: { staleTime?: number } = {},
): QueryResult<T> {
  const { staleTime = DEFAULT_STALE_TIME } = opts;
  const [, repaint] = useReducer((n: number) => n + 1, 0);
  const [error, setError] = useState<unknown>(null);

  // Read through a ref: the fetcher is usually an inline closure, and we do not
  // want a new identity on every render to retrigger the request.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(
    (force: boolean) => {
      if (key === null) return;
      const at = fetchedAt.get(key);
      const fresh = at !== undefined && Date.now() - at < staleTime;
      if (!force && cache.has(key) && fresh) return;

      setError(null);
      fetchOnce(key, fetcherRef.current).catch(setError);
    },
    [key, staleTime],
  );

  // Repaint on any change to this key, and refill it when `invalidate` emptied
  // it — otherwise a mounted screen would sit on a spinner forever waiting for
  // data nobody is fetching.
  const sync = useCallback(
    (refill: boolean) => {
      repaint();
      if (refill) run(true);
    },
    [run],
  );

  useEffect(() => (key === null ? undefined : subscribe(key, sync)), [key, sync]);

  useEffect(() => run(false), [run]);

  // Stable, so callers can safely list it in an effect's deps.
  const refetch = useCallback(() => run(true), [run]);

  useEffect(() => {
    if (key === null || !Number.isFinite(staleTime)) return;
    onFocus.add(refetch);
    return () => void onFocus.delete(refetch);
  }, [key, staleTime, refetch]);

  const data = key === null ? undefined : (cache.get(key) as T | undefined);
  const set = useCallback(
    (next: T | ((prev: T | undefined) => T)) => {
      if (key === null) return;
      const prev = cache.get(key) as T | undefined;
      setCache(key, typeof next === "function" ? (next as (p: T | undefined) => T)(prev) : next);
    },
    [key],
  );

  // A held-off query (`key: null`) is not loading — it was never going to fetch.
  const loading = key !== null && data === undefined && error === null;
  return { data, loading, error, refetch, set };
}

// --------------------------------------------------------------------------- //
// Key builders — one place, so two callers asking for the same rows collide in
// the cache instead of each fetching their own copy.
// --------------------------------------------------------------------------- //

/** Undefined and empty params are dropped, so `{page:1}` and `{page:1,search:""}` agree. */
export function contentKey(collection: string, params: Record<string, string | number | undefined> = {}) {
  const clean = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `content:${collection}${clean ? `:${clean}` : ""}`;
}

export const keys = {
  daily: "daily",
  activity: "activity",
  categories: "categories",
  notes: "notes",
  facts: "facts",
  diary: (date: string) => `diary:${date}`,
  diarySummary: (start: string, end: string) => `diary-summary:${start}:${end}`,
  nudges: "nudges",
  shiftSchedule: "shift-schedule",
  bookmarks: "bookmarks",
  bookmark: (ct: string, id: string) => `bookmark:${ct}:${id}`,
  detail: (collection: string, id: string) => `detail:${collection}:${id}`,
  answer: (ct: string, id: string) => `answer:${ct}:${id}`,
  journeyState: (id: string) => `journey-state:${id}`,
};
