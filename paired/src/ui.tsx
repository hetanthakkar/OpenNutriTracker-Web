import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes, Dispatch, InputHTMLAttributes, ReactNode, SetStateAction, TextareaHTMLAttributes,
} from "react";
import { Bell, Check, Lock } from "lucide-react";
import { nudge as sendNudge } from "./api";

const NOTCH = "calc(env(safe-area-inset-top) + 0.5rem)";

/**
 * Full-height screen with the notch padded at the top.
 *
 * A `title` or `header` is pinned: it stays put while the content below it
 * scrolls, so a list never carries its own heading off the top of the screen.
 * Sticky rather than a separate scroller — the app scrolls in one container
 * (see App.tsx), and a nested one would fight it for touch drags. The notch
 * padding lives on the pinned bar itself so content slides under the notch,
 * not out from behind it.
 */
export function Screen({
  title,
  header,
  children,
}: {
  title?: string;
  /** Replaces `title` when the pinned bar needs more than a heading (back button, search, filters). */
  header?: ReactNode;
  children: ReactNode;
}) {
  const bar = header ?? (title ? <h1 className="text-2xl font-bold text-stone-800 pt-2 pb-4">{title}</h1> : null);
  return (
    // A full-height column, so a screen can push a footer to the bottom with
    // `mt-auto` even when its content is too short to scroll. `min-h-full`
    // resolves because <main> has a definite height (see App.tsx).
    <div className="max-w-xl mx-auto px-4 flex min-h-full flex-col" style={bar ? undefined : { paddingTop: NOTCH }}>
      {bar && (
        <div
          className="sticky top-0 z-20 -mx-4 shrink-0 bg-pink-50/90 px-4 backdrop-blur-md"
          style={{ paddingTop: NOTCH }}
        >
          {bar}
        </div>
      )}
      {children}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// One back arrow per screen. A host (the Explore/Discuss detail view, a journey
// day) draws a bar with its own back control above an embedded experience; when
// that experience enters a flow with its own back button (a quiz/game runner, a
// journey day), stacking the two reads as two back arrows on one screen. The
// inner flow declares itself with useSoloHeader() and the nearest HostBar hides
// its bar for as long as the flow is mounted — the innermost back control wins.
// HostBars nest: a journey day hides the detail view's bar and provides its own,
// which a runner inside the day hides in turn.
// --------------------------------------------------------------------------- //
const HostBarCtx = createContext<Dispatch<SetStateAction<number>> | null>(null);

export function HostBar({ bar, children }: { bar: ReactNode; children: ReactNode }) {
  // A count, not a boolean, so briefly-overlapping mounts can't flip it early.
  const [solo, setSolo] = useState(0);
  return (
    <HostBarCtx.Provider value={setSolo}>
      {solo === 0 && bar}
      {children}
    </HostBarCtx.Provider>
  );
}

/** While the calling component is mounted, the nearest HostBar hides its bar. */
export function useSoloHeader() {
  const setSolo = useContext(HostBarCtx);
  useEffect(() => {
    if (!setSolo) return;
    setSolo((n) => n + 1);
    return () => setSolo((n) => n - 1);
  }, [setSolo]);
}

/** The brand mark: the app icon's "T" tile, inverted (white tile, black T) so
 *  it reads on the black launch surfaces (splash, auth). */
export function TMark({ box = "h-16 w-16 rounded-[1.3rem]", letter = "text-4xl" }: { box?: string; letter?: string }) {
  return (
    <div aria-hidden className={`${box} grid place-items-center bg-white select-none`}>
      <span className={`${letter} font-black leading-none text-black`}>T</span>
    </div>
  );
}

export function Button({ children, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`w-full rounded-2xl bg-rose-600 text-onaccent font-semibold py-3.5 active:scale-[0.98] transition disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`w-full rounded-2xl bg-surface text-rose-600 border border-rose-200 font-semibold py-3.5 active:scale-[0.98] transition disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={`w-full rounded-2xl border border-stone-200 bg-surface px-4 py-3.5 text-stone-800 outline-none focus:border-rose-400 ${className}`}
    />
  );
}

/**
 * Sizes a textarea to its content, so pasted text keeps the shape it was copied
 * with instead of hiding inside a two-line scroller. Growth stops at `maxRows`
 * — past that the field scrolls, so a long paste can't push the save button of
 * a bottom sheet off the screen.
 *
 * Attach the returned ref to the textarea and pass its current value, which is
 * what re-runs the measurement.
 */
export function useAutoGrow(value: string, { minRows = 2, maxRows = 8 } = {}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 24;
    const chrome =
      parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) +
      parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const min = line * minRows + chrome;
    const max = line * maxRows + chrome;
    // scrollHeight only reports growth, never shrinkage, so it has to be
    // measured against a collapsed field to follow a deletion back down.
    el.style.height = "auto";
    const fit = el.scrollHeight + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = `${Math.min(Math.max(fit, min), max)}px`;
    el.style.overflowY = fit > max ? "auto" : "hidden";
  }, [value, minRows, maxRows]);
  return ref;
}

/** `Input`'s multi-line twin: same chrome, grows with what you type or paste. */
export function Textarea({
  className = "",
  value = "",
  minRows,
  maxRows,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { value?: string; minRows?: number; maxRows?: number }) {
  const ref = useAutoGrow(value, { minRows, maxRows });
  return (
    <textarea
      {...rest}
      ref={ref}
      value={value}
      className={`w-full resize-none rounded-2xl border border-stone-200 bg-surface px-4 py-3.5 leading-relaxed text-stone-800 outline-none focus:border-rose-400 ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-surface shadow-sm border border-rose-50 p-5 ${className}`}>{children}</div>;
}

/**
 * The visual viewport's rectangle (`top`, `height`) within the layout viewport,
 * or `null` on browsers without `visualViewport`.
 *
 * A `position: fixed` bottom sheet is laid out against the *layout* viewport,
 * which the software keyboard doesn't shrink — so the keyboard slides up over
 * the sheet and hides its inputs and buttons (worst in an installed PWA, where
 * there's no browser chrome to give back). Sizing the sheet's overlay to this
 * rect — `style={{ top, height }}` — pins its bottom edge to the visible area,
 * i.e. just above the keyboard, on both iOS and Android.
 *
 * Nudging by a computed keyboard height instead fails on iOS: when it scrolls
 * the page to reveal the focused field, `offsetTop` grows and any inset formula
 * cancels out. Mapping the whole rect sidesteps that.
 */
export function useViewportRect() {
  const [rect, setRect] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setRect({ top: vv.offsetTop, height: vv.height });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return rect;
}

/**
 * Intro hero: a category chip, the title, and the item's illustration bleeding
 * off the bottom-right corner. `decoration` stands in when there's no image.
 */
export function HeroCard({
  label,
  title,
  meta,
  image,
  decoration,
}: {
  label: string;
  title: string;
  meta?: ReactNode;
  image?: string | null;
  decoration?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-rose-100 bg-rose-50 px-5 pb-6 pt-5">
      {!image && decoration}
      <div className="relative z-10 max-w-[62%]">
        <span className="inline-block rounded-full bg-stone-800 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-surface">
          {label}
        </span>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight text-stone-800">{title}</h1>
        {meta && <div className="mt-2 text-sm font-semibold text-rose-600">{meta}</div>}
      </div>
      {image && (
        <img
          src={image}
          alt=""
          aria-hidden
          className="pointer-events-none absolute bottom-0 right-0 w-32 select-none object-contain object-bottom sm:w-40"
        />
      )}
    </div>
  );
}

/** Small circular initials badge. `tone` picks the color pairing. */
export function Avatar({
  name,
  tone = "rose",
  className = "",
}: {
  name: string;
  tone?: "rose" | "stone" | "indigo";
  className?: string;
}) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?";
  const tones = {
    rose: "bg-rose-100 text-rose-600",
    stone: "bg-stone-200 text-stone-600",
    indigo: "bg-indigo-100 text-indigo-600",
  };
  return (
    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${tones[tone]} ${className}`}>
      {initials}
    </span>
  );
}

/** Sends a nudge to the partner and shows transient confirmation. */
export function NudgeButton({ kind, context, className = "" }: { kind: string; context?: unknown; className?: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  // Set when the partner has no push: the nudge landed in their in-app inbox,
  // but it won't reach their phone. Said plainly and once — it's a small thing
  // about how the app is set up, not something they did wrong.
  const [quiet, setQuiet] = useState("");

  const go = async () => {
    setState("sending");
    try {
      const res = await sendNudge({ kind, context });
      setState("sent");
      // Only on an explicit `false`. Telling someone their partner has push off
      // is a claim about another person, so a missing field (an older server, a
      // shape we didn't expect) must stay silent rather than guess wrong.
      setQuiet(
        res.push === false
          ? `${res.to} hasn't turned notifications on yet — it'll be waiting for them in the app.`
          : "",
      );
      setTimeout(() => {
        setState("idle");
        setQuiet("");
      }, 6000);
    } catch {
      setState("idle");
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        onClick={go}
        disabled={state !== "idle"}
        className={`inline-flex items-center gap-1.5 rounded-full bg-surface border border-rose-200 text-rose-600 text-sm font-semibold px-4 py-2 active:scale-95 transition disabled:opacity-70 ${className}`}
      >
        {state === "sent" ? (
          <><Check className="h-4 w-4" /> Nudged</>
        ) : state === "sending" ? (
          "Nudging…"
        ) : (
          <><Bell className="h-4 w-4" /> Nudge partner</>
        )}
      </button>
      {quiet && <span className="text-xs leading-snug text-stone-400 max-w-[16rem]">{quiet}</span>}
    </span>
  );
}

/** Shows that the partner has answered, but keeps their reply blurred/covered
 *  until the viewer answers too. The real text is never sent to the client. */
export function BlurredAnswer({ partnerName }: { partnerName: string }) {
  return (
    <div className="relative mt-3 rounded-2xl overflow-hidden border border-rose-100">
      <p aria-hidden className="text-stone-700 p-4 blur-[6px] select-none leading-relaxed">
        Their heartfelt answer is waiting here for you to read together in a moment or two.
      </p>
      <div className="absolute inset-0 bg-rose-50/60 backdrop-blur-[2px] grid place-items-center text-center px-4">
        <p className="text-sm font-medium text-rose-600">
          <Lock className="inline-block h-4 w-4 mr-1 align-text-bottom" /> {partnerName} has answered.
          <br />
          Answer to reveal theirs.
        </p>
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="grid place-items-center py-12">
      <div className="h-6 w-6 rounded-full border-2 border-rose-200 border-t-rose-500 animate-spin" />
    </div>
  );
}
