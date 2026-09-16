import { after, NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";
import { notifyOwnerOfSharedDashboardView } from "@/lib/share-notifications";
import type { SharePermissionCode } from "@/lib/sharing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const validId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function dateInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function numeric(value: string | null | undefined) {
  return value == null ? null : Number(value);
}

/** Return only the owner data categories explicitly granted to this viewer. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message: "Invalid share id." }, { status: 400 });
  try {
    const user = await getOrCreateCurrentUser(request);
    const shareResult = await databaseQuery<{
      id: string;
      owner_profile_id: string;
      owner_user_id: string;
      owner_name: string;
      viewer_name: string;
      timezone: string;
      relationship: string;
      connected_at: string;
      notify_owner_on_view: boolean;
    }>(
      `SELECT s.id,s.owner_profile_id,p.owner_user_id,p.name AS owner_name,viewer.display_name AS viewer_name,
              p.timezone,s.relationship,s.connected_at::text,s.notify_owner_on_view
       FROM food_catalog.app.profile_shares s
       JOIN food_catalog.app.profiles p ON p.id=s.owner_profile_id
       JOIN food_catalog.app.users viewer ON viewer.id=s.viewer_user_id
       WHERE s.id=$1 AND s.viewer_user_id=$2 AND s.revoked_at IS NULL`,
      [id, user.id],
    );
    const share = shareResult.rows[0];
    if (!share) return attachCurrentUserCookie(NextResponse.json({ message: "Shared dashboard not found." }, { status: 404 }), user);
    const permissionResult = await databaseQuery<{ permission_code: SharePermissionCode }>(
      "SELECT permission_code FROM food_catalog.app.profile_share_permissions WHERE share_id=$1",
      [id],
    );
    const permissions = new Set(permissionResult.rows.map((row) => row.permission_code));
    const requestedDate = request.nextUrl.searchParams.get("date");
    if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return attachCurrentUserCookie(NextResponse.json({ message: "date must use YYYY-MM-DD." }, { status: 400 }), user);
    const diaryDate = requestedDate ?? dateInTimezone(share.timezone);
    const needsNutrition = permissions.has("calorie_total") || permissions.has("macro_totals");
    const [nutritionResult, mealResult, waterResult, activityResult, weightResult, planResult, goalResult] = await Promise.all([
      needsNutrition ? databaseQuery<{ calories: string; carbs: string; fat: string; protein: string }>(
        `SELECT COALESCE(sum(energy_kcal),0)::text AS calories,COALESCE(sum(carbohydrate_g),0)::text AS carbs,
                COALESCE(sum(total_fat_g),0)::text AS fat,COALESCE(sum(protein_g),0)::text AS protein
         FROM food_catalog.app.diary_entries WHERE profile_id=$1 AND diary_date=$2`,
        [share.owner_profile_id, diaryDate],
      ) : Promise.resolve({ rows: [] }),
      permissions.has("meal_names_portions") ? databaseQuery<{ id: string; meal_type: string; food_name: string; brand_name: string | null; quantity: string; unit: string; grams: string | null; energy_kcal: string | null }>(
        `SELECT id,meal_type,food_name,brand_name,quantity::text,unit,grams::text,energy_kcal::text
         FROM food_catalog.app.diary_entries WHERE profile_id=$1 AND diary_date=$2 ORDER BY logged_at,created_at`,
        [share.owner_profile_id, diaryDate],
      ) : Promise.resolve({ rows: [] }),
      permissions.has("water_intake") ? databaseQuery<{ total_ml: string }>(
        "SELECT COALESCE(sum(amount_ml),0)::text AS total_ml FROM food_catalog.app.water_entries WHERE profile_id=$1 AND diary_date=$2",
        [share.owner_profile_id, diaryDate],
      ) : Promise.resolve({ rows: [] }),
      permissions.has("activity") ? databaseQuery<{ minutes: string; calories: string }>(
        "SELECT COALESCE(sum(duration_minutes),0)::text AS minutes,COALESCE(sum(energy_kcal),0)::text AS calories FROM food_catalog.app.activity_entries WHERE profile_id=$1 AND diary_date=$2",
        [share.owner_profile_id, diaryDate],
      ) : Promise.resolve({ rows: [] }),
      permissions.has("weight_trend") ? databaseQuery<{ recorded_at: string; weight_kg: string }>(
        "SELECT recorded_at::text,weight_kg::text FROM food_catalog.app.weight_entries WHERE profile_id=$1 ORDER BY recorded_at DESC,created_at DESC LIMIT 30",
        [share.owner_profile_id],
      ) : Promise.resolve({ rows: [] }),
      (permissions.has("calorie_total") || permissions.has("macro_totals") || permissions.has("water_intake") || permissions.has("goal_progress")) ? databaseQuery<{ calorie_goal_kcal: string; carbs_target_g: string | null; fat_target_g: string | null; protein_target_g: string | null; water_target_ml: string | null }>(
        `SELECT calorie_goal_kcal::text,carbs_target_g::text,fat_target_g::text,protein_target_g::text,water_target_ml::text
         FROM food_catalog.app.daily_plan_snapshots WHERE profile_id=$1 AND diary_date=$2`,
        [share.owner_profile_id, diaryDate],
      ) : Promise.resolve({ rows: [] }),
      permissions.has("goal_progress") ? databaseQuery<{ goal_type: string; target_weight_kg: string | null; weekly_rate_kg: string | null; current_weight_kg: string | null }>(
        `SELECT g.goal_type,g.target_weight_kg::text,g.weekly_rate_kg::text,
                (SELECT w.weight_kg::text FROM food_catalog.app.weight_entries w WHERE w.profile_id=g.profile_id ORDER BY w.recorded_at DESC,w.created_at DESC LIMIT 1) AS current_weight_kg
         FROM food_catalog.app.profile_goals g WHERE g.profile_id=$1`,
        [share.owner_profile_id],
      ) : Promise.resolve({ rows: [] }),
    ]);
    const nutrition = nutritionResult.rows[0];
    const plan = planResult.rows[0];
    const goal = goalResult.rows[0];
    let shouldNotifyOwner = false;
    if (share.notify_owner_on_view) {
      const recentView = await databaseQuery<{ id: string }>(
        `SELECT id FROM food_catalog.app.share_view_events
         WHERE share_id=$1 AND viewer_user_id=$2 AND viewed_at > now() - INTERVAL '6 hours'
         ORDER BY viewed_at DESC LIMIT 1`,
        [id, user.id],
      );
      await databaseQuery("INSERT INTO food_catalog.app.share_view_events (share_id,viewer_user_id) VALUES ($1,$2)", [id, user.id]);
      shouldNotifyOwner = !recentView.rows[0];
    }
    const response = attachCurrentUserCookie(NextResponse.json({
      share: { id, ownerName: share.owner_name, relationship: share.relationship, connectedAt: share.connected_at },
      date: diaryDate,
      permissions: [...permissions],
      calories: permissions.has("calorie_total") ? { consumedKcal: Number(nutrition?.calories ?? 0), targetKcal: numeric(plan?.calorie_goal_kcal) } : null,
      macros: permissions.has("macro_totals") ? {
        carbohydrateG: Number(nutrition?.carbs ?? 0), totalFatG: Number(nutrition?.fat ?? 0), proteinG: Number(nutrition?.protein ?? 0),
        carbohydrateTargetG: numeric(plan?.carbs_target_g), totalFatTargetG: numeric(plan?.fat_target_g), proteinTargetG: numeric(plan?.protein_target_g),
      } : null,
      meals: permissions.has("meal_names_portions") ? mealResult.rows.map((row) => ({
        id: row.id, mealType: row.meal_type, name: row.food_name, brand: row.brand_name,
        quantity: Number(row.quantity), unit: row.unit, grams: numeric(row.grams), energyKcal: numeric(row.energy_kcal),
      })) : null,
      water: permissions.has("water_intake") ? { totalMl: Number(waterResult.rows[0]?.total_ml ?? 0), targetMl: numeric(plan?.water_target_ml) } : null,
      activity: permissions.has("activity") ? { totalMinutes: Number(activityResult.rows[0]?.minutes ?? 0), energyKcal: Number(activityResult.rows[0]?.calories ?? 0) } : null,
      weight: permissions.has("weight_trend") ? weightResult.rows.map((row) => ({ recordedAt: row.recorded_at, weightKg: Number(row.weight_kg) })).reverse() : null,
      goalProgress: permissions.has("goal_progress") ? {
        goal: goal?.goal_type ?? null,
        targetWeightKg: numeric(goal?.target_weight_kg),
        currentWeightKg: numeric(goal?.current_weight_kg),
        weeklyRateKg: numeric(goal?.weekly_rate_kg),
        calorieTargetKcal: numeric(plan?.calorie_goal_kcal),
      } : null,
    }), user);
    if (shouldNotifyOwner) {
      after(() => notifyOwnerOfSharedDashboardView({
        ownerUserId: share.owner_user_id,
        viewerName: share.viewer_name,
      }));
    }
    return response;
  } catch (error) {
    console.error("Read shared dashboard failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "The shared dashboard is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
