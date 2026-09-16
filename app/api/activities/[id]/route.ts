import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ActivityInput = { name?: unknown; durationMinutes?: unknown; energyKcal?: unknown; loggedAt?: unknown; diaryDate?: unknown };

function validId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message: "Invalid activity entry id." }, { status: 400 });
  let input: ActivityInput;
  try { input = await request.json() as ActivityInput; }
  catch { return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 }); }
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const durationMinutes = typeof input.durationMinutes === "number" ? input.durationMinutes : Number(input.durationMinutes);
  const energyKcal = typeof input.energyKcal === "number" ? input.energyKcal : Number(input.energyKcal);
  const loggedAt = typeof input.loggedAt === "string" ? new Date(input.loggedAt) : null;
  if (!name || name.length > 100 || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440 || !Number.isFinite(energyKcal) || energyKcal < 0 || energyKcal > 20000 || !loggedAt || Number.isNaN(loggedAt.getTime()) || !validDate(input.diaryDate)) {
    return NextResponse.json({ message: "Invalid activity entry." }, { status: 400 });
  }
  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<{ id: string; activity_name: string; duration_minutes: number; energy_kcal: string; logged_at: string }>(
      `UPDATE food_catalog.app.activity_entries SET activity_name=$1,duration_minutes=$2,energy_kcal=$3,logged_at=$4,diary_date=$5
       WHERE id=$6 AND profile_id=$7 RETURNING id,activity_name,duration_minutes,energy_kcal::text,logged_at::text`,
      [name, durationMinutes, energyKcal, loggedAt.toISOString(), input.diaryDate, id, user.profileId],
    );
    const entry = result.rows[0];
    if (!entry) return attachCurrentUserCookie(NextResponse.json({ message: "Activity entry not found." }, { status: 404 }), user);
    return attachCurrentUserCookie(NextResponse.json({ id: entry.id, name: entry.activity_name, durationMinutes: entry.duration_minutes, energyKcal: Number(entry.energy_kcal), loggedAt: entry.logged_at, diaryDate: input.diaryDate }), user);
  } catch (error) {
    console.error("Update activity entry failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Activity storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}

/** Delete one activity entry belonging to the current browser profile. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message: "Invalid activity entry id." }, { status: 400 });

  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<{ id: string }>(
      "DELETE FROM food_catalog.app.activity_entries WHERE id = $1 AND profile_id = $2 RETURNING id",
      [id, user.profileId],
    );
    if (!result.rows[0]) return attachCurrentUserCookie(NextResponse.json({ message: "Activity entry not found." }, { status: 404 }), user);
    return attachCurrentUserCookie(new NextResponse(null, { status: 204 }), user);
  } catch (error) {
    console.error("Delete activity entry failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Activity storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
