import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WaterInput = { amountMl?: unknown; loggedAt?: unknown; diaryDate?: unknown };

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
  if (!validId(id)) return NextResponse.json({ message: "Invalid water entry id." }, { status: 400 });
  let input: WaterInput;
  try { input = await request.json() as WaterInput; }
  catch { return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 }); }
  const amountMl = typeof input.amountMl === "number" ? input.amountMl : Number(input.amountMl);
  const loggedAt = typeof input.loggedAt === "string" ? new Date(input.loggedAt) : null;
  if (!Number.isInteger(amountMl) || amountMl < 1 || amountMl > 5000 || !loggedAt || Number.isNaN(loggedAt.getTime()) || !validDate(input.diaryDate)) {
    return NextResponse.json({ message: "Provide a whole water amount from 1 to 5000, a valid timestamp, and diary date." }, { status: 400 });
  }
  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<{ id: string; amount_ml: string; logged_at: string }>(
      `UPDATE food_catalog.app.water_entries SET amount_ml=$1, logged_at=$2, diary_date=$3
       WHERE id=$4 AND profile_id=$5 RETURNING id,amount_ml::text,logged_at::text`,
      [amountMl, loggedAt.toISOString(), input.diaryDate, id, user.profileId],
    );
    const entry = result.rows[0];
    if (!entry) return attachCurrentUserCookie(NextResponse.json({ message: "Water entry not found." }, { status: 404 }), user);
    return attachCurrentUserCookie(NextResponse.json({ id: entry.id, amountMl: Number(entry.amount_ml), loggedAt: entry.logged_at, diaryDate: input.diaryDate }), user);
  } catch (error) {
    console.error("Update water entry failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Water storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}

/** Delete one water entry belonging to the current browser profile. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message: "Invalid water entry id." }, { status: 400 });

  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<{ id: string }>(
      "DELETE FROM food_catalog.app.water_entries WHERE id = $1 AND profile_id = $2 RETURNING id",
      [id, user.profileId],
    );
    if (!result.rows[0]) return attachCurrentUserCookie(NextResponse.json({ message: "Water entry not found." }, { status: 404 }), user);
    return attachCurrentUserCookie(new NextResponse(null, { status: 204 }), user);
  } catch (error) {
    console.error("Delete water entry failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Water storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
