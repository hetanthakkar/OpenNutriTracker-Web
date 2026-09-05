import { API_URL } from "./config";
import type { MessageKey, ShiftSchedule as ShiftScheduleData } from "./shifts";

// --------------------------------------------------------------------------- //
// Token storage
// --------------------------------------------------------------------------- //
const ACCESS_KEY = "paired_access";
const REFRESH_KEY = "paired_refresh";

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set({ access, refresh }: { access: string; refresh?: string }) {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, data: unknown) {
    super(typeof data === "object" && data && "detail" in data ? String((data as { detail: unknown }).detail) : `HTTP ${status}`);
    this.status = status;
    this.data = data;
  }
}

// --------------------------------------------------------------------------- //
// Core request with one transparent JWT refresh + retry on 401.
// --------------------------------------------------------------------------- //
async function refreshAccess(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return false;
  const res = await fetch(`${API_URL}/api/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  tokens.set({ access: data.access, refresh: data.refresh });
  return true;
}

interface Opts {
  method?: string;
  body?: unknown;
  auth?: boolean;
  params?: Record<string, string | number | undefined>;
}

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const { method = "GET", body, auth = true, params } = opts;

  let url = `${API_URL}${path}`;
  if (params) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
    const s = q.toString();
    if (s) url += (url.includes("?") ? "&" : "?") + s;
  }

  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth && tokens.access) headers["Authorization"] = `Bearer ${tokens.access}`;
    return fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  };

  let res = await doFetch();
  if (res.status === 401 && auth && tokens.refresh) {
    if (await refreshAccess()) res = await doFetch();
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

// --------------------------------------------------------------------------- //
// Typed endpoint helpers
// --------------------------------------------------------------------------- //
export type NotifCategory = "daily" | "answers" | "messages" | "nudges" | "dates" | "notes" | "shifts";

export interface Me {
  username: string;
  email: string;
  /** True once the address was proven via an emailed code or Google. */
  email_verified: boolean;
  display_name: string;
  birth_date: string | null;
  notif_prefs: Partial<Record<NotifCategory, boolean>>;
  /** Personal nutrition targets — each key is optional. */
  nutrition_goals: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    fibre?: number;
    weight?: number;
  };
  couple_id: number | null;
  /** Shared across both partners — the day the relationship started. */
  anniversary: string | null;
  /** What the two of them call themselves. Empty until one of them names it. */
  couple_title: string;
  paired: boolean;
  partner: { display_name: string; username: string } | null;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Illustration attached to a content item's `data` payload. */
export interface MainImage {
  url?: string;
  preview?: string;
}

export interface AnswerState {
  content_type: string;
  object_id: string;
  you_answered: boolean;
  partner_answered: boolean;
  revealed: boolean;
  your_answer: { text: string; data: unknown } | null;
  partner_answer: { text: string; data: unknown } | null;
}

/** The couple's shared item for today. It's a quiz — five tap-to-rate
 *  statements — rather than a question with a blank text box, because a daily
 *  has to be answerable on a tired evening. */
export interface Daily {
  date: string;
  quiz: {
    id: string;
    title: string | null;
    topic: string | null;
    data: unknown;
    /** How many statements it holds — the hero promises this up front. */
    question_count: number;
  };
  you_answered: boolean;
  partner_answered: boolean;
  revealed: boolean;
  your_answer: { text: string; data: unknown } | null;
  partner_answer: { text: string; data: unknown } | null;
}

/** What the passwordless endpoints return: tokens plus whether this is a brand-new account. */
export interface AuthResult {
  user: Me;
  tokens: { access: string; refresh: string };
  created: boolean;
}

export const auth = {
  register: (b: { username: string; password: string; display_name?: string; email?: string }) =>
    api<{ user: Me; tokens: { access: string; refresh: string } }>("/api/auth/register/", { method: "POST", body: b, auth: false }),
  login: (b: { username: string; password: string }) =>
    api<{ access: string; refresh: string }>("/api/auth/login/", { method: "POST", body: b, auth: false }),
  requestOtp: (email: string) =>
    api<{ sent: boolean; resend_in: number }>("/api/auth/otp/request/", { method: "POST", body: { email }, auth: false }),
  verifyOtp: (b: { email: string; code: string }) =>
    api<AuthResult>("/api/auth/otp/verify/", { method: "POST", body: b, auth: false }),
  google: (id_token: string) =>
    api<AuthResult>("/api/auth/google/", { method: "POST", body: { id_token }, auth: false }),
  /** Log into the shared, pre-paired demo couple — the "explore without an account" path. */
  guest: () => api<AuthResult>("/api/auth/guest/", { method: "POST", body: {}, auth: false }),
  me: () => api<Me>("/api/me/"),
  updateName: (display_name: string) => api<Me>("/api/me/", { method: "PATCH", body: { display_name } }),
  updateMe: (body: {
    display_name?: string;
    birth_date?: string | null;
    anniversary?: string | null;
    couple_title?: string;
    notif_prefs?: Partial<Record<NotifCategory, boolean>>;
    nutrition_goals?: Partial<{ calories: number | null; protein: number | null; carbs: number | null; fat: number | null; fibre: number | null; weight: number | null }>;
  }) => api<Me>("/api/me/", { method: "PATCH", body }),
};

export const pairing = {
  create: () => api<{ code: string; expires_at: string }>("/api/pairing/create/", { method: "POST", body: {} }),
  accept: (code: string) => api<Me>("/api/pairing/accept/", { method: "POST", body: { code } }),
  unpair: () => api<Me>("/api/pairing/unpair/", { method: "POST", body: {} }),
};

export const daily = () => api<Daily>("/api/daily/");

/** Re-rolls today's question for *both* partners. 409s once either has answered. */
export const shuffleDaily = () => api<Daily>("/api/daily/shuffle/", { method: "POST", body: {} });

export const answers = {
  submit: (b: { content_type: string; object_id: string; text?: string; data?: unknown }) =>
    api<AnswerState>("/api/answers/", { method: "POST", body: b }),
  get: (content_type: string, object_id: string) =>
    api<AnswerState>("/api/answers/", { params: { content_type, object_id } }),
};

export interface BookmarkItem {
  content_type: string;
  object_id: string;
  title: string | null;
  created_at: string;
}

export const bookmarks = {
  list: (content_type?: string) => api<BookmarkItem[]>("/api/bookmarks/", { params: { content_type } }),
  check: (content_type: string, object_id: string) =>
    api<{ bookmarked: boolean }>("/api/bookmarks/", { params: { content_type, object_id } }),
  toggle: (content_type: string, object_id: string) =>
    api<{ bookmarked: boolean }>("/api/bookmarks/", { method: "POST", body: { content_type, object_id } }),
};

/** `push` is false when the partner hasn't turned notifications on — the nudge
 *  still lands in their in-app inbox, it just doesn't buzz their phone. */
export const nudge = (b: { kind?: string; message?: string; context?: unknown }) =>
  api<{ status: string; to: string; push: boolean }>("/api/nudge/", { method: "POST", body: b });

export interface NudgeTarget {
  content_type: string;
  object_id: string;
  title: string | null;
  /** Journeys only — the day the nudge came from. */
  day?: number;
}

export interface Nudge {
  id: number;
  kind: string;
  from_name: string;
  /** Ready-to-show line — the sender's message, or a default for the kind. */
  text: string;
  context: Record<string, unknown>;
  /** The item the nudge is about, if any — null for a plain "thinking of you".
   *  Journey days resolve to their journey, with `day` saying which one. */
  target: NudgeTarget | null;
  created_at: string;
  read: boolean;
}

export const nudges = {
  inbox: () => api<{ unread: number; items: Nudge[] }>("/api/nudges/"),
  markRead: () => api<{ unread: number }>("/api/nudges/", { method: "POST", body: {} }),
};

export interface ChatMessage {
  id: number;
  text: string;
  mine: boolean;
  created_at: string;
}

export const messages = {
  list: (content_type: string, object_id: string) =>
    api<{ revealed: boolean; messages: ChatMessage[] }>("/api/messages/", { params: { content_type, object_id } }),
  send: (content_type: string, object_id: string, text: string) =>
    api<ChatMessage>("/api/messages/", { method: "POST", body: { content_type, object_id, text } }),
};

export const content = {
  list: <T>(collection: string, params?: { search?: string; page?: number; topic?: string; type?: string; answered?: "true" | "false" }) =>
    // Always send the token: rows carry `you_answered`/`partner_answered`, and
    // the answered filter needs to know who's asking. Signed out, the header is
    // simply omitted and the server returns both flags as false.
    api<Paginated<T>>(`/api/${collection}/`, { params }),
  detail: <T>(collection: string, id: string) => api<T>(`/api/${collection}/${id}/`, { auth: false }),
};

// --------------------------------------------------------------------------- //
// Journeys — a couple's multi-day run: start, per-day progress, completion.
// --------------------------------------------------------------------------- //
export interface JourneyDayState {
  day: number;
  id: string;
  type: string;
  title: string | null;
  you_answered: boolean;
  partner_answered: boolean;
}

export interface JourneyState {
  paired: boolean;
  started: boolean;
  started_at: string | null;
  completed: boolean;
  completed_at: string | null;
  can_start: boolean;
  /** The couple's other active journey, when that's what blocks starting. */
  blocking_journey: { id: string; name: string } | null;
  total_days: number;
  /** The first day you haven't answered — where you pick up next. */
  your_day: number;
  partner_day: number;
  days: JourneyDayState[];
}

/** The list-row badge: this couple's run of a journey, if any. */
export interface JourneyProgress {
  completed: boolean;
  your_day: number;
  total_days: number;
}

export const journeys = {
  state: (id: string) => api<JourneyState>(`/api/journeys/${id}/state/`),
  start: (id: string) => api<JourneyState>(`/api/journeys/${id}/start/`, { method: "POST", body: {} }),
  leave: (id: string) => api<JourneyState>(`/api/journeys/${id}/leave/`, { method: "POST", body: {} }),
};

export interface Category {
  name: string;
  questions: number;
  quizzes: number;
  games: number;
  tips: number;
  total: number;
}

export const categories = () => api<Category[]>("/api/categories/", { auth: false });

export interface Activity {
  content_type: string;
  object_id: string;
  title: string | null;
  state: "your_turn" | "partner_turn" | "done";
  you_answered: boolean;
  partner_answered: boolean;
  updated_at: string;
  link_collection: string;
  link_id: string;
}

export const activity = () => api<{ partner_name: string | null; items: Activity[] }>("/api/activity/");

// --------------------------------------------------------------------------- //
// Facts — the "Us" tab: dates / favorites / other, about me, partner, or us.
// --------------------------------------------------------------------------- //
export type FactScope = "me" | "partner" | "us";
export type FactSection = "dates" | "favorites" | "other";
export type FactReminder = "none" | "monthly" | "yearly";

export interface Fact {
  id: number;
  scope: FactScope;
  section: FactSection;
  label: string;
  value: string;
  date: string | null;
  reminder: FactReminder;
  created_at: string;
}

export interface FactInput {
  scope: FactScope;
  section: FactSection;
  label: string;
  value?: string;
  date?: string | null;
  reminder?: FactReminder;
}

export const facts = {
  list: () => api<Fact[]>("/api/facts/"),
  create: (b: FactInput) => api<Fact>("/api/facts/", { method: "POST", body: b }),
  update: (id: number, b: Partial<FactInput>) => api<Fact>(`/api/facts/${id}/`, { method: "PATCH", body: b }),
  remove: (id: number) => api<null>(`/api/facts/${id}/`, { method: "DELETE" }),
};

// --------------------------------------------------------------------------- //
// Notes — the couple's shared sticky-note board on the Home tab.
// --------------------------------------------------------------------------- //
export type NoteColor = "amber" | "rose" | "sky" | "emerald" | "violet";

export interface Note {
  id: number;
  text: string;
  color: NoteColor;
  pinned: boolean;
  /** ISO date (YYYY-MM-DD). The reminder cron runs daily, so there's no time. */
  remind_on: string | null;
  /** False when the partner wrote it — both can still edit. */
  mine: boolean;
  author_name: string;
  created_at: string;
  updated_at: string;
}

export interface NoteInput {
  text: string;
  color?: NoteColor;
  pinned?: boolean;
  remind_on?: string | null;
}

export const notes = {
  list: () => api<Note[]>("/api/notes/"),
  create: (b: NoteInput) => api<Note>("/api/notes/", { method: "POST", body: b }),
  update: (id: number, b: Partial<NoteInput>) => api<Note>(`/api/notes/${id}/`, { method: "PATCH", body: b }),
  remove: (id: number) => api<null>(`/api/notes/${id}/`, { method: "DELETE" }),
};

// --------------------------------------------------------------------------- //
// Diary — the couple's shared food/exercise log, one day at a time.
// --------------------------------------------------------------------------- //
export type DiaryKind = "food" | "exercise";

export interface DiaryEntry {
  id: number;
  kind: DiaryKind;
  name: string;
  /** Food: calories eaten. Exercise: calories burned (0 when not estimated). */
  calories: number;
  /** Exercise only — how long it lasted. 0 for food. */
  minutes: number;
  /** Food only, optional macros in grams — 0 means "not tracked". */
  carbs: number;
  protein: number;
  fat: number;
  fibre: number;
  date: string;
  /** False when the partner logged it — shown but not editable by you. */
  mine: boolean;
  created_at: string;
}

/** One day's log for the whole couple, plus the partner's name for labelling. */
export interface DiaryDay {
  date: string;
  partner_name: string | null;
  entries: DiaryEntry[];
}

export interface DiaryInput {
  kind: DiaryKind;
  name: string;
  calories?: number;
  minutes?: number;
  carbs?: number;
  protein?: number;
  fat?: number;
  fibre?: number;
  /** Which day it belongs to (YYYY-MM-DD); defaults to today server-side. */
  date?: string;
}

export const diary = {
  day: (date: string) => api<DiaryDay>("/api/diary/", { params: { date } }),
  /** Your net calories per tracked day in [start, end] — the calendar's numbers.
   *  Only days you logged appear; the client treats the rest as untracked. */
  summary: (start: string, end: string) =>
    api<{ days: Record<string, number> }>("/api/diary/summary/", { params: { start, end } }),
  create: (b: DiaryInput) => api<DiaryEntry>("/api/diary/", { method: "POST", body: b }),
  update: (id: number, b: Partial<DiaryInput>) =>
    api<DiaryEntry>(`/api/diary/${id}/`, { method: "PATCH", body: b }),
  remove: (id: number) => api<null>(`/api/diary/${id}/`, { method: "DELETE" }),
};

/**
 * Workday reminders: your partner's shifts, and the little reminders that ride
 * along with them. The schedule is yours to edit; every reminder it fires lands
 * on *their* phone. Shapes live in `shifts.ts`.
 */
export const shiftSchedule = {
  get: () => api<ShiftScheduleData>("/api/shift-schedule/"),
  /** Merged server-side, so sending one shift or one switch is enough. */
  save: (b: Partial<Pick<ShiftScheduleData, "enabled" | "timezone" | "shifts" | "week" | "messages">>) =>
    api<ShiftScheduleData>("/api/shift-schedule/", { method: "PATCH", body: b }),
  /** Push one reminder to your partner right now — how you check it works. */
  sendNow: (b: { message?: MessageKey; text?: string }) =>
    api<{ sent: number; push: boolean; to: string }>("/api/shift-schedule/send/", {
      method: "POST",
      body: b,
    }),
};
