import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WeightRow = { id: string; weight_kg: string; recorded_at: string };
type CreateWeightInput = { weightKg?: unknown; recordedAt?: unknown };

function parseRecordedAt(value: unknown): Date | null {
  if (value === undefined) return new Date();
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Return the latest weight recorded by the current browser profile. */
export async function GET(request: NextRequest) {
  const parsedLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "1", 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 1;
  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<WeightRow>(
      `SELECT id, weight_kg::text, recorded_at::text
       FROM food_catalog.app.weight_entries
       WHERE profile_id = $1
       ORDER BY recorded_at DESC, created_at DESC
       LIMIT $2`,
      [user.profileId, limit],
    );
    const entry = result.rows[0];
    return attachCurrentUserCookie(NextResponse.json({
      latest: entry ? { id: entry.id, weightKg: Number(entry.weight_kg), recordedAt: entry.recorded_at } : null,
      entries: result.rows.map((row) => ({ id: row.id, weightKg: Number(row.weight_kg), recordedAt: row.recorded_at })),
    }), user);
  } catch (error) {
    console.error("Read weight failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Weight storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}

/** Record a weight for the current browser profile. */
export async function POST(request: NextRequest) {
  let input: CreateWeightInput;
  try {
    input = await request.json() as CreateWeightInput;
  } catch {
    return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 });
  }

  const weightKg = typeof input.weightKg === "number" ? input.weightKg : Number(input.weightKg);
  const recordedAt = parseRecordedAt(input.recordedAt);
  if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 500 || !recordedAt) {
    return NextResponse.json({ message: "weightKg must be between 20 and 500." }, { status: 400 });
  }

  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<WeightRow>(
      `INSERT INTO food_catalog.app.weight_entries (user_id, profile_id, weight_kg, recorded_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, weight_kg::text, recorded_at::text`,
      [user.id, user.profileId, weightKg, recordedAt.toISOString()],
    );
    const entry = result.rows[0];
    return attachCurrentUserCookie(NextResponse.json({
      id: entry.id, weightKg: Number(entry.weight_kg), recordedAt: entry.recorded_at,
    }, { status: 201 }), user);
  } catch (error) {
    console.error("Create weight failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Weight storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
