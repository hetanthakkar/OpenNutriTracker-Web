import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ActivityRow = { id: string; activity_name: string; duration_minutes: number; energy_kcal: string; logged_at: string };
type CreateActivityInput = { name?: unknown; durationMinutes?: unknown; energyKcal?: unknown; loggedAt?: unknown; diaryDate?: unknown };

function dateRange(value: string | null): { date: string; start: Date; end: Date } | null {
  const date = value ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== date) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { date, start, end };
}

function parseLoggedAt(value: unknown): Date | null {
  if (value === undefined) return new Date();
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** List the current browser profile's activity entries for one UTC calendar day. */
export async function GET(request: NextRequest) {
  const range = dateRange(request.nextUrl.searchParams.get("date"));
  if (!range) return NextResponse.json({ message: "date must use YYYY-MM-DD." }, { status: 400 });

  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<ActivityRow>(
      `SELECT id, activity_name, duration_minutes, energy_kcal::text, logged_at::text
       FROM food_catalog.app.activity_entries
       WHERE profile_id = $1 AND diary_date = $2
       ORDER BY logged_at ASC, created_at ASC`,
      [user.profileId, range.date],
    );
    const entries = result.rows.map((entry) => ({
      id: entry.id, name: entry.activity_name, durationMinutes: entry.duration_minutes,
      energyKcal: Number(entry.energy_kcal), loggedAt: entry.logged_at,
    }));
    return attachCurrentUserCookie(NextResponse.json({
      date: range.date,
      totalEnergyKcal: entries.reduce((total, entry) => total + entry.energyKcal, 0),
      entries,
    }), user);
  } catch (error) {
    console.error("Read activity entries failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Activity storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}

/** Create one activity entry for the current browser profile. */
export async function POST(request: NextRequest) {
  let input: CreateActivityInput;
  try {
    input = await request.json() as CreateActivityInput;
  } catch {
    return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 });
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const durationMinutes = typeof input.durationMinutes === "number" ? input.durationMinutes : Number(input.durationMinutes);
  const energyKcal = typeof input.energyKcal === "number" ? input.energyKcal : Number(input.energyKcal);
  const loggedAt = parseLoggedAt(input.loggedAt);
  const diaryDate = typeof input.diaryDate === "string" ? input.diaryDate : loggedAt?.toISOString().slice(0, 10);
  if (!name || name.length > 100 || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440 || !Number.isFinite(energyKcal) || energyKcal < 0 || energyKcal > 20000 || !loggedAt || !dateRange(diaryDate ?? null)) {
    return NextResponse.json({ message: "Invalid activity entry." }, { status: 400 });
  }

  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<ActivityRow>(
      `INSERT INTO food_catalog.app.activity_entries (user_id, profile_id, diary_date, activity_name, duration_minutes, energy_kcal, logged_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, activity_name, duration_minutes, energy_kcal::text, logged_at::text`,
      [user.id, user.profileId, diaryDate, name, durationMinutes, energyKcal, loggedAt.toISOString()],
    );
    const entry = result.rows[0];
    return attachCurrentUserCookie(NextResponse.json({
      id: entry.id, name: entry.activity_name, durationMinutes: entry.duration_minutes,
      energyKcal: Number(entry.energy_kcal), loggedAt: entry.logged_at,
    }, { status: 201 }), user);
  } catch (error) {
    console.error("Create activity entry failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Activity storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
