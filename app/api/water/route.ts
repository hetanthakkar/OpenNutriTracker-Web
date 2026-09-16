import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// CockroachDB returns DECIMAL values as strings through `pg` by default.
type WaterRow = { id: string; amount_ml: string | number; logged_at: string };
type CreateWaterInput = { amountMl?: unknown; loggedAt?: unknown; diaryDate?: unknown };

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

/** List the current browser profile's water entries for one UTC calendar day. */
export async function GET(request: NextRequest) {
  const range = dateRange(request.nextUrl.searchParams.get("date"));
  if (!range) return NextResponse.json({ message: "date must use YYYY-MM-DD." }, { status: 400 });

  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<WaterRow>(
      `SELECT id, amount_ml, logged_at::text
       FROM food_catalog.app.water_entries
       WHERE profile_id = $1 AND diary_date = $2
       ORDER BY logged_at ASC, created_at ASC`,
      [user.profileId, range.date],
    );
    const entries = result.rows.map((entry) => ({ id: entry.id, amountMl: Number(entry.amount_ml), loggedAt: entry.logged_at }));
    return attachCurrentUserCookie(NextResponse.json({
      date: range.date,
      totalMl: entries.reduce((total, entry) => total + entry.amountMl, 0),
      entries,
    }), user);
  } catch (error) {
    console.error("Read water entries failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Water storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}

/** Add one water entry to the current browser profile. */
export async function POST(request: NextRequest) {
  let input: CreateWaterInput;
  try {
    input = await request.json() as CreateWaterInput;
  } catch {
    return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 });
  }

  const amountMl = typeof input.amountMl === "number" ? input.amountMl : Number(input.amountMl);
  const loggedAt = parseLoggedAt(input.loggedAt);
  const diaryDate = typeof input.diaryDate === "string" ? input.diaryDate : loggedAt?.toISOString().slice(0, 10);
  if (!Number.isInteger(amountMl) || amountMl < 1 || amountMl > 5000 || !loggedAt || !dateRange(diaryDate ?? null)) {
    return NextResponse.json({ message: "amountMl must be a whole number from 1 to 5000." }, { status: 400 });
  }

  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<WaterRow>(
      `INSERT INTO food_catalog.app.water_entries (user_id, profile_id, diary_date, amount_ml, logged_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, amount_ml, logged_at::text`,
      [user.id, user.profileId, diaryDate, amountMl, loggedAt.toISOString()],
    );
    const entry = result.rows[0];
    return attachCurrentUserCookie(NextResponse.json({ id: entry.id, amountMl: Number(entry.amount_ml), loggedAt: entry.logged_at }, { status: 201 }), user);
  } catch (error) {
    console.error("Create water entry failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Water storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
