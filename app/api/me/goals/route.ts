import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const levels = ["sedentary", "light", "active", "very_active"];
const goals = ["lose_weight", "maintain_weight", "gain_weight"];

function serialize(row: { activity_level: string; goal: string; weekly_rate_kg: string | null; target_weight_kg: string | null }) { return { activityLevel: row.activity_level, goal: row.goal, weeklyRateKg: row.weekly_rate_kg === null ? null : Number(row.weekly_rate_kg), targetWeightKg: row.target_weight_kg === null ? null : Number(row.target_weight_kg) }; }

export async function GET(request: NextRequest) {
  try { const user = await getOrCreateCurrentUser(request); const result = await databaseQuery<{ activity_level: string; goal: string; weekly_rate_kg: string | null; target_weight_kg: string | null }>("SELECT activity_level, goal_type AS goal, weekly_rate_kg::text, target_weight_kg::text FROM food_catalog.app.profile_goals WHERE profile_id=$1", [user.profileId]); return attachCurrentUserCookie(NextResponse.json(serialize(result.rows[0])), user); }
  catch (error) { return NextResponse.json({ message: error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Goals storage is temporarily unavailable." }, { status: 503 }); }
}

export async function PUT(request: NextRequest) {
  let body: { activityLevel?: unknown; goal?: unknown; weeklyRateKg?: unknown; targetWeightKg?: unknown }; try { body = await request.json(); } catch { return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 }); }
  const rate = body.weeklyRateKg === undefined ? undefined : body.weeklyRateKg === null ? null : Number(body.weeklyRateKg); const target = body.targetWeightKg === undefined ? undefined : body.targetWeightKg === null ? null : Number(body.targetWeightKg);
  if ((body.activityLevel !== undefined && (typeof body.activityLevel !== "string" || !levels.includes(body.activityLevel))) || (body.goal !== undefined && (typeof body.goal !== "string" || !goals.includes(body.goal))) || (rate !== undefined && rate !== null && (!Number.isFinite(rate) || rate < -2 || rate > 2)) || (target !== undefined && target !== null && (!Number.isFinite(target) || target < 20 || target > 500))) return NextResponse.json({ message: "Invalid goals update." }, { status: 400 });
  try { const user = await getOrCreateCurrentUser(request); const current = await databaseQuery<{ activity_level: string; goal: string; weekly_rate_kg: string | null; target_weight_kg: string | null }>("SELECT activity_level, goal_type AS goal, weekly_rate_kg::text, target_weight_kg::text FROM food_catalog.app.profile_goals WHERE profile_id=$1", [user.profileId]); const row = current.rows[0]; const result = await databaseQuery<typeof row>("UPDATE food_catalog.app.profile_goals SET activity_level=$1, goal_type=$2, weekly_rate_kg=$3, target_weight_kg=$4, updated_at=now() WHERE profile_id=$5 RETURNING activity_level, goal_type AS goal, weekly_rate_kg::text, target_weight_kg::text", [body.activityLevel ?? row.activity_level, body.goal ?? row.goal, rate === undefined ? row.weekly_rate_kg : rate, target === undefined ? row.target_weight_kg : target, user.profileId]); return attachCurrentUserCookie(NextResponse.json(serialize(result.rows[0])), user); }
  catch (error) { return NextResponse.json({ message: error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Goals storage is temporarily unavailable." }, { status: 503 }); }
}
