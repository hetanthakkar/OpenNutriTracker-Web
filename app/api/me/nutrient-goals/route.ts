import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";
import { nutrientDefinitions, nutritionGoalKeys } from "@/lib/nutrition-targets";
import { ensureNutrientDefinitions } from "@/lib/nutrient-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TargetRow = { nutrient_code: string; target_value: string | null };

async function targetsFor(profileId: string) {
  const result = await databaseQuery<TargetRow>(
    `SELECT nutrient_code, target_value::text FROM food_catalog.app.profile_nutrient_targets
     WHERE profile_id=$1`,
    [profileId],
  );
  return Object.fromEntries(result.rows.flatMap((row) => row.target_value === null ? [] : [[row.nutrient_code, Number(row.target_value)]]));
}

export async function GET(request: NextRequest) {
  try {
    const user = await getOrCreateCurrentUser(request);
    await ensureNutrientDefinitions();
    return attachCurrentUserCookie(NextResponse.json({ goals: await targetsFor(user.profileId) }), user);
  } catch (error) {
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Nutrient goals storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  let body: { goals?: unknown };
  try { body = await request.json() as { goals?: unknown }; }
  catch { return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 }); }
  if (!body.goals || typeof body.goals !== "object" || Array.isArray(body.goals)
    || Object.entries(body.goals as Record<string, unknown>).some(([key, value]) => !nutritionGoalKeys.includes(key)
      || typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 100000)) {
    return NextResponse.json({ message: "Invalid nutrient goals." }, { status: 400 });
  }

  try {
    const user = await getOrCreateCurrentUser(request);
    await ensureNutrientDefinitions();
    for (const [code, value] of Object.entries(body.goals as Record<string, number>)) {
      const definition = nutrientDefinitions.find((item) => item.code === code)!;
      await databaseQuery(
        `INSERT INTO food_catalog.app.profile_nutrient_targets (profile_id,nutrient_code,target_value,target_kind)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (profile_id,nutrient_code) DO UPDATE SET target_value=excluded.target_value,target_kind=excluded.target_kind`,
        [user.profileId, code, value, definition.targetKind],
      );
    }
    return attachCurrentUserCookie(NextResponse.json({ goals: await targetsFor(user.profileId) }), user);
  } catch (error) {
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Nutrient goals storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
