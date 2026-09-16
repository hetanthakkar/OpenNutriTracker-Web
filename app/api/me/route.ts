import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProfileRow = {
  display_name: string;
  height_cm: string | null;
  date_of_birth: string | null;
  energy_equation_sex: "female" | "male" | null;
  target_weight_kg: string | null;
  activity_level: string;
  goal: string;
  weekly_rate_kg: string | null;
  water_goal_ml: number;
};

type ProfileInput = {
  displayName?: unknown;
  heightCm?: unknown;
  dateOfBirth?: unknown;
  energyEquationSex?: unknown;
  targetWeightKg?: unknown;
  activityLevel?: unknown;
  goal?: unknown;
  weeklyRateKg?: unknown;
  waterGoalMl?: unknown;
};

const activityLevels = ["sedentary", "light", "active", "very_active"] as const;
const goals = ["lose_weight", "maintain_weight", "gain_weight"] as const;

function asNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

function serialize(profile: ProfileRow) {
  return {
    displayName: profile.display_name,
    heightCm: profile.height_cm === null ? null : Number(profile.height_cm),
    dateOfBirth: profile.date_of_birth,
    energyEquationSex: profile.energy_equation_sex,
    targetWeightKg: profile.target_weight_kg === null ? null : Number(profile.target_weight_kg),
    activityLevel: profile.activity_level,
    goal: profile.goal,
    weeklyRateKg: profile.weekly_rate_kg === null ? null : Number(profile.weekly_rate_kg),
    waterGoalMl: profile.water_goal_ml,
  };
}

async function profileFor(profileId: string) {
  const result = await databaseQuery<ProfileRow>(
    `SELECT p.name AS display_name, p.height_cm::text, p.date_of_birth::text, p.energy_equation_sex, g.target_weight_kg::text,
            g.activity_level, g.goal_type AS goal, g.weekly_rate_kg::text, g.water_goal_ml
     FROM food_catalog.app.profiles p
     JOIN food_catalog.app.profile_goals g ON g.profile_id = p.id
     WHERE p.id = $1`,
    [profileId],
  );
  return result.rows[0];
}

/** Read the current browser profile and its goals. */
export async function GET(request: NextRequest) {
  try {
    const user = await getOrCreateCurrentUser(request);
    const profile = await profileFor(user.profileId);
    return attachCurrentUserCookie(NextResponse.json(serialize(profile)), user);
  } catch (error) {
    console.error("Read profile failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Profile storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}

/** Update selected profile fields and goals for the current browser profile. */
export async function PUT(request: NextRequest) {
  let input: ProfileInput;
  try {
    input = await request.json() as ProfileInput;
  } catch {
    return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 });
  }

  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : undefined;
  const heightCm = input.heightCm === undefined ? undefined : input.heightCm === null ? null : asNumber(input.heightCm);
  const dateOfBirth = input.dateOfBirth === undefined ? undefined : input.dateOfBirth === null ? null : String(input.dateOfBirth);
  const energyEquationSex = input.energyEquationSex === undefined ? undefined : input.energyEquationSex;
  const targetWeightKg = input.targetWeightKg === undefined ? undefined : input.targetWeightKg === null ? null : asNumber(input.targetWeightKg);
  const weeklyRateKg = input.weeklyRateKg === undefined ? undefined : input.weeklyRateKg === null ? null : asNumber(input.weeklyRateKg);
  const waterGoalMl = input.waterGoalMl === undefined ? undefined : asNumber(input.waterGoalMl);
  if ((displayName !== undefined && (!displayName || displayName.length > 80))
    || (heightCm !== undefined && heightCm !== null && (!Number.isFinite(heightCm) || heightCm < 80 || heightCm > 250))
    || (dateOfBirth !== undefined && dateOfBirth !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(new Date(`${dateOfBirth}T00:00:00Z`).getTime()) || dateOfBirth > new Date().toISOString().slice(0, 10)))
    || (energyEquationSex !== undefined && energyEquationSex !== null && energyEquationSex !== "female" && energyEquationSex !== "male")
    || (targetWeightKg !== undefined && targetWeightKg !== null && (!Number.isFinite(targetWeightKg) || targetWeightKg < 20 || targetWeightKg > 500))
    || (weeklyRateKg !== undefined && weeklyRateKg !== null && (!Number.isFinite(weeklyRateKg) || weeklyRateKg < -2 || weeklyRateKg > 2))
    || (waterGoalMl !== undefined && (!Number.isInteger(waterGoalMl) || waterGoalMl < 250 || waterGoalMl > 10000))
    || (input.activityLevel !== undefined && (typeof input.activityLevel !== "string" || !activityLevels.includes(input.activityLevel as typeof activityLevels[number])))
    || (input.goal !== undefined && (typeof input.goal !== "string" || !goals.includes(input.goal as typeof goals[number])))) {
    return NextResponse.json({ message: "Invalid profile update." }, { status: 400 });
  }

  try {
    const user = await getOrCreateCurrentUser(request);
    const current = await profileFor(user.profileId);
    await Promise.all([
      databaseQuery(
        "UPDATE food_catalog.app.profiles SET name=$1, height_cm=$2, date_of_birth=$3, energy_equation_sex=$4, updated_at=now() WHERE id=$5",
        [displayName ?? current.display_name, heightCm === undefined ? current.height_cm : heightCm,
          dateOfBirth === undefined ? current.date_of_birth : dateOfBirth,
          energyEquationSex === undefined ? current.energy_equation_sex : energyEquationSex, user.profileId],
      ),
      databaseQuery(
        `UPDATE food_catalog.app.profile_goals SET target_weight_kg=$1, activity_level=$2, goal_type=$3,
           weekly_rate_kg=$4, water_goal_ml=$5, updated_at=now() WHERE profile_id=$6`,
        [targetWeightKg === undefined ? current.target_weight_kg : targetWeightKg, input.activityLevel ?? current.activity_level,
          input.goal ?? current.goal, weeklyRateKg === undefined ? current.weekly_rate_kg : weeklyRateKg,
          waterGoalMl ?? current.water_goal_ml, user.profileId],
      ),
    ]);
    return attachCurrentUserCookie(NextResponse.json(serialize(await profileFor(user.profileId))), user);
  } catch (error) {
    console.error("Update profile failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Profile storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
