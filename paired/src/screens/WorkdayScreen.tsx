import { useEffect, useMemo, useState } from "react";
import {
  BellOff, Briefcase, CalendarDays, ChevronLeft, Clock, Eye, MessageSquareHeart,
  Sandwich, Sun, type LucideIcon,
} from "lucide-react";
import { shiftSchedule as shiftsApi } from "../api";
import { useAuth } from "../auth";
import { invalidate, keys, useQuery } from "../query";
import { Button, Card, GhostButton, Screen, Spinner, Textarea } from "../ui";
import {
  AUTO_HINTS, DAY_LABELS, DAY_ORDER, DEFAULT_SCHEDULE, MESSAGE_LABELS, MESSAGE_ORDER,
  MESSAGE_SHORT, SHIFT_LABELS, SHIFT_ORDER, TIME_FIELD, sendTime, timezoneOptions, weeklyCount,
  type DayAssignment, type DayKey, type MessageKey, type ShiftConfig, type ShiftKey,
  type ShiftSchedule,
} from "../shifts";

/**
 * Workday reminders.
 *
 * You describe your partner's working week — which shift each day, when it runs
 * — and three small reminders ride along with it: pack your lunch, hope your day
 * is going well, take your lens out. They land on *their* phone, on their own
 * clock, without either of you having to remember.
 *
 * Times are wall-clock in the schedule's timezone, so a shift entered once
 * survives DST. The send times shown come from the server (`send_times`) where
 * there is one, and from the same local arithmetic while an edit is unsaved —
 * so the numbers move under your finger as you drag a shift's hours.
 */

const MESSAGE_ICONS: Record<MessageKey, LucideIcon> = {
  lunch: Sandwich,
  greeting: Sun,
  lens: Eye,
};

export default function WorkdayScreen({ onBack }: { onBack: () => void }) {
  const { me } = useAuth();
  const { data, loading } = useQuery(keys.shiftSchedule, shiftsApi.get);

  // The editor is a local draft: the whole config saves as one action, so the
  // week grid and three shifts can be rearranged without a request per tap.
  const [draft, setDraft] = useState<ShiftSchedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState<MessageKey | "">("");

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const schedule = draft ?? data ?? null;
  const partnerName = schedule?.recipient_name || me?.partner?.display_name || "your partner";
  const dirty = useMemo(
    () => !!(draft && data) && JSON.stringify(stripped(draft)) !== JSON.stringify(stripped(data)),
    [draft, data],
  );

  const patch = (part: Partial<ShiftSchedule>) => {
    setStatus("");
    setDraft((d) => (d ? { ...d, ...part } : d));
  };
  const patchShift = (key: ShiftKey, part: Partial<ShiftConfig>) =>
    setDraft((d) => {
      if (!d) return d;
      setStatus("");
      return { ...d, shifts: { ...d.shifts, [key]: { ...d.shifts[key], ...part } } };
    });

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setStatus("");
    try {
      await shiftsApi.save({
        enabled: draft.enabled,
        timezone: draft.timezone,
        shifts: draft.shifts,
        week: draft.week,
        messages: draft.messages,
      });
      invalidate(keys.shiftSchedule);
      setStatus("Saved.");
    } catch {
      setStatus("Couldn't save — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const sendNow = async (key: MessageKey) => {
    if (!draft) return;
    setSending(key);
    setStatus("");
    try {
      const result = await shiftsApi.sendNow({ text: draft.messages[key] });
      setStatus(
        result.push
          ? `Sent to ${result.to}.`
          : `${result.to} won't see it — they haven't turned notifications on.`,
      );
    } catch {
      setStatus("Couldn't send it just now.");
    } finally {
      setSending("");
    }
  };

  const header = (
    <div className="flex items-center gap-3 pt-2 pb-3">
      <button onClick={onBack} aria-label="Back" className="text-rose-600">
        <ChevronLeft className="h-6 w-6" />
      </button>
      <h1 className="flex items-center gap-2 text-xl font-bold text-stone-800">
        <Briefcase className="h-5 w-5 text-rose-500" /> Workday
      </h1>
    </div>
  );

  if (loading && !schedule) {
    return (
      <Screen header={header}>
        <Spinner />
      </Screen>
    );
  }

  const s = schedule ?? DEFAULT_SCHEDULE;
  const perWeek = weeklyCount(s);

  return (
    <Screen header={header}>
      {/* Master switch. Everything below stays editable while it's off — turning
          it back on shouldn't mean re-entering a week of shifts. */}
      <Card className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-stone-800">Reminders for {partnerName}</div>
            <p className="mt-0.5 text-xs text-stone-400">
              {!s.enabled
                ? "Off — nothing is being sent."
                : perWeek === 0
                  ? "On, but every day is off or every reminder is silenced."
                  : `${perWeek} reminder${perWeek === 1 ? "" : "s"} a week, on their clock.`}
            </p>
          </div>
          <Switch on={s.enabled} label="Workday reminders" onClick={() => patch({ enabled: !s.enabled })} />
        </div>
      </Card>

      {!s.recipient_name ? (
        <Card className="mb-3 border-rose-100 bg-rose-50/60">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-500">
              <BellOff className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-stone-800">Pair up first</div>
              <p className="mt-1 text-sm text-stone-500">
                These reminders go to your partner, so there's nowhere to send them yet. Set the
                week up anyway — it'll start working the moment you're paired.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        s.enabled &&
        !s.recipient_reachable && (
          <Card className="mb-3 border-amber-100 bg-amber-50/70">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-600">
                <BellOff className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-stone-800">
                  {s.recipient_name} won't get these yet
                </div>
                <p className="mt-1 text-sm text-stone-500">
                  Their phone hasn't turned notifications on — or they've silenced workday
                  reminders in their own settings. Nothing here will reach them until they do.
                </p>
              </div>
            </div>
          </Card>
        )
      )}

      {/* The week. Assigning a shift per day is the whole model — everything else
          is that shift's detail. */}
      <SectionRule label="Their week" Icon={CalendarDays} />
      <Card className="mb-3">
        <div className="divide-y divide-stone-100">
          {DAY_ORDER.map((day) => (
            <div key={day} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-sm text-stone-700">{DAY_LABELS[day]}</span>
              <select
                value={s.week[day]}
                onChange={(e) => patch({ week: { ...s.week, [day]: e.target.value as DayAssignment } })}
                className={`rounded-xl border px-3 py-2 text-sm outline-none focus:border-rose-400 ${
                  s.week[day] === "off"
                    ? "border-stone-200 bg-stone-50 text-stone-400"
                    : "border-stone-200 bg-surface text-stone-800"
                }`}
              >
                <option value="off">Off</option>
                {SHIFT_ORDER.map((key) => (
                  <option key={key} value={key}>
                    {SHIFT_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </Card>

      {/* Shift hours + which reminders each one carries. */}
      <SectionRule label="Shifts" Icon={Clock} />
      {SHIFT_ORDER.map((key) => (
        <ShiftCard
          key={key}
          shiftKey={key}
          shift={s.shifts[key]}
          /** Days pointing at this shift — the reason to care about it. */
          days={DAY_ORDER.filter((d) => s.week[d] === key)}
          /** Server times while clean, local arithmetic while editing. */
          serverTimes={dirty ? undefined : s.send_times[key]}
          onChange={(part) => patchShift(key, part)}
        />
      ))}

      <Card className="mb-3">
        <label className="block text-xs font-medium text-stone-500">
          Their timezone
          <select
            value={s.timezone}
            onChange={(e) => patch({ timezone: e.target.value })}
            className="mt-1.5 w-full rounded-xl border border-stone-200 bg-surface px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-rose-400"
          >
            {timezoneOptions(s.timezone).map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-xs text-stone-400">
          Every time above is read in this zone, so the reminders stay put when the clocks change.
        </p>
      </Card>

      {/* What each reminder says. "Send now" is how you check the whole chain
          works without waiting for a shift. */}
      <SectionRule label="What they'll read" Icon={MessageSquareHeart} />
      <Card className="mb-3">
        <div className="flex flex-col gap-5">
          {MESSAGE_ORDER.map((key) => {
            const Icon = MESSAGE_ICONS[key];
            return (
              <div key={key}>
                <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-stone-700">
                  <Icon className="h-4 w-4 text-rose-500" /> {MESSAGE_LABELS[key]}
                </label>
                <Textarea
                  value={s.messages[key]}
                  minRows={2}
                  onChange={(e) => patch({ messages: { ...s.messages, [key]: e.target.value } })}
                  className="!py-2.5 text-sm"
                />
                <button
                  onClick={() => sendNow(key)}
                  disabled={sending !== "" || !s.messages[key].trim() || !s.recipient_name}
                  className="mt-1.5 rounded-xl border border-rose-100 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition active:scale-95 disabled:opacity-50"
                >
                  {sending === key ? "Sending…" : "Send now"}
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      {status && (
        <p className="pb-2 text-center text-sm text-stone-500" role="status">
          {status}
        </p>
      )}

      {/* Save sits at the end of the page rather than pinned: this screen is a
          form you work through, and a floating bar would cover the message
          fields exactly when the keyboard is up. */}
      <div className="mt-auto pb-6 pt-2">
        {dirty ? (
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save workday"}
          </Button>
        ) : (
          <GhostButton onClick={onBack}>Done</GhostButton>
        )}
      </div>
    </Screen>
  );
}

/** The parts a save actually carries — what "unsaved changes" is measured on. */
function stripped(s: ShiftSchedule) {
  return { enabled: s.enabled, timezone: s.timezone, shifts: s.shifts, week: s.week, messages: s.messages };
}

// --------------------------------------------------------------------------- //
function ShiftCard({
  shiftKey,
  shift,
  days,
  serverTimes,
  onChange,
}: {
  shiftKey: ShiftKey;
  shift: ShiftConfig;
  days: DayKey[];
  serverTimes?: Record<MessageKey, string>;
  onChange: (part: Partial<ShiftConfig>) => void;
}) {
  const unused = days.length === 0;

  return (
    <Card className={`mb-3 ${unused ? "opacity-70" : ""}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-stone-800">{SHIFT_LABELS[shiftKey]}</div>
          <p className="mt-0.5 text-xs text-stone-400">
            {unused ? "No days assigned" : days.map((d) => DAY_LABELS[d].slice(0, 3)).join(" · ")}
          </p>
        </div>
        <Switch
          on={shift.enabled}
          label={SHIFT_LABELS[shiftKey]}
          onClick={() => onChange({ enabled: !shift.enabled })}
        />
      </div>

      <div className="mb-3 flex gap-3">
        <TimeField
          label="Starts"
          value={shift.start}
          onChange={(start) => onChange({ start })}
          disabled={!shift.enabled}
        />
        <TimeField
          label="Ends"
          value={shift.end}
          onChange={(end) => onChange({ end })}
          disabled={!shift.enabled}
        />
      </div>

      <div className="divide-y divide-stone-100 border-t border-stone-100">
        {MESSAGE_ORDER.map((key) => {
          const on = shift[key];
          const Icon = MESSAGE_ICONS[key];
          // Local arithmetic while there are unsaved edits, so the time follows
          // the hours you're dragging; the server's answer once it's settled.
          const at = serverTimes?.[key] ?? sendTime(shift, key);
          // The field already shows the time — the subtitle's job is to say
          // whether it's still tracking the shift or has been pinned.
          const subtitle = !on ? "Off" : shift[TIME_FIELD[key]] ? "Custom" : AUTO_HINTS[key];
          return (
            <div key={key} className="flex items-center gap-2 py-2.5">
              <Icon className={`h-4.5 w-4.5 shrink-0 ${on ? "text-rose-500" : "text-stone-300"}`} />
              <div className="min-w-0 flex-1">
                <div
                  className={`whitespace-nowrap text-sm font-medium ${on ? "text-stone-800" : "text-stone-400"}`}
                >
                  {MESSAGE_SHORT[key]}
                </div>
                {subtitle && <div className="truncate text-xs text-stone-400">{subtitle}</div>}
              </div>
              {/* Wide enough for a 12-hour locale's "07:00 AM" — a clipped field
                  reads as a broken one. */}
              <input
                type="time"
                value={at}
                disabled={!on || !shift.enabled}
                onChange={(e) => onChange({ [TIME_FIELD[key]]: e.target.value })}
                aria-label={`${MESSAGE_LABELS[key]} time`}
                className="w-[7.75rem] shrink-0 rounded-xl border border-stone-200 bg-surface px-2 py-1.5 text-sm text-stone-800 outline-none focus:border-rose-400 disabled:opacity-40"
              />
              <Switch
                on={on}
                label={MESSAGE_LABELS[key]}
                onClick={() => onChange({ [key]: !on })}
                disabled={!shift.enabled}
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TimeField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex-1 text-xs font-medium text-stone-500">
      {label}
      <input
        type="time"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-stone-200 bg-surface px-3 py-2.5 text-sm text-stone-800 outline-none focus:border-rose-400 disabled:opacity-40"
      />
    </label>
  );
}

/** Same pill switch ProfileScreen uses, so the two settings surfaces match. */
function Switch({
  on,
  onClick,
  label,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40 ${
        on ? "bg-rose-500" : "bg-stone-200"
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
          on ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

function SectionRule({ label, Icon }: { label: string; Icon: LucideIcon }) {
  return (
    <div className="mb-2 mt-4 flex items-center gap-2 px-1">
      <Icon className="h-4 w-4 text-rose-400" />
      <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</span>
    </div>
  );
}
