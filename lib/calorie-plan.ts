import { energyDensityForWeightChangeKcalPerKg } from "./expenditure";

export type CaloriePlan = {
  expenditureKcal: number;
  targetKcal: number;
  dailyEnergyAdjustmentKcal: number;
  weeklyWeightChangeKg: number;
};

/**
 * Convert a desired weekly body-weight trajectory into today's calorie target.
 * Negative weeklyWeightChangeKg means weight loss.
 *
 * intake = expenditure + change in stored body energy
 *
 * The energy content of weight change uses the same Hall/Forbes composition
 * model as the expenditure estimator rather than a fixed 7,700 kcal/kg rule.
 */
export function caloriePlanFromExpenditure({
  expenditureKcal,
  weeklyWeightChangeKg,
  currentWeightKg,
  bodyFatPercent,
}: {
  expenditureKcal: number;
  weeklyWeightChangeKg: number;
  currentWeightKg: number;
  bodyFatPercent?: number;
}): CaloriePlan {
  const fatMassKg = bodyFatPercent == null
    ? undefined
    : currentWeightKg * clamp(bodyFatPercent / 100, 0.03, 0.7);
  const energyDensity = energyDensityForWeightChangeKcalPerKg(fatMassKg);
  const dailyEnergyAdjustmentKcal = (weeklyWeightChangeKg * energyDensity) / 7;
  const targetKcal = clamp(expenditureKcal + dailyEnergyAdjustmentKcal, 1200, 5000);

  return {
    expenditureKcal: Math.round(expenditureKcal),
    targetKcal: Math.round(targetKcal),
    dailyEnergyAdjustmentKcal: Math.round(dailyEnergyAdjustmentKcal),
    weeklyWeightChangeKg,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
