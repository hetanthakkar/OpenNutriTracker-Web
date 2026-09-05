/**
 * Workday reminders — the client's copy of the schedule's vocabulary.
 *
 * Mirrors `backend/couples/shifts.py`. The *authoritative* send times come back
 * from the server as `send_times`, so nothing here has to be kept in lockstep
 * for the reminders to fire correctly. What lives here is what the editor needs
 * before a save round-trips: the labels, the ordering, and the same smart
 * defaults, so dragging a shift's hours moves the reminder times under the
 * user's finger instead of after a save.
 */

export type ShiftKey = "morning" | "middle" | "evening";
export type MessageKey = "lunch" | "greeting" | "lens";
export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type DayAssignment = ShiftKey | "off";

export interface ShiftConfig {
  enabled: boolean;
  /** "HH:MM" — when the shift starts and ends. */
  start: string;
  end: string;
  /** Whether each reminder is sent at all. */
  lunch: boolean;
  greeting: boolean;
  lens: boolean;
  /** Always explicit — there's no sensible default for "take your lens out". */
  lens_time: string;
  /** Pinned send times. Null/absent means "follow the shift" (see `sendTime`). */
  lunch_time?: string | null;
  greeting_time?: string | null;
}

export interface ShiftSchedule {
  enabled: boolean;
  timezone: string;
  shifts: Record<ShiftKey, ShiftConfig>;
  week: Record<DayKey, DayAssignment>;
  messages: Record<MessageKey, string>;
  /** The partner these reminders go to; null when unpaired. */
  recipient_name: string | null;
  /** False when a reminder wouldn't actually land — no device, or they silenced
   *  the category on their own phone. */
  recipient_reachable: boolean;
  /** Server-resolved "HH:MM" per shift per message. */
  send_times: Record<string, Record<MessageKey, string>>;
  updated_at: string | null;
}

export const SHIFT_ORDER: ShiftKey[] = ["morning", "middle", "evening"];
export const SHIFT_LABELS: Record<ShiftKey, string> = {
  morning: "Morning shift",
  middle: "Middle shift",
  evening: "Evening shift",
};

export const DAY_ORDER: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};
/** For the week strip, where there's only room for a letter or two. */
export const DAY_SHORT: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

export const MESSAGE_ORDER: MessageKey[] = ["lunch", "greeting", "lens"];
export const MESSAGE_LABELS: Record<MessageKey, string> = {
  lunch: "Lunch reminder",
  greeting: "Have a great day",
  lens: "Take off lens",
};
/** For the shift rows, where a label shares 390px with a time field and a
 *  switch — the full labels wrap there. */
export const MESSAGE_SHORT: Record<MessageKey, string> = {
  lunch: "Lunch",
  greeting: "Good day",
  lens: "Lens",
};
/**
 * Where an unpinned time comes from, so nobody has to wonder why lunch is at
 * 07:00. Shown only while the time is still following the shift — once it's
 * pinned, the number in the field is the whole story.
 */
export const AUTO_HINTS: Record<MessageKey, string> = {
  lunch: "2h before start",
  greeting: "Mid-shift",
  lens: "",
};

/** Which field pins each reminder's time. */
export const TIME_FIELD: Record<MessageKey, "lunch_time" | "greeting_time" | "lens_time"> = {
  lunch: "lunch_time", greeting: "greeting_time", lens: "lens_time",
};

export const DEFAULT_SCHEDULE: ShiftSchedule = {
  enabled: false,
  timezone: "Europe/Istanbul",
  shifts: {
    morning: { enabled: true, start: "07:30", end: "16:00", lens_time: "15:30", lunch: true, greeting: true, lens: true },
    middle: { enabled: true, start: "11:30", end: "20:00", lens_time: "19:30", lunch: true, greeting: true, lens: true },
    evening: { enabled: true, start: "13:30", end: "22:00", lens_time: "21:30", lunch: true, greeting: true, lens: true },
  },
  week: {
    mon: "morning", tue: "morning", wed: "morning", thu: "morning",
    fri: "morning", sat: "morning", sun: "off",
  },
  messages: {
    lunch: "Don't forget your lunch",
    greeting: "I hope your day is going great",
    lens: "Please take off your lens",
  },
  recipient_name: null,
  recipient_reachable: false,
  send_times: {},
  updated_at: null,
};

// --------------------------------------------------------------------------- //
// Time helpers — the same arithmetic as couples/shifts.py.
// --------------------------------------------------------------------------- //
export const toMinutes = (hhmm: string): number => {
  const [h, m] = (hhmm || "").split(":");
  return (Number(h) || 0) * 60 + (Number(m) || 0);
};

export const fromMinutes = (total: number): string => {
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
};

/**
 * When `key` fires for `shift`. A pinned time wins; otherwise lunch lands two
 * hours before the start and the greeting at the shift's midpoint — clamped to
 * the same day, matching the server, so an early shift's lunch reminder can't
 * slide onto the previous evening.
 */
export function sendTime(shift: ShiftConfig, key: MessageKey): string {
  const pinned = shift[TIME_FIELD[key]];
  if (pinned) return pinned;
  if (key === "lunch") return fromMinutes(Math.max(0, toMinutes(shift.start) - 120));
  if (key === "greeting") return fromMinutes(Math.floor((toMinutes(shift.start) + toMinutes(shift.end)) / 2));
  return shift.lens_time;
}

/** How many reminders a whole week actually carries — the one-line summary. */
export function weeklyCount(schedule: ShiftSchedule): number {
  return DAY_ORDER.reduce((total, day) => {
    const assigned = schedule.week[day];
    if (assigned === "off") return total;
    const shift = schedule.shifts[assigned];
    if (!shift?.enabled) return total;
    return total + MESSAGE_ORDER.filter((k) => shift[k]).length;
  }, 0);
}

/**
 * The timezones offered in the picker: a short list of the ones this app's users
 * actually work in, plus whatever the browser reports and whatever the schedule
 * is already set to — so a saved zone is never silently dropped by the picker.
 */
export function timezoneOptions(current: string): string[] {
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const common = [
    "Europe/Istanbul", "Europe/London", "Europe/Berlin", "Asia/Kolkata",
    "Asia/Dubai", "America/New_York", "America/Chicago", "America/Los_Angeles", "UTC",
  ];
  return [...new Set([current, local, ...common].filter(Boolean))];
}
