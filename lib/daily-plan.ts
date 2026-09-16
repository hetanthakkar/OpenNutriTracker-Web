import { caloriePlanFromExpenditure } from "./calorie-plan.ts";
import { databaseQuery } from "./db.ts";
import { loadExpenditureData } from "./expenditure-data.ts";
import { weightProgress, type WeightProgress } from "./weight-progress.ts";

export type DailyPlan = {
  weightProgress: WeightProgress;
  available: boolean;
  missingProfileFields: string[];
  expenditureKcal: number | null;
  weightGoalAdjustmentKcal: number | null;
  manualAdjustmentKcal: number;
  calorieGoalKcal: number | null;
  carbsTargetG: number | null;
  fatTargetG: number | null;
  proteinTargetG: number | null;
  waterTargetMl: number;
  nutrientTargets: Record<string, number>;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Calculate and persist the current profile's plan for one day. */
export async function resolveDailyPlan(profileId: string, diaryDate: string): Promise<DailyPlan> {
  const [data, targetsResult] = await Promise.all([
    loadExpenditureData(profileId, diaryDate),
    databaseQuery<{ nutrient_code: string; target_value: string }>(
      `SELECT nutrient_code, target_value::text
       FROM food_catalog.app.profile_nutrient_targets
       WHERE profile_id=$1 AND target_value IS NOT NULL`,
      [profileId],
    ),
  ]);

  const { profile, estimate, missingProfileFields } = data;
  const progress = weightProgress(data.weights, diaryDate, profile?.weekly_rate_kg == null ? null : Number(profile.weekly_rate_kg));
  const nutrientTargets = Object.fromEntries(targetsResult.rows.map((row) => [row.nutrient_code, Number(row.target_value)]));
  const waterTargetMl = Number(profile?.water_goal_ml ?? 1900);
  if (!profile || !estimate) {
    delete nutrientTargets.energy_kcal;
    delete nutrientTargets.carbohydrate_g;
    delete nutrientTargets.total_fat_g;
    delete nutrientTargets.protein_g;
    return {
      available: false,
      weightProgress: progress,
      missingProfileFields,
      expenditureKcal: null,
      weightGoalAdjustmentKcal: null,
      manualAdjustmentKcal: Number(profile?.calorie_adjustment_kcal ?? 0),
      calorieGoalKcal: null,
      carbsTargetG: null,
      fatTargetG: null,
      proteinTargetG: null,
      waterTargetMl,
      nutrientTargets,
    };
  }

  const latestWeightKg = Number(profile.latest_weight_kg);
  const calculated = caloriePlanFromExpenditure({
    expenditureKcal: estimate.currentTdeeKcal,
    weeklyWeightChangeKg: Number(profile.weekly_rate_kg ?? 0),
    currentWeightKg: latestWeightKg,
  });
  const manualAdjustment = Number(profile.calorie_adjustment_kcal);
  const calorieGoalKcal = clamp(calculated.targetKcal + manualAdjustment, 1200, 5000);
  const carbsTargetG = calorieGoalKcal * Number(profile.carbs_pct) / 400;
  const fatTargetG = calorieGoalKcal * Number(profile.fat_pct) / 900;
  const proteinTargetG = calorieGoalKcal * Number(profile.protein_pct) / 400;
  nutrientTargets.energy_kcal = calorieGoalKcal;
  nutrientTargets.carbohydrate_g = carbsTargetG;
  nutrientTargets.total_fat_g = fatTargetG;
  nutrientTargets.protein_g = proteinTargetG;

  await databaseQuery(
    `INSERT INTO food_catalog.app.daily_plan_snapshots
       (profile_id, diary_date, base_expenditure_kcal, weight_goal_adjustment_kcal,
        manual_adjustment_kcal, calorie_goal_kcal, carbs_target_g, fat_target_g,
        protein_target_g, water_target_ml, nutrient_targets)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::JSONB)
     ON CONFLICT (profile_id, diary_date) DO UPDATE SET
       base_expenditure_kcal=excluded.base_expenditure_kcal,
       weight_goal_adjustment_kcal=excluded.weight_goal_adjustment_kcal,
       manual_adjustment_kcal=excluded.manual_adjustment_kcal,
       calorie_goal_kcal=excluded.calorie_goal_kcal,
       carbs_target_g=excluded.carbs_target_g,
       fat_target_g=excluded.fat_target_g,
       protein_target_g=excluded.protein_target_g,
       water_target_ml=excluded.water_target_ml,
       nutrient_targets=excluded.nutrient_targets,
       updated_at=now()
     WHERE food_catalog.app.daily_plan_snapshots.finalized_at IS NULL`,
    [profileId, diaryDate, estimate.currentTdeeKcal, calculated.dailyEnergyAdjustmentKcal,
      manualAdjustment, calorieGoalKcal, carbsTargetG, fatTargetG, proteinTargetG,
      waterTargetMl, JSON.stringify(nutrientTargets)],
  );

  return {
    available: true,
    weightProgress: progress,
    missingProfileFields: [],
    expenditureKcal: estimate.currentTdeeKcal,
    weightGoalAdjustmentKcal: calculated.dailyEnergyAdjustmentKcal,
    manualAdjustmentKcal: manualAdjustment,
    calorieGoalKcal,
    carbsTargetG,
    fatTargetG,
    proteinTargetG,
    waterTargetMl,
    nutrientTargets,
  };
}
