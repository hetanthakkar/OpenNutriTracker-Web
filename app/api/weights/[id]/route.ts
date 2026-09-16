import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WeightInput = { weightKg?: unknown; recordedAt?: unknown };

function validId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message: "Invalid weight entry id." }, { status: 400 });
  let input: WeightInput;
  try { input = await request.json() as WeightInput; }
  catch { return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 }); }
  const weightKg = typeof input.weightKg === "number" ? input.weightKg : Number(input.weightKg);
  const recordedAt = typeof input.recordedAt === "string" ? new Date(input.recordedAt) : null;
  if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 500 || !recordedAt || Number.isNaN(recordedAt.getTime())) {
    return NextResponse.json({ message: "Provide a weight between 20 and 500 and a valid timestamp." }, { status: 400 });
  }
  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<{ id: string; weight_kg: string; recorded_at: string }>(
      `UPDATE food_catalog.app.weight_entries SET weight_kg=$1,recorded_at=$2
       WHERE id=$3 AND profile_id=$4 RETURNING id,weight_kg::text,recorded_at::text`,
      [weightKg, recordedAt.toISOString(), id, user.profileId],
    );
    const entry = result.rows[0];
    if (!entry) return attachCurrentUserCookie(NextResponse.json({ message: "Weight entry not found." }, { status: 404 }), user);
    return attachCurrentUserCookie(NextResponse.json({ id: entry.id, weightKg: Number(entry.weight_kg), recordedAt: entry.recorded_at }), user);
  } catch (error) {
    console.error("Update weight entry failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Weight storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}

/** Delete one weight entry belonging to the current browser profile. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message: "Invalid weight entry id." }, { status: 400 });

  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<{ id: string }>(
      "DELETE FROM food_catalog.app.weight_entries WHERE id = $1 AND profile_id = $2 RETURNING id",
      [id, user.profileId],
    );
    if (!result.rows[0]) return attachCurrentUserCookie(NextResponse.json({ message: "Weight entry not found." }, { status: 404 }), user);
    return attachCurrentUserCookie(new NextResponse(null, { status: 204 }), user);
  } catch (error) {
    console.error("Delete weight failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Weight storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
