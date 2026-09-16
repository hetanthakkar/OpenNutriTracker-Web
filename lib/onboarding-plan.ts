import { caloriePlanFromExpenditure } from "./calorie-plan";
import { initialTdee, type BiologicalSex } from "./expenditure";

export type NutritionGoal = "lose_weight" | "maintain_weight" | "gain_weight";

export type AutomaticNutritionPlan = {
  ready: boolean;
  missingFields: string[];
  weeklyRateKg: number;
  estimatedTdeeKcal: number | null;
  calorieGoalKcal: number | null;
  dailyEnergyAdjustmentKcal: number | null;
  targetWasClamped: boolean;
  carbsPct: number;
  fatPct: number;
  proteinPct: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function ageOn(dateOfBirth: string, onDate: Date) {
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  let age = onDate.getFullYear() - year;
  if (onDate.getMonth() + 1 < month || (onDate.getMonth() + 1 === month && onDate.getDate() < day)) age -= 1;
  return age;
}

function activityFactor(level: string) {
  if (level === "sedentary") return 1.2;
  if (level === "light") return 1.375;
  if (level === "very_active") return 1.725;
  return 1.55;
}

/** A conservative starting trajectory, later replaced by the adaptive expenditure model. */
export function suggestedWeeklyWeightChangeKg(goal: NutritionGoal, currentWeightKg: number | null) {
  if (goal === "maintain_weight" || currentWeightKg === null || !Number.isFinite(currentWeightKg)) return 0;
  if (goal === "lose_weight") return -Number(clamp(currentWeightKg * 0.005, 0.25, 0.75).toFixed(2));
  return Number(clamp(currentWeightKg * 0.0025, 0.1, 0.3).toFixed(2));
}

function macroSplit(goal: NutritionGoal, weightKg: number, calorieGoalKcal: number) {
  const proteinPerKg = goal === "lose_weight" ? 1.8 : 1.6;
  const proteinPct = Math.round(clamp((weightKg * proteinPerKg * 4 / calorieGoalKcal) * 100, 20, 35));
  const fatPct = Math.round(clamp(Math.max((weightKg * 0.6 * 9 / calorieGoalKcal) * 100, 25), 20, 35));
  return { proteinPct, fatPct, carbsPct: 100 - proteinPct - fatPct };
}

/**
 * Establishes a transparent cold-start plan. Mifflin–St Jeor estimates TDEE,
 * then the user's selected weekly rate sets the intake target. After sufficient
 * food and weight logging, `estimateAdaptiveExpenditure` supersedes this estimate.
 */
export function automaticNutritionPlan(input: {
  goal: NutritionGoal;
  weeklyRateKg?: number | null;
  currentWeightKg: number | null;
  heightCm: number | null;
  dateOfBirth: string;
  sex: BiologicalSex | "";
  activityLevel: string;
  onDate?: Date;
}): AutomaticNutritionPlan {
  const missingFields: string[] = [];
  if (input.currentWeightKg === null) missingFields.push("current weight");
  if (input.heightCm === null) missingFields.push("height");
  if (!input.dateOfBirth) missingFields.push("date of birth");
  if (!input.sex) missingFields.push("energy equation sex");
  const suggestedRate = suggestedWeeklyWeightChangeKg(input.goal, input.currentWeightKg);
  const providedRate = input.weeklyRateKg !== null && input.weeklyRateKg !== undefined && Number.isFinite(input.weeklyRateKg)
    ? Math.abs(input.weeklyRateKg)
    : 0;
  const requestedRate = providedRate > 0
    ? providedRate
    : Math.abs(suggestedRate) || (input.goal === "lose_weight" ? 0.5 : 0.25);
  const maximumRate = input.goal === "gain_weight" ? 0.5 : 1;
  const rateDirection = input.goal === "lose_weight" ? -1 : 1;
  const weeklyRateKg = input.goal === "maintain_weight"
    ? 0
    : Number((rateDirection * clamp(requestedRate, 0.1, maximumRate)).toFixed(3));
  const incompletePlan = {
    ready: false,
    weeklyRateKg,
    estimatedTdeeKcal: null,
    calorieGoalKcal: null,
    dailyEnergyAdjustmentKcal: null,
    targetWasClamped: false,
    carbsPct: 45,
    fatPct: 25,
    proteinPct: 30,
  } as const;
  if (missingFields.length > 0) return { ...incompletePlan, missingFields };

  const ageYears = ageOn(input.dateOfBirth, input.onDate ?? new Date());
  if (!Number.isFinite(ageYears) || ageYears < 13 || ageYears > 120) {
    return { ...incompletePlan, missingFields: ["a valid date of birth"] };
  }
  const estimatedTdeeKcal = Math.round(initialTdee({
    ageYears,
    sex: input.sex as BiologicalSex,
    heightCm: input.heightCm!,
    weightKg: input.currentWeightKg!,
    activityFactor: activityFactor(input.activityLevel),
  }));
  const caloriePlan = caloriePlanFromExpenditure({
    expenditureKcal: estimatedTdeeKcal,
    weeklyWeightChangeKg: weeklyRateKg,
    currentWeightKg: input.currentWeightKg!,
  });
  const calorieGoalKcal = caloriePlan.targetKcal;
  const dailyEnergyAdjustmentKcal = calorieGoalKcal - estimatedTdeeKcal;
  return {
    ready: true,
    missingFields: [],
    weeklyRateKg,
    estimatedTdeeKcal,
    calorieGoalKcal,
    dailyEnergyAdjustmentKcal,
    targetWasClamped: Math.abs(dailyEnergyAdjustmentKcal - caloriePlan.dailyEnergyAdjustmentKcal) > 2,
    ...macroSplit(input.goal, input.currentWeightKg!, calorieGoalKcal),
  };
}
