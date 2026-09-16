import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";
import { loadExpenditureData } from "@/lib/expenditure-data";
import { caloriePlanFromExpenditure } from "@/lib/calorie-plan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ranges = ["7d", "30d", "90d", "all"] as const;
type Range = (typeof ranges)[number];
type FoodDay = { day: string; calories: string; carbs: string; fat: string; protein: string; completed: boolean };
type WaterDay = { day: string; water_ml: string };
type ActivityDay = { day: string; minutes: string; calories: string };
type WeightEntry = { day: string; weight_kg: string };
type HealthDay = { day: string; steps: string | null; sleep_hours: string | null; resting_heart_rate: string | null };

function isRange(value: string | null): value is Range {
  return typeof value === "string" && ranges.includes(value as Range);
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function rangeStart(range: Range, firstTrackedAt: Date | null) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (range === "all") return firstTrackedAt ? new Date(Date.UTC(firstTrackedAt.getUTCFullYear(), firstTrackedAt.getUTCMonth(), firstTrackedAt.getUTCDate())) : today;
  const days = Number.parseInt(range, 10);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

function dailyKeys(start: Date, end: Date) {
  const keys: string[] = [];
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) keys.push(dayKey(date));
  return keys;
}

/** Daily trend series and summaries across the current browser profile's saved logs. */
export async function GET(request: NextRequest) {
  const range = request.nextUrl.searchParams.get("range") ?? "7d";
  if (!isRange(range)) return NextResponse.json({ message: "range must be 7d, 30d, 90d, or all." }, { status: 400 });

  try {
    const user = await getOrCreateCurrentUser(request);
    const firstResult = await databaseQuery<{ first_tracked_at: Date | null }>(
      `SELECT min(tracked_at) AS first_tracked_at FROM (
         SELECT min(logged_at) AS tracked_at FROM food_catalog.app.diary_entries WHERE profile_id = $1
         UNION ALL SELECT min(logged_at) FROM food_catalog.app.water_entries WHERE profile_id = $1
         UNION ALL SELECT min(logged_at) FROM food_catalog.app.activity_entries WHERE profile_id = $1
         UNION ALL SELECT min(recorded_at) FROM food_catalog.app.weight_entries WHERE profile_id = $1
       )`,
      [user.profileId],
    );
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const start = rangeStart(range, firstResult.rows[0]?.first_tracked_at ?? null);
    const analysisStart = new Date(today);
    analysisStart.setUTCDate(analysisStart.getUTCDate() - 119);
    const queryStart = start < analysisStart ? start : analysisStart;
    const end = new Date(today);
    end.setUTCDate(end.getUTCDate() + 1);
    const params = [user.profileId, dayKey(queryStart), dayKey(end)];

    const [foodResult, waterResult, activityResult, weightResult, healthResult, expenditureData] = await Promise.all([
      databaseQuery<FoodDay>(
        `SELECT e.diary_date::text AS day,
                COALESCE(sum(e.energy_kcal), 0)::text AS calories,
                COALESCE(sum(e.carbohydrate_g), 0)::text AS carbs,
                COALESCE(sum(e.total_fat_g), 0)::text AS fat,
                COALESCE(sum(e.protein_g), 0)::text AS protein,
                bool_or(c.profile_id IS NOT NULL) AS completed
         FROM food_catalog.app.diary_entries e
         LEFT JOIN food_catalog.app.diary_day_completions c ON c.profile_id=e.profile_id AND c.diary_date=e.diary_date
         WHERE e.profile_id = $1 AND e.diary_date >= $2::date AND e.diary_date < $3::date
         GROUP BY 1 ORDER BY 1`, params),
      databaseQuery<WaterDay>(
        `SELECT diary_date::text AS day, sum(amount_ml)::text AS water_ml
         FROM food_catalog.app.water_entries WHERE profile_id = $1 AND diary_date >= $2::date AND diary_date < $3::date
         GROUP BY 1 ORDER BY 1`, params),
      databaseQuery<ActivityDay>(
        `SELECT diary_date::text AS day,
                sum(duration_minutes)::text AS minutes, sum(energy_kcal)::text AS calories
         FROM food_catalog.app.activity_entries WHERE profile_id = $1 AND diary_date >= $2::date AND diary_date < $3::date
         GROUP BY 1 ORDER BY 1`, params),
      databaseQuery<WeightEntry>(
        `SELECT DISTINCT ON (to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'))
                to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, weight_kg::text
         FROM food_catalog.app.weight_entries WHERE profile_id = $1 AND recorded_at >= $2 AND recorded_at < $3
         ORDER BY to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'), recorded_at DESC, created_at DESC`, params),
      databaseQuery<HealthDay>(
        `SELECT to_char(measured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
                max(CASE WHEN metric_code = 'steps' THEN value END)::text AS steps,
                max(CASE WHEN metric_code = 'sleep_hours' THEN value END)::text AS sleep_hours,
                avg(CASE WHEN metric_code = 'resting_heart_rate' THEN value END)::text AS resting_heart_rate
         FROM food_catalog.app.health_measurements
         WHERE profile_id = $1 AND measured_at >= $2 AND measured_at < $3
         GROUP BY 1 ORDER BY 1`, params),
      loadExpenditureData(user.profileId, dayKey(today)),
    ]);

    const food = new Map(foodResult.rows.map((row) => [row.day, row]));
    const water = new Map(waterResult.rows.map((row) => [row.day, row]));
    const activity = new Map(activityResult.rows.map((row) => [row.day, row]));
    const weight = new Map(weightResult.rows.map((row) => [row.day, Number(row.weight_kg)]));
    const health = new Map(healthResult.rows.map((row) => [row.day, row]));
    const allDays = dailyKeys(queryStart, today).map((day) => ({
      date: day,
      calories: Number(food.get(day)?.calories ?? 0),
      foodDayCompleted: food.get(day)?.completed === true,
      carbs: Number(food.get(day)?.carbs ?? 0),
      fat: Number(food.get(day)?.fat ?? 0),
      protein: Number(food.get(day)?.protein ?? 0),
      waterMl: Number(water.get(day)?.water_ml ?? 0),
      activeMinutes: Number(activity.get(day)?.minutes ?? 0),
      activityKcal: Number(activity.get(day)?.calories ?? 0),
      weightKg: weight.get(day) ?? null,
      steps: Number(health.get(day)?.steps ?? 0),
      sleepHours: Number(health.get(day)?.sleep_hours ?? 0),
      restingHeartRate: health.get(day)?.resting_heart_rate === null || health.get(day)?.resting_heart_rate === undefined ? null : Number(health.get(day)?.resting_heart_rate),
    }));
    const days = allDays.filter((day) => day.date >= dayKey(start));
    const dayCount = Math.max(days.length, 1);
    const totals = days.reduce((summary, day) => ({
      calories: summary.calories + day.calories, carbs: summary.carbs + day.carbs, fat: summary.fat + day.fat,
      protein: summary.protein + day.protein, waterMl: summary.waterMl + day.waterMl,
      activeMinutes: summary.activeMinutes + day.activeMinutes, activityKcal: summary.activityKcal + day.activityKcal,
      steps: summary.steps + day.steps, sleepHours: summary.sleepHours + day.sleepHours,
      restingHeartRateTotal: summary.restingHeartRateTotal + (day.restingHeartRate ?? 0),
      restingHeartRateDays: summary.restingHeartRateDays + (day.restingHeartRate === null ? 0 : 1),
      healthDays: summary.healthDays + (day.steps > 0 || day.sleepHours > 0 || day.restingHeartRate !== null ? 1 : 0),
    }), { calories: 0, carbs: 0, fat: 0, protein: 0, waterMl: 0, activeMinutes: 0, activityKcal: 0, steps: 0, sleepHours: 0, restingHeartRateTotal: 0, restingHeartRateDays: 0, healthDays: 0 });
    const weights = days.filter((day) => day.weightKg !== null);
    let streakDays = 0;
    for (const day of [...allDays].reverse()) {
      if (day.calories <= 0) break;
      streakDays += 1;
    }

    const { profile, estimate, missingProfileFields } = expenditureData;
    let calorieTarget: number | null = null;
    if (estimate && profile) {
      const calculated = caloriePlanFromExpenditure({
        expenditureKcal: estimate.currentTdeeKcal,
        weeklyWeightChangeKg: Number(profile.weekly_rate_kg ?? 0),
        currentWeightKg: Number(profile.latest_weight_kg),
      });
      calorieTarget = Math.min(5000, Math.max(1200, calculated.targetKcal + Number(profile.calorie_adjustment_kcal)));
    }
    const targets = {
      calorieKcal: calorieTarget,
      carbsG: calorieTarget === null ? null : calorieTarget * Number(profile?.carbs_pct) / 400,
      fatG: calorieTarget === null ? null : calorieTarget * Number(profile?.fat_pct) / 900,
      proteinG: calorieTarget === null ? null : calorieTarget * Number(profile?.protein_pct) / 400,
      waterMl: Number(profile?.water_goal_ml ?? 1900),
    };

    return attachCurrentUserCookie(NextResponse.json({
      range,
      days,
      targets,
      expenditure: estimate ? {
        available: true,
        currentTdeeKcal: estimate.currentTdeeKcal,
        isAdaptive: estimate.isAdaptive,
        confidence: estimate.confidence,
        status: estimate.status,
        pauseReason: estimate.pauseReason,
        loggedIntakeDays: estimate.loggedIntakeDays,
        weighedDays: estimate.weighedDays,
        totalDays: estimate.totalDays,
        recentLoggedIntakeDays: estimate.recentLoggedIntakeDays,
        recentWeighedDays: estimate.recentWeighedDays,
        requiredLoggedIntakeDays: estimate.requiredLoggedIntakeDays,
        requiredWeighedDays: estimate.requiredWeighedDays,
        history: estimate.history.map((item) => ({ date: item.date, estimatedTdeeKcal: item.estimatedTdeeKcal, trendWeightKg: item.trendWeightKg })),
      } : { available: false, missingProfileFields },
      summary: {
        averages: {
          calories: totals.calories / dayCount, carbs: totals.carbs / dayCount, fat: totals.fat / dayCount,
          protein: totals.protein / dayCount, waterMl: totals.waterMl / dayCount,
        },
        activeMinutes: totals.activeMinutes,
        activityKcal: totals.activityKcal,
        health: {
          loggedDays: totals.healthDays,
          averageSteps: totals.healthDays ? totals.steps / totals.healthDays : null,
          averageSleepHours: totals.healthDays ? totals.sleepHours / totals.healthDays : null,
          averageRestingHeartRate: totals.restingHeartRateDays ? totals.restingHeartRateTotal / totals.restingHeartRateDays : null,
        },
        streakDays,
        weightChangeKg: weights.length > 1 ? Number((weights.at(-1)!.weightKg! - weights[0].weightKg!).toFixed(2)) : null,
      },
    }), user);
  } catch (error) {
    console.error("Read trends failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Trend data is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
