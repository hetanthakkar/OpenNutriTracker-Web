import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell, BellOff, ChevronLeft, ChevronRight, Dices, Hand, HeartHandshake, Lightbulb,
  Package, ScrollText, Share, type LucideIcon,
} from "lucide-react";
import { auth as authApi, nudges as nudgesApi, type NudgeTarget } from "../api";
import { useAuth } from "../auth";
import { personalize } from "../personalize";
import { keys, useQuery } from "../query";
import { Button, Card, Screen, Spinner } from "../ui";
import { enableNotifications, pushPermission, type PushPermission } from "../notifications";

/**
 * The nudge inbox.
 *
 * A PWA push can't be trusted to deep-link back into the app — on iOS it may
 * not arrive at all until the user allows notifications. So the nudge itself
 * lives here, behind the bell on the Home header, and the push is only a
 * doorbell for it. That also means a nudge is never lost when the recipient
 * hasn't turned notifications on: it's waiting for them the next time they open
 * the app.
 */

const KINDS: Record<string, { label: string; Icon: LucideIcon }> = {
  daily: { label: "Today's question", Icon: HeartHandshake },
  tip: { label: "Tip", Icon: Lightbulb },
  quiz: { label: "Quiz", Icon: ScrollText },
  game: { label: "Game", Icon: Dices },
  pack: { label: "Pack", Icon: Package },
  general: { label: "Nudge", Icon: Hand },
};

const kindOf = (kind: string) => KINDS[kind] ?? KINDS.general;

/** "just now" / "4h ago" / "Mar 3" — nudges are short-lived, so recency is what matters. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 7 * 24 * 60) return `${Math.floor(mins / (24 * 60))}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The device's push permission, rechecked whenever the app regains focus —
 *  the user may have changed it in browser settings while we were backgrounded. */
export function usePushPermission(): [PushPermission, () => void] {
  const [state, setState] = useState<PushPermission>(pushPermission);
  const sync = useCallback(() => setState(pushPermission()), []);
  useEffect(() => {
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [sync]);
  return [state, sync];
}

/**
 * The header bell. Greyed out until notifications are on — but always tappable:
 * the inbox behind it is where a user without push finds their nudges, and
 * where they're offered the chance to turn push on.
 */
export function NotificationBell({ onOpen }: { onOpen: () => void }) {
  const [permission] = usePushPermission();
  const { me } = useAuth();
  // Short stale time: the badge is the only sign of a nudge for a user without
  // push, so it should be right the moment they look at the screen.
  const { data } = useQuery(keys.nudges, nudgesApi.inbox, { staleTime: 10_000 });
  const unread = data?.unread ?? 0;
  // Two different ways to be unreachable — the browser never allowed push, or
  // they silenced nudges in Settings. Either one greys the bell, because either
  // one means a nudge won't reach their phone.
  const on = permission === "granted" && me?.notif_prefs?.nudges !== false;

  return (
    <button
      onClick={onOpen}
      aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
      className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full border transition active:scale-90 ${
        on ? "border-rose-100 bg-surface text-rose-500" : "border-stone-200 bg-stone-100 text-stone-400"
      }`}
    >
      {on ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-rose-600 px-1 text-[11px] font-bold leading-none text-onaccent">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

export default function NotificationsScreen({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  /** Open the content item a nudge points at (Home owns the detail views). */
  onOpen: (target: NudgeTarget) => void;
}) {
  const [permission, syncPermission] = usePushPermission();
  const { me, refresh } = useAuth();
  const { data, loading, set } = useQuery(keys.nudges, nudgesApi.inbox, { staleTime: 10_000 });
  const [enabling, setEnabling] = useState(false);
  const [message, setMessage] = useState("");
  const muted = permission === "granted" && me?.notif_prefs?.nudges === false;

  // Opening the inbox *is* reading it. The rows that were unread on arrival
  // stay highlighted for this visit — the badge clears, the "new" marks don't
  // vanish under the user's eyes.
  const wasUnread = useRef<Set<number> | null>(null);
  const items = data?.items;
  useEffect(() => {
    if (!items || wasUnread.current) return;
    wasUnread.current = new Set(items.filter((n) => !n.read).map((n) => n.id));
    if (wasUnread.current.size === 0) return;
    nudgesApi
      .markRead()
      .then(() => set((prev) => ({
        unread: 0,
        items: (prev?.items ?? []).map((n) => ({ ...n, read: true })),
      })))
      .catch(() => {});
  }, [items, set]);

  const turnOn = async () => {
    setEnabling(true);
    const result = await enableNotifications();
    syncPermission();
    setMessage(result);
    setEnabling(false);
  };

  /** Permission is granted but nudges were silenced in Settings — just flip the
   *  category back on rather than sending them off to another tab. */
  const unmute = async () => {
    setEnabling(true);
    try {
      await authApi.updateMe({ notif_prefs: { nudges: true } });
      await refresh();
    } finally {
      setEnabling(false);
    }
  };

  return (
    <Screen
      header={
        <div className="flex items-center gap-3 pt-2 pb-3">
          <button onClick={onBack} aria-label="Back" className="text-rose-600">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="flex items-center gap-2 text-xl font-bold text-stone-800">
            <Bell className="h-5 w-5 text-rose-500" /> Notifications
          </h1>
        </div>
      }
    >
      {permission !== "granted" ? (
        <PermissionCard
          permission={permission}
          busy={enabling}
          message={message}
          onEnable={turnOn}
        />
      ) : muted ? (
        <Card className="mb-4 border-rose-100 bg-rose-50/60">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-500">
              <BellOff className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-stone-800">Nudge alerts are off</div>
              <p className="mt-1 text-sm text-stone-500">
                Nudges still arrive on this screen, but they won't reach your phone until you turn them back on.
              </p>
            </div>
          </div>
          <Button onClick={unmute} disabled={enabling} className="mt-4">
            {enabling ? "Turning on…" : "Turn nudges back on"}
          </Button>
        </Card>
      ) : null}

      {loading ? (
        <Spinner />
      ) : (data?.items ?? []).length === 0 ? (
        <p className="mt-10 px-6 text-center text-stone-400">
          No nudges yet. When your partner nudges you, it'll land here.
        </p>
      ) : (
        <div className="space-y-2 pb-6">
          {(data?.items ?? []).map((n) => {
            const { label, Icon } = kindOf(n.kind);
            const fresh = wasUnread.current?.has(n.id);
            const target = n.target;

            const row = (
              <Card
                className={`flex items-start gap-3 !p-4 ${fresh ? "border-rose-200 bg-rose-50/60" : ""} ${
                  target ? "transition active:scale-[0.99]" : ""
                }`}
              >
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                    fresh ? "bg-rose-500 text-onaccent" : "bg-rose-50 text-rose-500"
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium leading-snug text-stone-800">
                    {n.from_name} nudged you
                  </div>
                  <p className="mt-0.5 break-words text-sm text-stone-500">{n.text}</p>
                  {/* The item itself, when the nudge was about one — this is the
                      link, so name it rather than making them guess. */}
                  {target?.title && (
                    <div className="mt-1.5 flex items-center gap-1 text-sm font-medium text-rose-600">
                      <span className="truncate">
                        {target.day ? `Day ${target.day} · ` : ""}
                        {personalize(target.title, me?.partner?.display_name)}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    </div>
                  )}
                  <div className="mt-1 text-xs text-stone-400">
                    {label} · {timeAgo(n.created_at)}
                  </div>
                </div>
                {fresh && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-500" />}
              </Card>
            );

            // A "thinking of you" nudge points at nothing, so it stays inert
            // rather than being a button that goes nowhere.
            return target ? (
              <button key={n.id} onClick={() => onOpen(target)} className="w-full text-left">
                {row}
              </button>
            ) : (
              <div key={n.id}>{row}</div>
            );
          })}
        </div>
      )}
    </Screen>
  );
}

/** Every way push can be off — each gets its own copy, since the way out differs. */
type OffPermission = Exclude<PushPermission, "granted">;

/** What the screen says when push is off — one card, one thing to do. */
function PermissionCard({
  permission,
  busy,
  message,
  onEnable,
}: {
  permission: OffPermission;
  busy: boolean;
  message: string;
  onEnable: () => void;
}) {
  const copy: Record<OffPermission, { title: string; body: string }> = {
    prompt: {
      title: "Allow notifications first",
      body: "Nudges will still wait for you here, but you'll only hear about them when you open the app. Turn notifications on and your partner can reach you right away.",
    },
    blocked: {
      title: "Notifications are blocked",
      body: "Your browser is turned off for Together. Allow notifications for this site in your browser settings, then come back — nudges keep landing here in the meantime.",
    },
    install: {
      title: "Add Together to your Home Screen",
      body: "On iPhone, notifications only work once Together is installed: tap Share, then \"Add to Home Screen\", and open it from there to turn them on.",
    },
    unsupported: {
      title: "Notifications aren't available here",
      body: "This browser can't do push. Your nudges still land on this screen whenever you open Together.",
    },
  };
  const { title, body } = copy[permission];

  return (
    <Card className="mb-4 border-rose-100 bg-rose-50/60">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-500">
          {permission === "install" ? <Share className="h-4.5 w-4.5" /> : <BellOff className="h-4.5 w-4.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-stone-800">{title}</div>
          <p className="mt-1 text-sm text-stone-500">{body}</p>
        </div>
      </div>
      {permission === "prompt" && (
        <Button onClick={onEnable} disabled={busy} className="mt-4">
          {busy ? "Turning on…" : "Allow notifications"}
        </Button>
      )}
      {message && <p className="mt-2 text-xs text-stone-400">{message}</p>}
    </Card>
  );
}
