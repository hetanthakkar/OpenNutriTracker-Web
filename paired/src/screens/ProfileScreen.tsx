import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../auth";
import { ApiError, auth as authApi, facts as factsApi, pairing, shiftSchedule as shiftsApi, type Fact, type FactScope, type FactSection, type FactReminder, type NotifCategory } from "../api";
import { clearCache, keys, useQuery } from "../query";
import { Button, Card, Input, Screen, Spinner, Textarea, useViewportRect } from "../ui";
import { enableNotifications } from "../notifications";
import { THEMES, applyTheme, getTheme, type ThemeKey } from "../theme";
import PairingScreen from "./PairingScreen";
import { usePushPermission } from "./NotificationsScreen";
import WorkdayScreen from "./WorkdayScreen";
import { useScreenEntry } from "../router";
import { weeklyCount } from "../shifts";
import {
  /* Apple, */ Bell, Briefcase, Calendar, CalendarHeart, Check, ChevronDown, ChevronRight, Hand, Heart,
  HeartHandshake, MessageCircle, Palette, PartyPopper, Pencil, Sparkles, StickyNote, Users, X, type LucideIcon,
} from "lucide-react";

const NOTIF_CATEGORIES: { key: NotifCategory; label: string; Icon: LucideIcon; blurb: string }[] = [
  { key: "daily", label: "Daily question", Icon: HeartHandshake, blurb: "Your shared question each day" },
  { key: "answers", label: "Partner answers", Icon: Check, blurb: "When it's your turn or answers unlock" },
  { key: "messages", label: "Messages", Icon: MessageCircle, blurb: "New messages in a discussion" },
  { key: "nudges", label: "Nudges", Icon: Hand, blurb: "When your partner nudges you" },
  { key: "dates", label: "Date reminders", Icon: Calendar, blurb: "Anniversaries & birthdays you saved" },
  { key: "notes", label: "Note reminders", Icon: StickyNote, blurb: "Sticky notes you set a date on" },
  // Received, not sent: this silences the reminders your *partner* set up for
  // your shifts. What you set up for them lives behind the Workday card below.
  { key: "shifts", label: "Workday reminders", Icon: Briefcase, blurb: "What your partner set for your shifts" },
];

interface SectionMeta {
  /** The `section` new facts are filed under. */
  key: FactSection;
  title: string;
  Icon: LucideIcon;
  labelHint: string;
  valueHint: string;
  blurb: string;
}

const DATES: SectionMeta = {
  key: "dates",
  title: "Important dates",
  Icon: CalendarHeart,
  labelHint: "e.g. Anniversary",
  valueHint: "",
  blurb: "Anniversaries, birthdays, milestones.",
};

/**
 * "Favorites" and "Other" were one thing pretending to be two — a comfort food
 * and a shellfish allergy are both just worth remembering — so they read as a
 * single section now.
 *
 * The split still exists server-side: nothing was migrated, so old facts keep
 * whichever `section` they were saved with and an edit preserves it. The merge
 * is a client-side view (:func:`isGoodToKnow`), and new entries are filed under
 * `favorites`, where nearly all of them already live.
 */
const GOOD_TO_KNOW: SectionMeta = {
  key: "favorites",
  title: "Good to know",
  Icon: Sparkles,
  labelHint: "e.g. Comfort food",
  valueHint: "e.g. Mac & cheese",
  blurb: "Comfort food, color, song, allergies, sizes…",
};

const isGoodToKnow = (f: Fact) => f.section !== "dates";

const REMINDER_OPTIONS: { key: FactReminder; label: string }[] = [
  { key: "none", label: "Off" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

/** YYYY-MM-DD → local midnight. Parsing via `new Date(iso)` would read it as
 *  UTC and slide a day backwards for anyone west of Greenwich. */
function parseYMD(iso: string): Date | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toYMD(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDate(iso: string): string {
  const date = parseYMD(iso);
  if (!date) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Whole days from `from` to `to`. Both are local midnights, so the DST-safe
 *  way is to compare UTC-normalised timestamps rather than divide the raw gap
 *  (a spring-forward day is only 23h long and would round down). */
function daysBetween(from: Date, to: Date): number {
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** Round-number day counts worth celebrating, in the spirit of a streak goal. */
const MILESTONES = [50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000];

function milestoneWindow(days: number): { from: number; to: number | null } {
  const to = MILESTONES.find((m) => m > days) ?? null;
  const passed = MILESTONES.filter((m) => m <= days);
  return { from: passed.length ? passed[passed.length - 1] : 0, to };
}

/** The next time the start date's month/day comes around, and which
 *  anniversary it will be. Feb 29 starts land on Mar 1 in common years —
 *  JS rolls the overflow forward on its own, which is the behaviour we want. */
function nextAnniversary(start: Date, today: Date): { date: Date; years: number } {
  let year = today.getFullYear();
  let date = new Date(year, start.getMonth(), start.getDate());
  if (daysBetween(today, date) < 0) {
    year += 1;
    date = new Date(year, start.getMonth(), start.getDate());
  }
  return { date, years: year - start.getFullYear() };
}

export default function ProfileScreen() {
  const { me, refresh, logout } = useAuth();
  const [scope, setScope] = useState<FactScope>("me");
  const { data, loading, set: setItems } = useQuery(keys.facts, factsApi.list);
  const items = useMemo(() => data ?? [], [data]);
  // `scope` is carried here rather than read from the pill state at save time:
  // the timeline's add button sits above the pills and always files under "us",
  // whichever pill happens to be selected.
  const [editing, setEditing] = useState<{ section: FactSection; fact?: Fact; scope: FactScope } | null>(null);
  const [startPairing, setStartPairing] = useState(false);
  const [managePairing, setManagePairing] = useState(false);

  // Editable name + notification prefs live inline on this tab.
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(me?.display_name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [prefs, setPrefs] = useState<Partial<Record<NotifCategory, boolean>>>(me?.notif_prefs ?? {});
  const [notif, setNotif] = useState("");
  const [showNotifDetail, setShowNotifDetail] = useState(false);
  const [theme, setTheme] = useState<ThemeKey>(getTheme());

  // The tab's heading is the couple's own name for themselves.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(me?.couple_title ?? "");
  const [savingTitle, setSavingTitle] = useState(false);

  const partnerName = me?.partner?.display_name || "Partner";
  // Until they name it, "Hetan & Sam" reads better than a generic "Us".
  const defaultTitle = me?.paired ? `${me.display_name} & ${partnerName}` : "Us";
  const title = me?.couple_title?.trim() || defaultTitle;

  const pickTheme = (key: ThemeKey) => {
    setTheme(key);
    applyTheme(key);
  };

  const scopeItems = useMemo(() => items.filter((f) => f.scope === scope), [items, scope]);
  // One merged list: the old favorites/other split is invisible here.
  const goodToKnow = useMemo(
    () => scopeItems.filter(isGoodToKnow).sort((a, b) => a.label.localeCompare(b.label)),
    [scopeItems],
  );
  const locked = !me?.paired && (scope === "partner" || scope === "us");
  // Categories default to on, so "not false" is the test — but that's only
  // "not silenced", not "actually reachable". A fresh account has every
  // category unsilenced before the browser has ever granted permission or a
  // device has registered, so the switch must also check `permission` or it
  // reads as "Every push on" for someone who has never enabled push at all —
  // which was exactly this bug.
  const [permission, syncPermission] = usePushPermission();
  const onCount = NOTIF_CATEGORIES.filter((c) => prefs[c.key] !== false).length;
  const allOn = permission === "granted" && onCount === NOTIF_CATEGORIES.length;

  // Workday reminders — a screen of its own (a week grid, three shifts, three
  // message texts), reached from the card below.
  const [showWorkday, setShowWorkday] = useState(false);
  useScreenEntry(showWorkday, "/workday", () => setShowWorkday(false));

  // Pairing is a distinct full-screen flow; everything else stays on the tab.
  // (Early returns come after all hooks — rules of hooks.)
  if (startPairing && !me?.paired) return <PairingScreen />;
  if (showWorkday) return <WorkdayScreen onBack={() => setShowWorkday(false)} />;

  const onSaved = (saved: Fact) => {
    setItems((prev = []) => {
      const rest = prev.filter((f) => f.id !== saved.id);
      return [...rest, saved];
    });
    setEditing(null);
  };
  const onDeleted = (id: number) => {
    setItems((prev = []) => prev.filter((f) => f.id !== id));
    setEditing(null);
  };

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === me?.display_name) {
      setName(me?.display_name ?? "");
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await authApi.updateMe({ display_name: trimmed });
      await refresh();
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  };

  const saveTitle = async () => {
    const trimmed = titleDraft.trim();
    if (trimmed === (me?.couple_title ?? "")) {
      setEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    try {
      await authApi.updateMe({ couple_title: trimmed });
      await refresh();
      setEditingTitle(false);
    } finally {
      setSavingTitle(false);
    }
  };

  const turnOn = async () => {
    setNotif("…");
    setNotif(await enableNotifications());
  };

  const toggle = async (key: NotifCategory) => {
    const next = { ...prefs, [key]: prefs[key] === false ? true : false };
    setPrefs(next);
    try {
      await authApi.updateMe({ notif_prefs: { [key]: next[key] } });
      await refresh();
    } catch {
      setPrefs((p) => ({ ...p, [key]: !next[key] })); // revert on failure
    }
  };

  // Master toggle: enable everything (also asks for device permission) or
  // silence everything at once.
  const toggleAll = async () => {
    const value = !allOn;
    const next = Object.fromEntries(
      NOTIF_CATEGORIES.map((c) => [c.key, value])
    ) as Partial<Record<NotifCategory, boolean>>;
    const prev = prefs;
    setPrefs(next);
    if (value) {
      await turnOn();
      syncPermission();
    }
    try {
      await authApi.updateMe({ notif_prefs: next });
      await refresh();
    } catch {
      setPrefs(prev); // revert on failure
    }
  };

  const tabs: { key: FactScope; label: string }[] = [
    { key: "me", label: "Me" },
    { key: "partner", label: partnerName },
    { key: "us", label: "Us" },
  ];

  // Account chrome. It leads the tab while unpaired (it holds the pairing CTA),
  // and sinks to the settings cluster at the bottom once there's a relationship
  // to put first. Bound to a variable rather than lifted into a component so it
  // keeps closing over the name/pairing state instead of drilling eight props.
  const identityCard = (
    <Card className="mb-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-rose-100 text-rose-600 grid place-items-center shrink-0">
            <Users className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoFocus className="flex-1" />
                <button onClick={saveName} disabled={savingName} className="text-sm font-semibold text-rose-600 px-1 py-1 disabled:opacity-50">
                  {savingName ? "…" : "Save"}
                </button>
                <button onClick={() => { setName(me?.display_name ?? ""); setEditingName(false); }} aria-label="Cancel" className="text-stone-400 px-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-stone-800 truncate">{me?.display_name}</span>
                <button onClick={() => setEditingName(true)} aria-label="Edit name" className="text-stone-400 active:scale-90 transition">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="text-sm text-stone-500 mt-0.5 flex items-center gap-2">
              {me?.paired ? (
                <>
                  <span className="truncate">Paired with {me?.partner?.display_name}</span>
                  <button onClick={() => setManagePairing(true)} className="text-rose-500 font-medium shrink-0">Edit</button>
                </>
              ) : (
                <>Not paired yet</>
              )}
            </div>
          </div>
          <button
            onClick={logout}
            className="shrink-0 text-sm font-medium text-rose-500 active:scale-95 transition"
          >
            Log out
          </button>
        </div>

      {!me?.paired && (
        <Button onClick={() => setStartPairing(true)} className="mt-4">
          Pair with your partner
        </Button>
      )}
    </Card>
  );

  // Not a useMemo: the PairingScreen early return above means hooks can't be
  // added past this point. The list is tiny, so recomputing per render is free.
  const usDates = items
    .filter((f) => f.scope === "us" && f.section === "dates")
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  // The heading doubles as the couple's title, editable in place once paired.
  const header = (
    <div className="pt-2 pb-4">
      {editingTitle ? (
        <div className="flex items-center gap-2">
          <Input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            placeholder={defaultTitle}
            maxLength={60}
            autoFocus
            className="flex-1 !text-xl !font-bold"
          />
          <button onClick={saveTitle} disabled={savingTitle} className="text-sm font-semibold text-rose-600 px-1 py-1 disabled:opacity-50">
            {savingTitle ? "…" : "Save"}
          </button>
          <button
            onClick={() => { setTitleDraft(me?.couple_title ?? ""); setEditingTitle(false); }}
            aria-label="Cancel"
            className="text-stone-400 px-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-2xl font-bold text-stone-800 truncate">{title}</h1>
          {me?.paired && (
            <button
              onClick={() => { setTitleDraft(me?.couple_title ?? ""); setEditingTitle(true); }}
              aria-label="Rename us"
              className="text-stone-400 shrink-0 active:scale-90 transition"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <Screen header={header}>
      {/* Paired: the relationship leads. Unpaired: there's nothing to lead with,
          so the pairing invitation takes the top slot instead. */}
      {me?.paired ? (
        <div>
          <TogetherCard
            anniversary={me.anniversary ?? null}
            onSave={async (iso) => {
              await authApi.updateMe({ anniversary: iso });
              await refresh();
            }}
          />
          <SectionRule label="Important dates" Icon={CalendarHeart} first
            action={
              <button
                onClick={() => setEditing({ section: "dates", scope: "us" })}
                aria-label="Add to Important dates"
                className="h-8 w-8 grid place-items-center rounded-full bg-rose-500 text-onaccent text-xl leading-none active:scale-90 transition"
              >
                +
              </button>
            }
          />
          {loading ? (
            <Spinner />
          ) : (
            <DatesTimeline
              anniversary={me.anniversary ?? null}
              facts={usDates}
              onEdit={(f) => setEditing({ section: "dates", fact: f, scope: "us" })}
            />
          )}
        </div>
      ) : (
        identityCard
      )}

      {/* Me / Partner / Us — the things worth remembering about each of you.
          Dates are the exception: they belong to the couple and live in the
          timeline above, under "Us", never under an individual scope. */}
      <SectionRule
        label={GOOD_TO_KNOW.title}
        Icon={GOOD_TO_KNOW.Icon}
        first={!me?.paired}
        action={
          locked ? undefined : (
            <button
              onClick={() => setEditing({ section: GOOD_TO_KNOW.key, scope })}
              aria-label={`Add to ${GOOD_TO_KNOW.title}`}
              className="h-8 w-8 grid place-items-center rounded-full bg-rose-500 text-onaccent text-xl leading-none active:scale-90 transition"
            >
              +
            </button>
          )
        }
      />
      <div className="flex gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setScope(t.key)}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition truncate ${
              scope === t.key ? "bg-rose-500 text-onaccent" : "bg-surface border border-stone-200 text-stone-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : locked ? (
        <p className="text-stone-400 text-center mt-10 px-6">
          Pair with your partner to keep {scope === "partner" ? "notes about them" : "shared details"} here.
        </p>
      ) : goodToKnow.length === 0 ? (
        <Card className="!p-4 text-sm text-stone-400">{GOOD_TO_KNOW.blurb}</Card>
      ) : (
        <div className="space-y-2 pb-2">
          {goodToKnow.map((f) => (
            <button
              key={f.id}
              // Carries the fact's own section, so editing a legacy "other"
              // entry saves it back as "other" rather than silently refiling it.
              onClick={() => setEditing({ section: f.section, fact: f, scope })}
              className="w-full text-left"
            >
              <Card className="!p-4 flex items-start gap-3 active:scale-[0.99] transition">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-rose-600 truncate">
                    {f.label}
                  </div>
                  {/* Line breaks are kept, but clamped so one pasted list can't
                      push the rest of the section off-screen. Tap opens the
                      editor with the whole thing. */}
                  {f.value && (
                    <div className="mt-1 text-[15px] leading-relaxed text-stone-800 whitespace-pre-wrap break-words line-clamp-6">
                      {f.value}
                    </div>
                  )}
                </div>
                <Pencil className="h-4 w-4 text-stone-300 shrink-0 mt-0.5" />
              </Card>
            </button>
          ))}
        </div>
      )}

      {/* Nutrition Goals — personal calorie/macro/weight targets. Switched off
          along with the rest of the food/movement feature; see NutritionGoalsCard. */}
      {/* <SectionRule label="Nutrition Goals" Icon={Apple} />
      <NutritionGoalsCard /> */}

      {/* Appearance — compact theme dropdown (applies app-wide instantly) */}
      <SectionRule label="Appearance" Icon={Palette} />
      <Card className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold text-stone-800">Theme</div>
          <ThemeDropdown value={theme} onChange={pickTheme} />
        </div>
      </Card>

      {/* Notifications. The master toggle and a count are all most people need;
          the six categories stay folded away until someone wants to tune them. */}
      <SectionRule label="Notifications" Icon={Bell} />
      <Card className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-stone-800">All notifications</div>
            <p className="text-xs text-stone-400 mt-0.5">
              {permission !== "granted"
                ? "Tap to enable"
                : onCount === 0
                  ? "All off"
                  : onCount === NOTIF_CATEGORIES.length
                    ? "Every push on"
                    : `${onCount} of ${NOTIF_CATEGORIES.length} on`}
            </p>
          </div>
          <Switch on={allOn} onClick={toggleAll} label="All notifications" />
        </div>
        {notif && <p className="text-xs text-stone-400 mt-2">{notif}</p>}

        <button
          onClick={() => setShowNotifDetail((o) => !o)}
          aria-expanded={showNotifDetail}
          className="mt-3 flex w-full items-center justify-between gap-2 border-t border-stone-100 pt-3 text-sm font-medium text-stone-500"
        >
          Customize by type
          <ChevronDown className={`h-4 w-4 transition-transform ${showNotifDetail ? "rotate-180" : ""}`} />
        </button>

        {showNotifDetail && (
          <div className="divide-y divide-stone-100">
            {NOTIF_CATEGORIES.map((c) => {
              const on = prefs[c.key] !== false; // default on
              return (
                <div key={c.key} className="flex items-center gap-3 py-3">
                  <c.Icon className="h-5 w-5 text-stone-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-stone-800 leading-tight">{c.label}</div>
                    <div className="text-xs text-stone-400">{c.blurb}</div>
                  </div>
                  <Switch on={on} onClick={() => toggle(c.key)} label={c.label} />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Workday reminders you set up *for your partner* — the mirror image of
          the "Workday reminders" category above, which silences theirs for you. */}
      <WorkdayCard onOpen={() => setShowWorkday(true)} />

      {/* Account — kept last in the settings cluster; it holds log out. When
          paired it carries the identity card (name, partner, log out); unpaired,
          that card is already at the top with the pairing CTA. */}
      <SectionRule label="Account" Icon={Users} />
      {me?.paired && identityCard}

      {editing && (
        <FactModal
          scope={editing.scope}
          section={editing.section}
          fact={editing.fact}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}

      {managePairing && (
        <ManagePairingModal
          partnerName={partnerName}
          onClose={() => setManagePairing(false)}
          onUnpaired={async () => {
            await refresh();
            setManagePairing(false);
          }}
        />
      )}
    </Screen>
  );
}

// --------------------------------------------------------------------------- //
// Workday reminders — the entry point. A summary rather than controls: the
// schedule is a week grid plus three shifts, which needs a screen.
// --------------------------------------------------------------------------- //
function WorkdayCard({ onOpen }: { onOpen: () => void }) {
  const { data } = useQuery(keys.shiftSchedule, shiftsApi.get);
  const partner = data?.recipient_name;
  const perWeek = data ? weeklyCount(data) : 0;

  const summary = !data
    ? "Lunch, a good-day note, and a lens reminder, on their shift times."
    : !data.enabled
      ? "Off"
      : !partner
        ? "Waiting until you're paired"
        : perWeek === 0
          ? "On, but nothing is scheduled yet"
          : `${perWeek} a week to ${partner}`;

  return (
    <button onClick={onOpen} className="mb-4 w-full text-left">
      <Card className="flex items-center gap-3 transition active:scale-[0.99]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-500">
          <Briefcase className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-stone-800">Their workday</div>
          <p className="mt-0.5 truncate text-xs text-stone-400">{summary}</p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-stone-300" />
      </Card>
    </button>
  );
}

// --------------------------------------------------------------------------- //
// Nutrition Goals — personal calorie/macro/weight targets.
// Inline editing: each field saves on blur or Enter, merging into the
// nutrition_goals JSON on the profile via PATCH /api/me/.
//
// Switched off: the food/movement/calorie feature is hidden from the UI, and
// these targets only ever fed the diary's gauge. PATCH /api/me/ still accepts
// nutrition_goals, so uncommenting this and the two lines that render it (search
// "Nutrition Goals" above) is all it takes to bring the settings back.
// --------------------------------------------------------------------------- //
/*
const GOAL_FIELDS: { key: string; label: string; unit: string; placeholder: string }[] = [
  { key: "calories", label: "Maintenance Calories", unit: "kcal", placeholder: "e.g. 2000" },
  { key: "protein", label: "Protein", unit: "g", placeholder: "e.g. 150" },
  { key: "carbs", label: "Carbohydrates", unit: "g", placeholder: "e.g. 250" },
  { key: "fat", label: "Fat", unit: "g", placeholder: "e.g. 65" },
  { key: "fibre", label: "Fibre", unit: "g", placeholder: "e.g. 30" },
  { key: "weight", label: "Current Weight", unit: "kg", placeholder: "e.g. 75" },
];

function NutritionGoalsCard() {
  const { me, refresh } = useAuth();
  const goals = me?.nutrition_goals ?? {};
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  // On mount or when me changes, sync draft from server values.
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const f of GOAL_FIELDS) {
      const v = (goals as Record<string, number | undefined>)[f.key];
      next[f.key] = v !== undefined && v !== null ? String(v) : "";
    }
    setDraft(next);
  }, [me?.nutrition_goals]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveField = async (key: string) => {
    const raw = draft[key]?.replace(/[^\d]/g, "") ?? "";
    const value = raw ? parseInt(raw, 10) : null;
    const current = (goals as Record<string, number | undefined>)[key];
    // Nothing changed — skip the round trip.
    if ((value ?? undefined) === (current ?? undefined)) return;
    setSaving(key);
    try {
      await authApi.updateMe({ nutrition_goals: { [key]: value } });
      await refresh();
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card className="mb-4">
      <p className="text-xs text-stone-400 mb-3">
        Set your daily nutrition targets. These are used to show progress in your diary.
      </p>
      <div className="space-y-3">
        {GOAL_FIELDS.map((f) => (
          <div key={f.key} className="flex items-center gap-3">
            <label className="w-28 shrink-0 text-sm font-medium text-stone-600 truncate">{f.label}</label>
            <div className="flex-1 relative">
              <input
                value={draft[f.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value.replace(/[^\d]/g, "") }))}
                onBlur={() => saveField(f.key)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder={f.placeholder}
                className="w-full rounded-xl border border-stone-200 bg-surface px-3 py-2 pr-12 text-sm text-stone-800 outline-none focus:border-rose-400 tabular-nums transition"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-stone-400 pointer-events-none">
                {saving === f.key ? "…" : f.unit}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
*/

/** The tab is a long scroll of unrelated things — the rule is what tells you
 *  where one block ends and the next begins. */
function SectionRule({
  label,
  Icon,
  action,
  first,
}: {
  label: string;
  Icon: LucideIcon;
  /** Right-aligned control (an add button, typically). */
  action?: ReactNode;
  /** Skips the big top gap when the rule opens a region rather than breaking one. */
  first?: boolean;
}) {
  return (
    <div className={`${first ? "mt-5" : "mt-8"} mb-3 flex items-center gap-3`}>
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-stone-500 shrink-0">
        <Icon className="h-4 w-4 text-rose-500" />
        {label}
      </h2>
      <div className="flex-1 h-px bg-gradient-to-r from-stone-200 to-transparent" />
      {action}
    </div>
  );
}

function ThemeDropdown({ value, onChange }: { value: ThemeKey; onChange: (k: ThemeKey) => void }) {
  const [open, setOpen] = useState(false);
  const current = THEMES.find((t) => t.key === value)!;
  const Dot = ({ color }: { color: string }) => (
    <span className="h-3.5 w-3.5 rounded-full border border-black/10 shrink-0" style={{ backgroundColor: color }} />
  );
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-xl border border-stone-200 bg-surface text-stone-800 text-sm font-medium pl-3 pr-2 py-2 active:scale-[0.98] transition"
      >
        <Dot color={current.swatch} />
        {current.label}
        <ChevronDown className={`h-4 w-4 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="listbox" className="absolute right-0 z-20 mt-1 w-44 rounded-2xl border border-stone-200 bg-surface shadow-lg overflow-hidden py-1">
            {THEMES.map((t) => (
              <button
                key={t.key}
                role="option"
                aria-selected={t.key === value}
                onClick={() => { onChange(t.key); setOpen(false); }}
                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm active:bg-stone-50 ${t.key === value ? "text-rose-600 font-semibold" : "text-stone-700"}`}
              >
                <Dot color={t.swatch} />
                <span className="flex-1">{t.label}</span>
                {t.key === value && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`shrink-0 h-7 w-12 rounded-full p-0.5 transition-colors ${on ? "bg-rose-500" : "bg-stone-300"}`}
    >
      <span className={`block h-6 w-6 rounded-full bg-onaccent shadow transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

function ManagePairingModal({
  partnerName,
  onClose,
  onUnpaired,
}: {
  partnerName: string;
  onClose: () => void;
  onUnpaired: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    pairing.create().then((r) => setCode(r.code)).catch(() => {});
  }, []);

  const share = async () => {
    if (!code) return;
    const text = `Join me on Together 💞 Use my code: ${code}`;
    if (navigator.share) {
      try { await navigator.share({ text }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(code);
    }
  };

  const unpair = async () => {
    setBusy(true);
    setErr("");
    try {
      await pairing.unpair();
      clearCache(); // the partner's answers and shared notes are gone
      onUnpaired();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't unpair.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="bg-surface rounded-t-3xl p-5 max-w-xl w-full mx-auto"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-stone-200" />
        <div className="font-semibold text-stone-800 mb-1">Manage pairing</div>
        <p className="text-sm text-stone-500 mb-4">Paired with {partnerName}.</p>

        <label className="block text-xs font-medium text-stone-500 mb-1">Your access code</label>
        <button
          onClick={share}
          className="w-full text-2xl font-bold tracking-[0.3em] text-rose-600 bg-rose-50 rounded-2xl py-4 active:scale-[0.99] transition"
        >
          {code ?? "…"}
        </button>
        <p className="text-xs text-stone-400 mt-1 mb-5">Tap to share. Handy if you unpair and want to reconnect.</p>

        {confirming ? (
          <>
            <p className="text-sm text-stone-600 mb-2 text-center">Unpair from {partnerName}? You'll each start fresh.</p>
            <Button onClick={unpair} disabled={busy}>{busy ? "Unpairing…" : "Yes, unpair"}</Button>
            <button onClick={() => setConfirming(false)} className="w-full text-sm text-stone-400 py-3">Cancel</button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="w-full rounded-2xl border border-rose-200 text-rose-600 font-semibold py-3.5 active:scale-[0.98] transition"
          >
            Unpair
          </button>
        )}
        {err && <p className="text-sm text-rose-600 text-center mt-3">{err}</p>}
      </div>
    </div>
  );
}

function FactModal({
  scope,
  section,
  fact,
  onClose,
  onSaved,
  onDeleted,
}: {
  scope: FactScope;
  section: FactSection;
  fact?: Fact;
  onClose: () => void;
  onSaved: (f: Fact) => void;
  onDeleted: (id: number) => void;
}) {
  const isDate = section === "dates";
  // "favorites" and "other" both land here; the caller passes an existing fact's
  // own section through untouched, so a legacy "other" row saves back as "other".
  const meta = isDate ? DATES : GOOD_TO_KNOW;
  const [label, setLabel] = useState(fact?.label ?? "");
  const [value, setValue] = useState(fact?.value ?? "");
  const [date, setDate] = useState(fact?.date ?? "");
  const [reminder, setReminder] = useState<FactReminder>(fact?.reminder ?? "none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Keep the sheet above the on-screen keyboard (iOS PWA especially).
  const rect = useViewportRect();

  const valid = label.trim() && (isDate ? !!date : value.trim());

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        section,
        label: label.trim(),
        value: isDate ? "" : value.trim(),
        date: isDate ? date : null,
        reminder: isDate ? reminder : ("none" as FactReminder),
      };
      const saved = fact
        ? await factsApi.update(fact.id, payload)
        : await factsApi.create({ scope, ...payload });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!fact) return;
    setBusy(true);
    try {
      await factsApi.remove(fact.id);
      onDeleted(fact.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    // Same single-overlay shape as the diary editor (proven on iOS): the box
    // ends at the keyboard's top edge, justify-end lands the sheet on it, and
    // the sheet scrolls internally when taller than the visible area.
    <div
      className="fixed inset-x-0 z-50 flex flex-col justify-end bg-black/40"
      style={rect ? { top: 0, height: rect.top + rect.height } : { top: 0, bottom: 0 }}
      onClick={onClose}
    >
      <div
        className="max-h-full overflow-y-auto bg-surface rounded-t-3xl p-5 max-w-xl w-full mx-auto"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-stone-200" />
        <div className="font-semibold text-stone-800 mb-4 flex items-center gap-2">
          <meta.Icon className="h-4 w-4 text-rose-500" />
          {fact ? "Edit" : "Add"} — {meta.title}
        </div>

        <label className="block text-xs font-medium text-stone-500 mb-1">Label</label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={meta.labelHint} autoFocus className="mb-3" />

        {isDate ? (
          <>
            <label className="block text-xs font-medium text-stone-500 mb-1">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mb-3" />

            <label className="block text-xs font-medium text-stone-500 mb-1">Remind us</label>
            <div className="flex gap-2 mb-4">
              {REMINDER_OPTIONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setReminder(r.key)}
                  className={`flex-1 rounded-full px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${
                    reminder === r.key ? "bg-rose-500 text-onaccent" : "bg-surface border border-stone-200 text-stone-500"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <label className="block text-xs font-medium text-stone-500 mb-1">What to remember</label>
            {/* Multi-line: a favorite is often a pasted list (three comfort
                foods, a wishlist), and an <input> would drop the line breaks. */}
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={meta.valueHint}
              maxLength={500}
              className="mb-4"
            />
          </>
        )}

        {error && <p className="text-sm text-rose-500 mb-3">{error}</p>}

        <Button onClick={save} disabled={!valid || busy}>
          {busy ? "Saving…" : fact ? "Save" : "Add"}
        </Button>
        {fact ? (
          <button onClick={remove} disabled={busy} className="w-full text-sm text-rose-500 py-3 mt-1 disabled:opacity-50">
            Delete
          </button>
        ) : (
          <button onClick={onClose} disabled={busy} className="w-full text-sm text-stone-400 py-3 mt-1">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// "Together since" — the Us tab's hero. The day count is the headline; the bar
// underneath frames the next round-number milestone as something to reach.
// --------------------------------------------------------------------------- //
function TogetherCard({ anniversary, onSave }: { anniversary: string | null; onSave: (iso: string | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(anniversary ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = startOfToday();
  const start = anniversary ? parseYMD(anniversary) : null;

  async function save(iso: string | null) {
    setBusy(true);
    setError(null);
    try {
      await onSave(iso);
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save that date.");
    } finally {
      setBusy(false);
    }
  }

  if (!start || editing) {
    return (
      <Card className="mb-4">
        <div className="flex items-center gap-2 font-semibold text-stone-800">
          <HeartHandshake className="h-5 w-5 text-rose-500" />
          {start ? "Change your start date" : "When did you two begin?"}
        </div>
        <p className="text-sm text-stone-400 mt-1">
          We'll count every day since, and mark the milestones along the way.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <Input
            type="date"
            value={draft}
            max={toYMD(today)}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1"
          />
          <button
            onClick={() => save(draft || null)}
            disabled={busy || !draft}
            className="text-sm font-semibold text-rose-600 px-2 py-2 disabled:opacity-40"
          >
            {busy ? "…" : "Save"}
          </button>
          {start && (
            <button onClick={() => { setDraft(anniversary ?? ""); setEditing(false); }} aria-label="Cancel" className="text-stone-400 px-1">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
      </Card>
    );
  }

  const days = daysBetween(start, today);
  const { from, to } = milestoneWindow(days);
  const { date: annivDate, years } = nextAnniversary(start, today);
  const daysToAnniv = daysBetween(today, annivDate);
  // `to` is null once they're past the last milestone we track — show a full bar
  // rather than dividing by nothing.
  const progress = to ? Math.min(1, Math.max(0, (days - from) / (to - from))) : 1;

  return (
    <div className="relative mb-4 overflow-hidden rounded-3xl border border-rose-100 bg-gradient-to-br from-rose-50 via-pink-50 to-rose-100/80 p-5 shadow-sm">
      <div className="pointer-events-none absolute -top-10 -right-6 h-36 w-36 rounded-full bg-rose-200/30 blur-2xl" />

      <div className="relative z-10 flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-rose-600">
          <HeartHandshake className="h-3.5 w-3.5" /> Together since
        </span>
        <button
          onClick={() => { setDraft(anniversary ?? ""); setEditing(true); }}
          aria-label="Change start date"
          className="text-stone-400 active:scale-90 transition"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative z-10 mt-3">
        <div className="text-5xl font-extrabold leading-none tracking-tight text-stone-800 tabular-nums">
          {days.toLocaleString()}
        </div>
        <div className="mt-1.5 text-sm font-medium text-stone-500">
          {days === 1 ? "day" : "days"} together · since {formatDate(anniversary!)}
        </div>
      </div>

      {to && (
        <div className="relative z-10 mt-5">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface/70">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-600 transition-[width] duration-700 ease-out"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] font-semibold text-stone-500 tabular-nums">
            <span>{from.toLocaleString()}</span>
            <span className="text-rose-600">{(to - days).toLocaleString()} days to {to.toLocaleString()}</span>
          </div>
        </div>
      )}

      <div className="relative z-10 mt-4 inline-flex items-center gap-2 rounded-full bg-surface/70 px-3 py-1.5 text-xs font-semibold text-stone-600 backdrop-blur-sm">
        <PartyPopper className="h-3.5 w-3.5 text-rose-500" />
        {daysToAnniv === 0
          ? `Happy ${years}-year anniversary! 🎉`
          : `${years} ${years === 1 ? "year" : "years"} in ${daysToAnniv.toLocaleString()} ${daysToAnniv === 1 ? "day" : "days"}`}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// The Us-tab timeline. One rail, chronological, with a live "today" node sitting
// between what's happened and what's still coming.
// --------------------------------------------------------------------------- //
interface TimelineNode {
  key: string;
  label: string;
  iso: string;
  fact?: Fact;
  origin?: boolean;
}

function DatesTimeline({
  anniversary,
  facts,
  onEdit,
}: {
  anniversary: string | null;
  facts: Fact[];
  onEdit: (f: Fact) => void;
}) {
  const today = startOfToday();
  const todayIso = toYMD(today);

  const nodes: TimelineNode[] = [
    ...(anniversary ? [{ key: "anniversary", label: "The day it began", iso: anniversary, origin: true }] : []),
    ...facts
      .filter((f) => f.date)
      .map((f) => ({ key: `fact-${f.id}`, label: f.label, iso: f.date!, fact: f })),
  ].sort((a, b) => a.iso.localeCompare(b.iso));

  if (nodes.length === 0) {
    return (
      <Card className="!p-4 text-sm text-stone-400">
        Add your first date and it'll start a shared timeline.
      </Card>
    );
  }

  const pastCount = nodes.filter((n) => n.iso <= todayIso).length;

  return (
    <div className="relative pl-8">
      {/* The rail. Solid through the past, dashed once it runs into the future. */}
      <div className="pointer-events-none absolute left-[11px] top-2 bottom-2 w-px bg-gradient-to-b from-rose-300 via-rose-200 to-transparent" />

      <div className="space-y-3">
        {nodes.map((n, i) => {
          const isPast = n.iso <= todayIso;
          const showToday = i === pastCount; // the seam between past and future
          return (
            <div key={n.key}>
              {showToday && <TodayMarker days={anniversary ? daysBetween(parseYMD(anniversary)!, today) : null} />}
              <div className="relative">
                <span
                  className={`absolute -left-8 top-4 grid h-[22px] w-[22px] place-items-center rounded-full border-2 ${
                    isPast ? "border-rose-500 bg-rose-500" : "border-stone-300 bg-surface"
                  }`}
                >
                  {n.origin ? (
                    <Heart className="h-3 w-3 text-onaccent" fill="currentColor" />
                  ) : (
                    <span className={`h-1.5 w-1.5 rounded-full ${isPast ? "bg-onaccent" : "bg-stone-300"}`} />
                  )}
                </span>

                {n.fact ? (
                  <button onClick={() => onEdit(n.fact!)} className="w-full text-left">
                    <TimelineCard node={n} isPast={isPast} editable />
                  </button>
                ) : (
                  <TimelineCard node={n} isPast={isPast} />
                )}
              </div>
            </div>
          );
        })}
        {pastCount === nodes.length && <TodayMarker days={anniversary ? daysBetween(parseYMD(anniversary)!, today) : null} />}
      </div>
    </div>
  );
}

function TimelineCard({ node, isPast, editable }: { node: TimelineNode; isPast: boolean; editable?: boolean }) {
  return (
    <Card className={`!p-4 flex items-center gap-3 transition ${editable ? "active:scale-[0.99]" : ""} ${isPast ? "" : "opacity-70"}`}>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-stone-800 truncate">{node.label}</div>
        <div className="mt-0.5 flex items-center gap-2 text-sm text-rose-500">
          {formatDate(node.iso)}
          {node.fact && node.fact.reminder !== "none" && (
            <span className="inline-flex items-center gap-1 text-xs capitalize text-stone-400">
              <Bell className="h-3 w-3" /> {node.fact.reminder}
            </span>
          )}
        </div>
      </div>
      {editable && <Pencil className="h-4 w-4 shrink-0 text-stone-300" />}
    </Card>
  );
}

function TodayMarker({ days }: { days: number | null }) {
  return (
    <div className="relative py-2">
      <span className="absolute -left-8 top-1/2 -translate-y-1/2 grid h-[22px] w-[22px] place-items-center">
        <span className="h-3 w-3 rounded-full bg-rose-600 ring-4 ring-rose-100" />
      </span>
      <div className="text-xs font-bold uppercase tracking-widest text-rose-600">
        Today{days !== null && <span className="ml-2 font-semibold normal-case tracking-normal text-stone-400 tabular-nums">day {days.toLocaleString()}</span>}
      </div>
    </div>
  );
}
