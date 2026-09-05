import { useState } from "react";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Flame, Plus, Trash2, Utensils, X } from "lucide-react";
import { diary as api, type DiaryEntry, type DiaryInput, type DiaryKind } from "../api";
import { useAuth } from "../auth";
import { invalidate, keys, useQuery } from "../query";
import { Avatar, Input, Screen, Spinner, useViewportRect } from "../ui";

/**
 * NOT REACHABLE FROM THE UI. The whole food/movement/calorie feature is switched
 * off: ExploreScreen no longer imports this screen and the Home card that opened
 * it is commented out, as are the Nutrition Goals settings in ProfileScreen. The
 * file is kept intact (and still type-checks) so restoring the feature is just a
 * matter of uncommenting those call sites — the backend endpoints never went away.
 *
 * The couple's shared food & exercise diary — one day at a time. A plain log,
 * not a nutrition database: you type what you ate and a calorie count, or a
 * workout and its minutes. Both partners see the whole day; each entry is only
 * editable by whoever logged it (the server enforces that too).
 *
 * "Net" is calories eaten minus calories burned — the one number the day is
 * really about — with the raw in/out/minutes underneath it.
 */
const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoOf(new Date());
const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoOf(d);
};
const dayLabel = (iso: string) => {
  if (iso === today()) return "Today";
  if (iso === shift(today(), -1)) return "Yesterday";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

type Side = { food: number; burn: number; minutes: number };
const emptySide = (): Side => ({ food: 0, burn: 0, minutes: 0 });

function totals(entries: DiaryEntry[], mine: boolean): Side {
  return entries
    .filter((e) => e.mine === mine)
    .reduce((acc, e) => {
      if (e.kind === "food") acc.food += e.calories;
      else {
        acc.burn += e.calories;
        acc.minutes += e.minutes;
      }
      return acc;
    }, emptySide());
}

export default function DiaryScreen({ onBack }: { onBack: () => void }) {
  const { me } = useAuth();
  const [date, setDate] = useState(today());
  const { data, loading, set } = useQuery(keys.diary(date), () => api.day(date));
  const [editing, setEditing] = useState<{ kind: DiaryKind; entry?: DiaryEntry } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const entries = data?.entries ?? [];
  const partnerName = data?.partner_name ?? me?.partner?.display_name ?? null;
  const you = totals(entries, true);
  const them = totals(entries, false);

  const food = entries.filter((e) => e.kind === "food");
  const moves = entries.filter((e) => e.kind === "exercise");

  // Optimistic cache writes so an add/edit/delete lands instantly. The calendar
  // reads its per-day totals from a separate cache, so drop those too — the day's
  // net just changed, and a stale calendar would show the old number.
  const upsert = (e: DiaryEntry) => {
    set((prev = { date, partner_name: partnerName, entries: [] }) => ({
      ...prev,
      entries: prev.entries.some((p) => p.id === e.id)
        ? prev.entries.map((p) => (p.id === e.id ? e : p))
        : [...prev.entries, e],
    }));
    invalidate("diary-summary");
  };
  const drop = (id: number) => {
    set((prev = { date, partner_name: partnerName, entries: [] }) => ({
      ...prev,
      entries: prev.entries.filter((p) => p.id !== id),
    }));
    invalidate("diary-summary");
  };

  const header = (
    // Back arrow at the far left, the day-stepper pushed to the right: keeping
    // the ‹ prev-day chevron out from directly under the back arrow is what
    // stops the two reading as a pair of back buttons.
    <div className="flex items-center gap-2 py-2">
      <button onClick={onBack} aria-label="Back" className="-ml-1 p-2 text-stone-500 active:scale-90 transition">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <h1 className="text-2xl font-bold text-stone-800">Diary</h1>
      <div className="ml-auto flex items-center gap-0.5">
        <button onClick={() => setDate((d) => shift(d, -1))} aria-label="Previous day" className="grid h-9 w-9 place-items-center rounded-full text-stone-500 active:scale-90 transition">
          <ChevronLeft className="h-5 w-5" />
        </button>
        {/* The label opens a month calendar with each day's net calories. */}
        <button
          onClick={() => setCalendarOpen(true)}
          className="flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-stone-700 active:scale-95 transition"
        >
          {dayLabel(date)}
          <CalendarDays className="h-3.5 w-3.5 text-stone-400" />
        </button>
        <button
          onClick={() => setDate((d) => shift(d, 1))}
          aria-label="Next day"
          disabled={date >= today()}
          className="grid h-9 w-9 place-items-center rounded-full text-stone-500 active:scale-90 transition disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  return (
    <Screen header={header}>
      {/* Calorie gauge: semicircular progress showing consumed vs maintenance. */}
      <CalorieGauge
        consumed={you.food}
        burned={you.burn}
        goal={me?.nutrition_goals?.calories ?? null}
        partnerName={partnerName}
        partnerSide={them}
      />

      {loading && entries.length === 0 ? (
        <Spinner />
      ) : (
        <>
          <Section
            title="Food"
            Icon={Utensils}
            summary={`${you.food + them.food} kcal`}
            onAdd={() => setEditing({ kind: "food" })}
            empty="Nothing logged yet. Add what you ate."
            rows={food}
            partnerName={partnerName}
            onOpen={(e) => setEditing({ kind: "food", entry: e })}
            format={(e) =>
              [
                `${e.calories} kcal`,
                e.carbs ? `${e.carbs}g carbs` : "",
                e.protein ? `${e.protein}g protein` : "",
                e.fat ? `${e.fat}g fat` : "",
                e.fibre ? `${e.fibre}g fibre` : "",
              ]
                .filter(Boolean)
                .join(" · ")
            }
          />
          <Section
            title="Movement"
            Icon={Flame}
            summary={`${you.minutes + them.minutes} min`}
            onAdd={() => setEditing({ kind: "exercise" })}
            empty="No workouts yet. Log some movement."
            rows={moves}
            partnerName={partnerName}
            onOpen={(e) => setEditing({ kind: "exercise", entry: e })}
            format={(e) => `${e.minutes} min${e.calories ? ` · ${e.calories} kcal` : ""}`}
          />
        </>
      )}

      <div className="pb-6" />

      {editing && (
        <DiaryEditor
          kind={editing.kind}
          entry={editing.entry ?? null}
          date={date}
          onClose={() => setEditing(null)}
          onSaved={(e) => {
            upsert(e);
            setEditing(null);
          }}
          onDeleted={(id) => {
            drop(id);
            setEditing(null);
          }}
        />
      )}

      {calendarOpen && (
        <MonthCalendar
          value={date}
          onPick={(iso) => {
            setDate(iso);
            setCalendarOpen(false);
          }}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </Screen>
  );
}

// --------------------------------------------------------------------------- //
// Month calendar — the date picker behind the header label. Each day shows its
// net calories, "untracked" for days with nothing logged, and 0 for today.
// --------------------------------------------------------------------------- //
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const monthStart = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return isoOf(new Date(d.getFullYear(), d.getMonth(), 1));
};
const addMonth = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`);
  return isoOf(new Date(d.getFullYear(), d.getMonth() + n, 1));
};
const monthLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
/** Compact so it fits a narrow cell: 1240 stays, 12400 becomes 12.4k. */
const fmtNet = (n: number) => (Math.abs(n) >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(n));

function MonthCalendar({
  value,
  onPick,
  onClose,
}: {
  value: string;
  onPick: (iso: string) => void;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(monthStart(value));
  const first = new Date(`${month}T00:00:00`);
  const year = first.getFullYear();
  const m = first.getMonth();
  const numDays = new Date(year, m + 1, 0).getDate();
  const lead = first.getDay(); // blanks before the 1st (0 = Sunday)
  const monthEnd = isoOf(new Date(year, m, numDays));

  const { data } = useQuery(keys.diarySummary(month, monthEnd), () => api.summary(month, monthEnd));
  const net = data?.days ?? {};
  const t = today();

  const cells: (string | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: numDays }, (_, i) => isoOf(new Date(year, m, i + 1))),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-rise-in w-full max-w-xl rounded-t-3xl bg-surface p-5 shadow-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => setMonth((mo) => addMonth(mo, -1))} aria-label="Previous month" className="grid h-9 w-9 place-items-center rounded-full text-stone-500 active:scale-90 transition">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-bold text-stone-800">{monthLabel(month)}</span>
          <button
            onClick={() => setMonth((mo) => addMonth(mo, 1))}
            disabled={month >= monthStart(t)}
            aria-label="Next month"
            className="grid h-9 w-9 place-items-center rounded-full text-stone-500 active:scale-90 transition disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-bold uppercase text-stone-400">
          {WEEKDAYS.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((iso, i) => {
            if (!iso) return <div key={i} />;
            const isToday = iso === t;
            const future = iso > t;
            const selected = iso === value;
            const tracked = iso in net;
            // Tracked → its net; today with nothing yet → 0; past untracked →
            // "untracked"; the future can't be logged, so it stays blank.
            const label = tracked ? fmtNet(net[iso]) : isToday ? "0" : future ? "" : "untracked";
            return (
              <button
                key={i}
                onClick={() => onPick(iso)}
                disabled={future}
                className={`flex min-h-[3rem] flex-col items-center justify-center gap-1 overflow-hidden rounded-xl px-0.5 py-1 transition active:scale-95 disabled:opacity-30 ${
                  selected ? "bg-rose-500 text-onaccent" : isToday ? "bg-rose-50" : ""
                }`}
              >
                <span className={`text-sm font-semibold leading-none ${selected ? "" : "text-stone-800"}`}>
                  {Number(iso.slice(-2))}
                </span>
                <span
                  className={`w-full truncate text-center text-[8px] font-semibold leading-none tabular-nums ${
                    selected ? "text-onaccent/80" : tracked ? "text-rose-500" : "text-stone-400"
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Semicircular calorie gauge — replaces the old NetCard scoreboard.
// The arc fills from left to right; underneath it shows consumed / goal and
// how many kcal remain. When no goal is set it falls back to a simpler display.
// --------------------------------------------------------------------------- //
function CalorieGauge({
  consumed,
  burned,
  goal,
  partnerName,
  partnerSide,
}: {
  consumed: number;
  burned: number;
  goal: number | null;
  partnerName: string | null;
  partnerSide: Side;
}) {
  const net = consumed - burned;
  const hasGoal = goal !== null && goal > 0;
  const remaining = hasGoal ? Math.max(0, goal! - consumed) : 0;
  const progress = hasGoal ? Math.min(1, consumed / goal!) : 0;
  const over = hasGoal && consumed > goal!;

  // SVG arc geometry — a 180° semicircle sitting in the upper portion.
  const size = 220;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2 + 10;
  // Half-circle arc length.
  const halfCirc = Math.PI * r;

  const gradientId = "cal-grad";

  return (
    <div className="rounded-3xl border border-rose-100 bg-gradient-to-br from-rose-50 via-pink-50 to-rose-100/80 p-4 shadow-sm">
      {hasGoal ? (
        <div className="flex flex-col items-center">
          <svg width={size} height={size / 2 + 24} viewBox={`0 0 ${size} ${size / 2 + 24}`} className="overflow-visible">
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#fb7185" />
                <stop offset="100%" stopColor="#e11d48" />
              </linearGradient>
            </defs>
            {/* Background track */}
            <path
              d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
              fill="none"
              stroke="rgba(0,0,0,0.06)"
              strokeWidth={stroke}
              strokeLinecap="round"
            />
            {/* Filled arc */}
            {progress > 0 && (
              <path
                d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                fill="none"
                stroke={over ? "#ef4444" : `url(#${gradientId})`}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${halfCirc}`}
                strokeDashoffset={`${halfCirc * (1 - progress)}`}
                className="transition-[stroke-dashoffset] duration-700 ease-out"
              />
            )}
            {/* Center text */}
            <text x={cx} y={cy - 30} textAnchor="middle" className="fill-stone-800 text-[32px] font-extrabold" style={{ fontFamily: 'inherit' }}>
              {consumed.toLocaleString()}
            </text>
            <text x={cx} y={cy - 10} textAnchor="middle" className="fill-stone-400 text-[12px] font-semibold" style={{ fontFamily: 'inherit' }}>
              of {goal!.toLocaleString()} kcal
            </text>
          </svg>
          <div className="-mt-1 flex items-center gap-4 text-sm font-semibold tabular-nums">
            {over ? (
              <span className="text-red-500">{(consumed - goal!).toLocaleString()} kcal over</span>
            ) : (
              <span className="text-emerald-600">{remaining.toLocaleString()} kcal remaining</span>
            )}
          </div>
          <div className="mt-2 text-[11px] font-medium text-stone-400 tabular-nums">
            {consumed} in · {burned} out · net {net.toLocaleString()}
          </div>
        </div>
      ) : (
        <div className="text-center py-3">
          <div className="text-2xl font-extrabold text-stone-800 tabular-nums">{net.toLocaleString()}</div>
          <div className="text-xs font-semibold text-stone-400 mt-1">kcal net · {consumed} in · {burned} out</div>
          <p className="mt-3 text-xs text-stone-400">
            Set your calorie goal in the <span className="font-semibold text-rose-500">Us</span> tab to see progress here.
          </p>
        </div>
      )}

      {partnerName && (
        <div className="mt-3 pt-3 border-t border-rose-200/50 flex items-center justify-between text-[11px] font-medium text-stone-400 tabular-nums">
          <span className="font-semibold text-stone-500 truncate">{partnerName}</span>
          <span>{partnerSide.food} in · {partnerSide.burn} out · {partnerSide.minutes} min</span>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  Icon,
  summary,
  onAdd,
  empty,
  rows,
  partnerName,
  onOpen,
  format,
}: {
  title: string;
  Icon: typeof Utensils;
  summary: string;
  onAdd: () => void;
  empty: string;
  rows: DiaryEntry[];
  partnerName: string | null;
  onOpen: (e: DiaryEntry) => void;
  format: (e: DiaryEntry) => string;
}) {
  return (
    <section className="mt-6">
      <div className="mb-2.5 flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-rose-500" strokeWidth={2} />
        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">{title}</h2>
        <span className="text-xs font-semibold text-stone-400 tabular-nums">{summary}</span>
        <div className="h-px flex-1 bg-gradient-to-r from-stone-200 to-transparent" />
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-surface px-3 py-1.5 text-xs font-semibold text-rose-600 transition active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      {rows.length === 0 ? (
        <button
          onClick={onAdd}
          className="w-full rounded-2xl border-2 border-dashed border-rose-200 px-5 py-6 text-center text-sm text-stone-400 transition active:scale-[0.99]"
        >
          {empty}
        </button>
      ) : (
        <div className="space-y-2">
          {rows.map((e) =>
            e.mine ? (
              <button
                key={e.id}
                onClick={() => onOpen(e)}
                className="flex w-full items-center gap-3 rounded-2xl border border-rose-50 bg-surface px-4 py-3 text-left shadow-sm transition active:scale-[0.99]"
              >
                <Row entry={e} format={format} partnerName={partnerName} />
              </button>
            ) : (
              // The partner's entries: shown, but not yours to edit.
              <div key={e.id} className="flex w-full items-center gap-3 rounded-2xl border border-stone-100 bg-surface/60 px-4 py-3">
                <Row entry={e} format={format} partnerName={partnerName} />
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}

function Row({ entry, format, partnerName }: { entry: DiaryEntry; format: (e: DiaryEntry) => string; partnerName: string | null }) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-stone-800">{entry.name}</div>
        {!entry.mine && partnerName && (
          <div className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-stone-400">
            <Avatar name={partnerName} tone="stone" className="!h-4 !w-4 !text-[9px]" /> {partnerName}
          </div>
        )}
      </div>
      <span className="shrink-0 text-sm font-semibold text-stone-500 tabular-nums">{format(entry)}</span>
    </>
  );
}

function DiaryEditor({
  kind,
  entry,
  date,
  onClose,
  onSaved,
  onDeleted,
}: {
  kind: DiaryKind;
  entry: DiaryEntry | null;
  date: string;
  onClose: () => void;
  onSaved: (e: DiaryEntry) => void;
  onDeleted: (id: number) => void;
}) {
  const isFood = kind === "food";
  const [name, setName] = useState(entry?.name ?? "");
  const [calories, setCalories] = useState(entry?.calories ? String(entry.calories) : "");
  const [minutes, setMinutes] = useState(entry?.minutes ? String(entry.minutes) : "");
  const [carbs, setCarbs] = useState(entry?.carbs ? String(entry.carbs) : "");
  const [protein, setProtein] = useState(entry?.protein ? String(entry.protein) : "");
  const [fat, setFat] = useState(entry?.fat ? String(entry.fat) : "");
  const [fibre, setFibre] = useState(entry?.fibre ? String(entry.fibre) : "");
  const [busy, setBusy] = useState(false);
  // Size the overlay to the visible viewport so the sheet sits above the
  // on-screen keyboard (fields + Save stay in view — mainly for the PWA).
  const rect = useViewportRect();

  const num = (s: string) => Math.max(0, Math.min(100000, parseInt(s, 10) || 0));

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const body: DiaryInput = {
      kind,
      name: name.trim(),
      calories: num(calories),
      minutes: isFood ? 0 : num(minutes),
      carbs: isFood ? num(carbs) : 0,
      protein: isFood ? num(protein) : 0,
      fat: isFood ? num(fat) : 0,
      fibre: isFood ? num(fibre) : 0,
      date,
    };
    try {
      onSaved(entry ? await api.update(entry.id, body) : await api.create(body));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!entry || busy) return;
    setBusy(true);
    try {
      await api.remove(entry.id);
      onDeleted(entry.id);
    } finally {
      setBusy(false);
    }
  };

  const title = `${entry ? "Edit" : "Add"} ${isFood ? "food" : "movement"}`;

  return (
    // The overlay's box ends at the keyboard's top edge (the visual viewport's
    // bottom), so `items-end` lands the sheet just above it; running it from
    // top 0 keeps the whole visible area dimmed. Fixed inset-0 as the fallback
    // where visualViewport isn't available. Same shape as the Notes/Facts
    // editors — keep the three in step.
    <div
      className="fixed inset-x-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px]"
      style={rect ? { top: 0, height: rect.top + rect.height } : { top: 0, bottom: 0 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-rise-in max-h-full w-full max-w-xl overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-2xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-stone-800">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-stone-400 active:scale-90">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <Input
            value={name}
            autoFocus
            maxLength={120}
            placeholder={isFood ? "Lentil Soup" : "Morning run"}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && save()}
          />

          <div className="flex gap-3">
            {!isFood && (
              <NumberField label="Minutes" value={minutes} onChange={setMinutes} placeholder="30" />
            )}
            <NumberField
              label={isFood ? "Calories" : "Calories burned"}
              value={calories}
              onChange={setCalories}
              placeholder={isFood ? "420" : "optional"}
            />
          </div>

          {isFood && (
            <div className="flex gap-3">
              <NumberField label="Carbs (g)" value={carbs} onChange={setCarbs} placeholder="optional" />
              <NumberField label="Protein (g)" value={protein} onChange={setProtein} placeholder="optional" />
            </div>
          )}
          {isFood && (
            <div className="flex gap-3">
              <NumberField label="Fat (g)" value={fat} onChange={setFat} placeholder="optional" />
              <NumberField label="Fibre (g)" value={fibre} onChange={setFibre} placeholder="optional" />
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-3">
          {entry && (
            <button
              onClick={remove}
              disabled={busy}
              aria-label="Delete entry"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-stone-200 text-stone-400 transition active:scale-95 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={save}
            disabled={!name.trim() || busy}
            className="flex-1 rounded-2xl bg-rose-600 py-3.5 font-semibold text-onaccent transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? "Saving…" : entry ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex-1">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-stone-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder={placeholder}
        className="w-full rounded-2xl border border-stone-200 bg-surface px-4 py-3 text-stone-800 outline-none focus:border-rose-400 tabular-nums"
      />
    </label>
  );
}
