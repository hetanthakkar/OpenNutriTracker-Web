import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Pin, Plus, StickyNote, Trash2, X } from "lucide-react";
import { notes as api, type Note, type NoteColor, type NoteInput } from "../api";
import { keys, useQuery } from "../query";
import { useAutoGrow, useViewportRect } from "../ui";

/**
 * The couple's shared sticky-note board. Both partners read and write the same
 * notes; an unpaired user's notes stay private until they pair.
 *
 * Paper colours are literal class strings — Tailwind can't see interpolated
 * names — and every scale used is themed for Midnight in index.css, so the
 * notes stay legible on dark.
 */
const PAPER: Record<NoteColor, string> = {
  amber: "bg-amber-100",
  rose: "bg-rose-100",
  sky: "bg-sky-100",
  emerald: "bg-emerald-100",
  violet: "bg-violet-100",
};
const COLORS = Object.keys(PAPER) as NoteColor[];

const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const today = () => new Date().toISOString().slice(0, 10);

export default function NotesBoard() {
  const { data, loading, set: setItems } = useQuery(keys.notes, api.list);
  const items = data ?? [];
  const [editing, setEditing] = useState<Note | "new" | null>(null);

  const upsert = (n: Note) =>
    setItems((prev = []) => sort(prev.some((p) => p.id === n.id) ? prev.map((p) => (p.id === n.id ? n : p)) : [n, ...prev]));

  return (
    <section className="pb-6">
      <div className="mb-3.5 flex items-center gap-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">Notes</h2>
        <div className="h-px flex-1 bg-gradient-to-r from-stone-200 to-transparent" />
        <button
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1 rounded-full bg-surface border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="h-28 animate-pulse rounded-2xl bg-stone-100" />
          <div className="h-24 animate-pulse rounded-2xl bg-stone-100" />
        </div>
      ) : items.length === 0 ? (
        <button
          onClick={() => setEditing("new")}
          className="flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-rose-200 px-6 py-8 text-center transition active:scale-[0.99]"
        >
          <StickyNote className="mb-2 h-7 w-7 text-rose-300" strokeWidth={1.5} />
          <p className="text-sm font-semibold text-stone-700">Pin your first note</p>
          <p className="mt-0.5 text-xs text-stone-400">Reminders, groceries, anything you both should see.</p>
        </button>
      ) : (
        <div className="columns-2 gap-3 [column-fill:_balance]">
          {items.map((n, i) => (
            <StickyCard key={n.id} note={n} index={i} onOpen={() => setEditing(n)} />
          ))}
        </div>
      )}

      {editing && (
        <NoteEditor
          note={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(n) => {
            upsert(n);
            setEditing(null);
          }}
          onDeleted={(id) => {
            setItems((prev = []) => prev.filter((p) => p.id !== id));
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

/** Server orders by (-pinned, -updated_at); keep the client in step after edits. */
const sort = (list: Note[]) =>
  [...list].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.updated_at) - +new Date(a.updated_at)
  );

function StickyCard({ note, index, onOpen }: { note: Note; index: number; onOpen: () => void }) {
  // Alternating tilt so the board reads hand-pinned rather than a table.
  const tilt = index % 2 === 0 ? "-0.8deg" : "0.9deg";
  const overdue = note.remind_on && note.remind_on <= today();

  // Whether the clamp actually cut anything off. Measured rather than guessed
  // from length: wrapping depends on column width and where the newlines fall.
  const textRef = useRef<HTMLParagraphElement>(null);
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    const measure = () => {
      const el = textRef.current;
      if (el) setTruncated(el.scrollHeight - el.clientHeight > 1);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [note.text]);

  return (
    <button
      onClick={onOpen}
      style={{ transform: `rotate(${tilt})` }}
      className={`sticky-note relative mb-3 block min-h-[6.5rem] w-full break-inside-avoid overflow-hidden rounded-2xl p-4 text-left ${PAPER[note.color]}`}
    >
      {note.pinned && <Pin className="mb-1.5 h-3.5 w-3.5 rotate-45 text-stone-500" />}

      {/* Clamped to keep every note a card, not a wall: a 500-char paste would
          otherwise run ~17 lines in a half-width column. Tap to read it all. */}
      <p
        ref={textRef}
        className="line-clamp-6 whitespace-pre-wrap [overflow-wrap:anywhere] text-[15px] leading-relaxed text-stone-800"
      >
        {note.text}
      </p>
      {truncated && <span className="mt-1 block text-[11px] font-semibold text-stone-500">Read more</span>}

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        {note.remind_on && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              overdue ? "bg-rose-500 text-onaccent" : "bg-black/5 text-stone-600"
            }`}
          >
            <Bell className="h-2.5 w-2.5" /> {fmtDate(note.remind_on)}
          </span>
        )}
        {!note.mine && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
            {note.author_name}
          </span>
        )}
      </div>

      {/* Folded paper corner — theme-agnostic, just a darkening of the paper. */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 h-5 w-5"
        style={{ clipPath: "polygon(100% 0, 0 100%, 100% 100%)", background: "rgba(0,0,0,0.06)" }}
      />
    </button>
  );
}

function NoteEditor({
  note,
  onClose,
  onSaved,
  onDeleted,
}: {
  note: Note | null;
  onClose: () => void;
  onSaved: (n: Note) => void;
  onDeleted: (id: number) => void;
}) {
  const [text, setText] = useState(note?.text ?? "");
  const [color, setColor] = useState<NoteColor>(note?.color ?? "amber");
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [remind, setRemind] = useState(note?.remind_on ?? "");
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const textRef = useAutoGrow(text, { minRows: 4, maxRows: 10 });
  // Keep the sheet above the on-screen keyboard (iOS PWA especially).
  const rect = useViewportRect();

  // iOS PWA ignores `autoFocus` for opening the virtual keyboard — it only
  // respects `.focus()` called inside a rAF after the element has been laid out
  // in the DOM. A plain useEffect fires too early in some WebKit builds; rAF
  // ensures at least one paint frame has passed.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      textRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animated close: set `closing` → play CSS exit animations → unmount.
  const animatedClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    // Match the animation duration in index.css (.animate-overlay-out / .animate-slide-down).
    const timer = setTimeout(onClose, 180);
    return () => clearTimeout(timer);
  }, [closing, onClose]);

  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const body: NoteInput = { text: text.trim(), color, pinned, remind_on: remind || null };
    try {
      onSaved(note ? await api.update(note.id, body) : await api.create(body));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!note || busy) return;
    setBusy(true);
    try {
      await api.remove(note.id);
      onDeleted(note.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    // One fixed overlay whose box runs from the top of the screen to the top of
    // the on-screen keyboard (the visual viewport's bottom edge) — the same
    // shape as the diary editor, which iOS handles reliably because the
    // geometry changes on the fixed element itself, not on a child (iOS skips
    // repositioning absolute children of a fixed blurred parent while the
    // keyboard animates). items-end lands the sheet on the keyboard; the sheet
    // scrolls internally if it's ever taller than what's visible.
    <div
      className={`fixed inset-x-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] ${
        closing ? "animate-overlay-out" : "animate-overlay-in"
      }`}
      style={rect ? { top: 0, height: rect.top + rect.height } : { top: 0, bottom: 0 }}
      onClick={animatedClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`max-h-full w-full max-w-xl overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-2xl ${
          closing ? "animate-slide-down" : "animate-rise-in"
        }`}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-stone-800">{note ? "Edit note" : "New note"}</h3>
          <button onClick={animatedClose} aria-label="Close" className="text-stone-400 active:scale-90">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Grows with a pasted list rather than scrolling it inside four rows,
            up to the point where the sheet would start crowding the screen. */}
        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Buy anniversary gift 🎁"
          className={`w-full resize-none rounded-2xl p-4 text-[15px] leading-relaxed text-stone-800 outline-none placeholder:text-stone-400/70 ${PAPER[color]}`}
        />

        <div className="mt-4 flex items-center gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={c}
              className={`h-8 w-8 rounded-full transition active:scale-90 ${PAPER[c]} ${
                color === c ? "ring-2 ring-stone-800 ring-offset-2 ring-offset-surface" : ""
              }`}
            />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex flex-1 items-center gap-2 rounded-2xl border border-stone-200 px-3 py-2.5">
            <Bell className="h-4 w-4 shrink-0 text-stone-400" />
            <input
              type="date"
              value={remind}
              min={today()}
              onChange={(e) => setRemind(e.target.value)}
              className="w-full bg-transparent text-sm text-stone-800 outline-none"
            />
            {remind && (
              <button onClick={() => setRemind("")} aria-label="Clear reminder" className="text-stone-400">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <button
            onClick={() => setPinned((p) => !p)}
            aria-pressed={pinned}
            aria-label="Pin note"
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border transition active:scale-90 ${
              pinned ? "border-rose-300 bg-rose-50 text-rose-600" : "border-stone-200 text-stone-400"
            }`}
          >
            <Pin className={`h-4 w-4 ${pinned ? "rotate-45" : ""}`} />
          </button>
        </div>

        <div className="mt-5 flex gap-3">
          {note && (
            <button
              onClick={remove}
              disabled={busy}
              aria-label="Delete note"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-stone-200 text-stone-400 transition active:scale-95 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={save}
            disabled={!text.trim() || busy}
            className="flex-1 rounded-2xl bg-rose-600 py-3.5 font-semibold text-onaccent transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? "Saving…" : note ? "Save" : "Pin it"}
          </button>
        </div>
      </div>
    </div>
  );
}

