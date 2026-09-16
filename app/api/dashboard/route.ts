import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";
import { resolveDailyPlan } from "@/lib/daily-plan";
import { calculateNutritionScore } from "@/lib/nutrition-score";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DashboardRow = {
  id: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  logged_at: string;
  food_name: string;
  brand_name: string | null;
  quantity: string;
  grams: string | null;
  nutrients: Record<string, unknown>;
  energy_kcal: string | null;
  protein_g: string | null;
  carbohydrate_g: string | null;
  total_fat_g: string | null;
};

function numberValue(value: string | null) {
  return value === null ? 0 : Number(value);
}

function dateRange(value: string | null): { date: string; start: Date; end: Date } | null {
  const date = value ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== date) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { date, start, end };
}

function sumNutrients(entries: DashboardRow[]) {
  const totals: Record<string, number> = {};
  for (const entry of entries) {
    for (const [key, value] of Object.entries(entry.nutrients)) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      totals[key] = Number(((totals[key] ?? 0) + value).toFixed(4));
    }
  }
  return totals;
}

/** A single, live diet summary for the Home dashboard. */
export async function GET(request: NextRequest) {
  const range = dateRange(request.nextUrl.searchParams.get("date"));
  if (!range) return NextResponse.json({ message: "date must use YYYY-MM-DD." }, { status: 400 });

  try {
    const user = await getOrCreateCurrentUser(request);
    const [result, waterResult, activityResult, weightResult, streakResult, plan] = await Promise.all([databaseQuery<DashboardRow>(
      `SELECT id, meal_type, logged_at::text, food_name, brand_name,
              quantity::text, grams::text, nutrients,
              energy_kcal::text, protein_g::text, carbohydrate_g::text, total_fat_g::text
       FROM food_catalog.app.diary_entries
       WHERE profile_id = $1 AND diary_date = $2
       ORDER BY logged_at ASC, created_at ASC`,
      [user.profileId, range.date],
    ), databaseQuery<{ total_ml: string }>("SELECT COALESCE(sum(amount_ml),0)::text AS total_ml FROM food_catalog.app.water_entries WHERE profile_id=$1 AND diary_date=$2", [user.profileId, range.date]),
    databaseQuery<{ minutes: string; energy: string }>("SELECT COALESCE(sum(duration_minutes),0)::text AS minutes,COALESCE(sum(energy_kcal),0)::text AS energy FROM food_catalog.app.activity_entries WHERE profile_id=$1 AND diary_date=$2", [user.profileId, range.date]),
    databaseQuery<{ weight_kg: string; recorded_at: string }>("SELECT weight_kg::text,recorded_at::text FROM food_catalog.app.weight_entries WHERE profile_id=$1 AND recorded_at < ($2::date + INTERVAL '1 day') ORDER BY recorded_at DESC,created_at DESC LIMIT 1", [user.profileId, range.date]),
    databaseQuery<{ day: string }>("SELECT DISTINCT diary_date::text AS day FROM food_catalog.app.diary_entries WHERE profile_id=$1 AND diary_date <= $2 ORDER BY day DESC", [user.profileId, range.date]),
    resolveDailyPlan(user.profileId, range.date)]);
    const totals = result.rows.reduce((summary, entry) => ({
      energyKcal: summary.energyKcal + numberValue(entry.energy_kcal),
      proteinG: summary.proteinG + numberValue(entry.protein_g),
      carbohydrateG: summary.carbohydrateG + numberValue(entry.carbohydrate_g),
      totalFatG: summary.totalFatG + numberValue(entry.total_fat_g),
    }), { energyKcal: 0, proteinG: 0, carbohydrateG: 0, totalFatG: 0 });
    const nutrientTotals = sumNutrients(result.rows);
    const nutritionScore = calculateNutritionScore({
      entryCount: result.rows.length,
      totals: {
        ...nutrientTotals,
        energy_kcal: totals.energyKcal,
        protein_g: totals.proteinG,
        carbohydrate_g: totals.carbohydrateG,
        total_fat_g: totals.totalFatG,
      },
      macroTargets: {
        carbohydrateG: plan.carbsTargetG,
        totalFatG: plan.fatTargetG,
        proteinG: plan.proteinTargetG,
      },
      nutrientTargets: plan.nutrientTargets,
    });
    let currentStreak = 0;
    const cursor = new Date(`${range.date}T00:00:00Z`);
    for (const row of streakResult.rows) {
      if (row.day !== cursor.toISOString().slice(0, 10)) break;
      currentStreak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    let bestStreak = 0;
    let runningStreak = 0;
    let previousDay: Date | null = null;
    for (const row of [...streakResult.rows].reverse()) {
      const day = new Date(`${row.day}T00:00:00.000Z`);
      if (previousDay) {
        const expected = new Date(previousDay);
        expected.setUTCDate(expected.getUTCDate() + 1);
        runningStreak = day.getTime() === expected.getTime() ? runningStreak + 1 : 1;
      } else {
        runningStreak = 1;
      }
      bestStreak = Math.max(bestStreak, runningStreak);
      previousDay = day;
    }

    return attachCurrentUserCookie(NextResponse.json({
      date: range.date,
      meals: result.rows.map((entry) => ({
        id: entry.id,
        mealType: entry.meal_type,
        loggedAt: entry.logged_at,
        name: entry.food_name,
        brand: entry.brand_name,
        quantity: Number(entry.quantity),
        grams: entry.grams === null ? null : Number(entry.grams),
        energyKcal: numberValue(entry.energy_kcal),
      })),
      nutrition: {
        entryCount: result.rows.length,
        macros: totals,
        nutrients: nutrientTotals,
        score: nutritionScore,
      },
      water: { totalMl: Number(waterResult.rows[0].total_ml), goalMl: plan.waterTargetMl },
      activity: { totalMinutes: Number(activityResult.rows[0].minutes), energyKcal: Number(activityResult.rows[0].energy) },
      weight: weightResult.rows[0] ? { weightKg: Number(weightResult.rows[0].weight_kg), recordedAt: weightResult.rows[0].recorded_at } : null,
      weightProgress: plan.weightProgress,
      plan: {
        available: plan.available,
        missingProfileFields: plan.missingProfileFields,
        expenditureKcal: plan.expenditureKcal,
        weightGoalAdjustmentKcal: plan.weightGoalAdjustmentKcal,
        manualAdjustmentKcal: plan.manualAdjustmentKcal,
        calorieGoalKcal: plan.calorieGoalKcal,
        carbsTargetG: plan.carbsTargetG,
        fatTargetG: plan.fatTargetG,
        proteinTargetG: plan.proteinTargetG,
        waterTargetMl: plan.waterTargetMl,
        nutrientTargets: plan.nutrientTargets,
      },
      streak: { currentDays: currentStreak, bestDays: bestStreak },
    }), user);
  } catch (error) {
    console.error("Read dashboard failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Dashboard data is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
