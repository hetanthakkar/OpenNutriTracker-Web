import { useEffect, useRef, useState } from "react";
import { Home, Target, MessageCircle, Users, type LucideIcon } from "lucide-react";
import { useAuth } from "./auth";
import { syncPushToken } from "./notifications";
// `Target` here is the lucide icon; the navigation one is aliased to avoid it.
import { consumeInitialTarget, onNavigate, type Target as NavTarget } from "./navigation";
import { initialTab, setTabPath, TAB_PATH } from "./router";
import { TMark } from "./ui";
import AuthScreen from "./screens/AuthScreen";
import { MainScreen, ActivitiesScreen } from "./screens/ExploreScreen";
import ProfileScreen from "./screens/ProfileScreen";
import DiscussScreen from "./screens/DiscussScreen";
import InstallPrompt from "./screens/InstallPrompt";

type Tab = "main" | "activities" | "discuss" | "profile";

export default function App() {
  const { me, loading } = useAuth();
  // In a browser tab the path names the tab (/activities, /us, …); the screens
  // below restore the deeper parts of the URL themselves (see router.ts).
  const [tab, setTab] = useState<Tab>(initialTab);
  // The Home-tab destination a notification asked for, with a counter attached.
  // The counter is what makes a *repeat* tap work: re-opening the same nudge
  // after backing out would otherwise set an identical value and change nothing.
  const [pending, setPending] = useState<{ nonce: number; target: NavTarget } | null>(null);
  // Bumped to remount the active screen. Screens push their detail views into
  // local state rather than a router, so there's nothing for App to pop — but
  // discarding that state lands them back at their root, which is what a tab
  // press means.
  const [root, setRoot] = useState(0);
  const scroller = useRef<HTMLElement>(null);

  /**
   * A tab press always goes somewhere: to another tab, or — when you're already
   * on it, several screens deep — back to that tab's root. Pressing the current
   * tab used to be a no-op, leaving you stuck in a detail view with a nav bar
   * that appeared to ignore you.
   */
  const selectTab = (next: Tab) => {
    // A deliberate tab press abandons whatever a notification asked for.
    // Otherwise the target would still be sitting here on the way back and
    // would silently re-open the item the user just navigated away from.
    setPending(null);
    if (next === tab) setRoot((n) => n + 1);
    else setTab(next);
    // The scroller is shared by every screen, so it keeps the offset from the
    // one we just left — without this you arrive at a fresh screen halfway down.
    scroller.current?.scrollTo({ top: 0 });
  };

  // Refresh this device's push token whenever a session lands. FCM rotates
  // tokens and the server prunes dead ones, so a device that registered only at
  // opt-in drifts into having permission but no token on file — pushes stop,
  // and their partner gets told they never turned notifications on.
  const username = me?.username;
  useEffect(() => {
    if (username) void syncPushToken();
  }, [username]);

  // Keep the address bar naming the tab (invisible installed, but the entry it
  // rewrites is the root the system back gesture unwinds to).
  useEffect(() => {
    setTabPath(TAB_PATH[tab]);
  }, [tab]);

  // A tapped notification names the screen it's about — from the URL when the
  // app was closed, or over postMessage from the service worker when it was
  // already open.
  useEffect(() => {
    const go = (target: NavTarget) => {
      if (target.screen === "discuss") setTab("discuss");
      else if (target.screen === "us") setTab("profile");
      else {
        // The inbox and every content item live under Home — it owns the
        // detail views — so switch there and hand the target down.
        setTab("main");
        setPending((prev) => ({ nonce: (prev?.nonce ?? 0) + 1, target }));
      }
    };
    const stop = onNavigate(go);
    const initial = consumeInitialTarget();
    if (initial) go(initial);
    return stop;
  }, []);

  if (loading) {
    return (
      <div
        className="fixed inset-x-0 top-0 grid place-items-center bg-black"
        style={{ height: "var(--app-height, 100dvh)" }}
      >
        <div className="animate-pulse flex flex-col items-center gap-4">
          <TMark />
          <div className="text-white text-lg font-semibold">Together</div>
        </div>
      </div>
    );
  }

  if (!me) return <AuthScreen />;

  // Unpaired users still get the full app: they can browse Main and Topics,
  // and pair from the Us tab. The comparison features (Discuss) light up
  // automatically once a partner joins.
  return (
    // Height comes from --app-height (set in index.html for the installed PWA,
    // where the viewport height is unreliable at launch); browsers fall back to
    // 100dvh. Anchor to the top: the screen top is trustworthy, the bottom isn't.
    // Take whichever of the two is *taller*: --app-height can itself read short
    // on a cold launch, and coming up short leaves the nav floating above the
    // bottom edge with a strip of backstop under it.
    <div
      className="fixed inset-x-0 top-0 bg-pink-50 flex flex-col overflow-hidden"
      style={{ height: "max(var(--app-height, 0px), 100dvh)" }}
    >
      {/* Scrollbar is left visible: once a screen overflows (the Home board can
          grow with notes) the user needs to see there's more below.
          The nav sits *outside* the scroller, as its own flex row. It used to be
          a sticky child inside it, so that a drag landing on the tab bar would
          still scroll the content behind it — but a sticky footer is still in
          the scroll flow, and it drifts with iOS rubber-banding. Out here it
          cannot move at all. The cost is that dragging on the tab bar no longer
          scrolls; that's the usual behaviour for a tab bar, and worth it. */}
      {/* `root` remounts the active screen, which is how a tab press unwinds
          whatever detail view it had pushed. Each screen owns its own stack in
          local state, so throwing that state away *is* going back to its root. */}
      <main ref={scroller} className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain thin-scrollbar">
        {tab === "main" && <MainScreen key={root} pending={pending} />}
        {tab === "activities" && <ActivitiesScreen key={root} />}
        {tab === "discuss" && <DiscussScreen key={root} />}
        {tab === "profile" && <ProfileScreen key={root} />}
      </main>
      {/* Browser visitors only — it returns null once the app is installed.
          Outside the scroller, like the nav, so it can't drift with rubber-banding. */}
      <InstallPrompt />
      <BottomNav tab={tab} onChange={selectTab} />
    </div>
  );
}

function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items: { key: Tab; label: string; Icon: LucideIcon }[] = [
    { key: "main", label: "Home", Icon: Home },
    { key: "discuss", label: "Discuss", Icon: MessageCircle },
    { key: "activities", label: "Topics", Icon: Target },
    { key: "profile", label: "Us", Icon: Users },
  ];
  return (
    // Its own row below the scroller, so content settles above it rather than
    // under it, and it never participates in the scroll.
    <nav
      className="shrink-0 z-10 bg-surface border-t border-rose-100 flex justify-around"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onChange(it.key)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
            tab === it.key ? "text-rose-600" : "text-stone-400"
          }`}
        >
          <it.Icon className="h-5 w-5" strokeWidth={tab === it.key ? 2.4 : 2} />
          {it.label}
        </button>
      ))}
    </nav>
  );
}
