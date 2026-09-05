import { caloriePlanFromExpenditure } from "./calorie-plan";
import { estimateAdaptiveExpenditure, type DailyEnergyObservation, type ExpenditureProfile } from "./expenditure";

export const demoExpenditureProfile: ExpenditureProfile = {
  ageYears: 30,
  sex: "male",
  heightCm: 178,
  weightKg: 91.8,
  bodyFatPercent: 25,
  activityFactor: 1.45,
};

export const demoWeeklyWeightGoalKg = -0.4;

/**
 * Deterministic prototype data until nutrition, measurements and HealthKit
 * samples come from the database. Missing calories/weights are intentional so
 * the UI exercises the estimator's confidence and imputation behavior.
 */
export function createDemoExpenditureObservations(includeHealthActivity: boolean): DailyEnergyObservation[] {
  const rows: DailyEnergyObservation[] = [];
  const start = new Date("2026-05-09T12:00:00Z");

  for (let index = 0; index < 120; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);

    const weekly = Math.sin((index / 7) * Math.PI * 2);
    const slower = Math.sin((index / 23) * Math.PI * 2);
    const trueTrendWeight = 91.8 - index * 0.039;
    const scaleNoise = 0.28 * weekly + 0.14 * slower;
    const intake = Math.round(2380 + 170 * weekly + 85 * slower + (index > 76 ? 80 : 0));
    const steps = Math.round(7600 + 1800 * Math.sin((index / 9) * Math.PI * 2) + (index > 82 ? 900 : 0));

    const missingIntake = index % 17 === 4 || index % 29 === 11;
    const missingWeight = index % 6 === 2 || index % 19 === 8;

    rows.push({
      date: date.toISOString().slice(0, 10),
      caloriesKcal: missingIntake ? null : intake,
      weightKg: missingWeight ? null : Number((trueTrendWeight + scaleNoise).toFixed(2)),
      steps: includeHealthActivity ? Math.max(1800, steps) : null,
      workoutMinutes: includeHealthActivity && index % 3 === 0 ? 38 : null,
    });
  }

  return rows;
}

export function getDemoAdaptivePlan(includeHealthActivity = false) {
  const estimate = estimateAdaptiveExpenditure(
    createDemoExpenditureObservations(includeHealthActivity),
    demoExpenditureProfile,
  );
  const latestWeightKg = estimate.history.at(-1)?.trendWeightKg ?? demoExpenditureProfile.weightKg;
  const caloriePlan = caloriePlanFromExpenditure({
    expenditureKcal: estimate.currentTdeeKcal,
    weeklyWeightChangeKg: demoWeeklyWeightGoalKg,
    currentWeightKg: latestWeightKg,
    bodyFatPercent: demoExpenditureProfile.bodyFatPercent,
  });

  return { estimate, caloriePlan, latestWeightKg };
}
