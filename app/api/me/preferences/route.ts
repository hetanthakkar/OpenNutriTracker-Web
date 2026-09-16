import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Preferences = Record<string, string | number | boolean>;
type PreferenceRow = { preferences: Preferences };

const stringKeys = new Set(["foodUnits", "heightUnits", "weightUnits", "energyUnits", "waterUnit", "dayStart", "theme", "accent", "language", "notificationTime"]);
const booleanKeys = new Set(["showActivity", "showMacros", "showMicros", "notifications",
  "homeQuickStats", "homeEnergy", "homeScores", "homeMeals", "homeStreak", "homeActivity", "homeHabits", "homeTargets", "onboardingComplete", "appleHealthEnabled"]);
const numberLimits: Record<string, [number, number]> = {
  calorieAdjustment: [-500, 500], carbs: [5, 80], fat: [5, 60], protein: [5, 60],
  breakfast: [0, 100], lunch: [0, 100], dinner: [0, 100], snack: [0, 100],
  waterQuickAddMl: [10, 5000],
};

function validPreferences(value: unknown): value is Preferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (stringKeys.has(key)) {
      if (typeof entry !== "string" || entry.length > 100) return false;
      if (key === "waterUnit" && entry !== "ml" && entry !== "fl_oz") return false;
      if (key === "notificationTime" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(entry)) return false;
      continue;
    }
    if (booleanKeys.has(key)) {
      if (typeof entry !== "boolean") return false;
      continue;
    }
    const limit = numberLimits[key];
    if (!limit || typeof entry !== "number" || !Number.isFinite(entry) || entry < limit[0] || entry > limit[1]) return false;
  }
  return JSON.stringify(value).length <= 12_000;
}

async function preferencesFor(userId: string) {
  await databaseQuery("INSERT INTO food_catalog.app.user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
  const result = await databaseQuery<PreferenceRow>("SELECT preferences FROM food_catalog.app.user_preferences WHERE user_id = $1", [userId]);
  return result.rows[0]?.preferences ?? {};
}

/** Read saved UI preferences for the current browser profile. */
export async function GET(request: NextRequest) {
  try {
    const user = await getOrCreateCurrentUser(request);
    return attachCurrentUserCookie(NextResponse.json({ preferences: await preferencesFor(user.id) }), user);
  } catch (error) {
    console.error("Read preferences failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Preferences storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}

/** Merge valid UI preference changes into the current browser profile. */
export async function PUT(request: NextRequest) {
  let body: { preferences?: unknown };
  try {
    body = await request.json() as { preferences?: unknown };
  } catch {
    return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!validPreferences(body.preferences)) return NextResponse.json({ message: "Invalid preferences." }, { status: 400 });

  try {
    const user = await getOrCreateCurrentUser(request);
    const current = await preferencesFor(user.id);
    const preferences = { ...current, ...body.preferences };
    const result = await databaseQuery<PreferenceRow>(
      `UPDATE food_catalog.app.user_preferences SET preferences = $1::JSONB, updated_at = now()
       WHERE user_id = $2 RETURNING preferences`,
      [JSON.stringify(preferences), user.id],
    );
    const macroTotal = Number(preferences.carbs) + Number(preferences.fat) + Number(preferences.protein);
    const mealTotal = Number(preferences.breakfast) + Number(preferences.lunch) + Number(preferences.dinner) + Number(preferences.snack);
    if (macroTotal === 100 && mealTotal === 100) {
      await databaseQuery(
        `UPDATE food_catalog.app.profile_goals SET calorie_adjustment_kcal=$1, carbs_pct=$2, fat_pct=$3, protein_pct=$4,
           breakfast_pct=$5, lunch_pct=$6, dinner_pct=$7, snack_pct=$8, updated_at=now() WHERE profile_id=$9`,
        [Number(preferences.calorieAdjustment), Number(preferences.carbs), Number(preferences.fat), Number(preferences.protein),
          Number(preferences.breakfast), Number(preferences.lunch), Number(preferences.dinner), Number(preferences.snack), user.profileId],
      );
    }
    return attachCurrentUserCookie(NextResponse.json({ preferences: result.rows[0].preferences }), user);
  } catch (error) {
    console.error("Update preferences failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Preferences storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
