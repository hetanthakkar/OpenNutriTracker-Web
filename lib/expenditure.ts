export type BiologicalSex = "male" | "female";

export type ExpenditureProfile = {
  ageYears: number;
  sex: BiologicalSex;
  heightCm: number;
  weightKg: number;
  bodyFatPercent?: number;
  activityFactor?: number;
};

export type DailyEnergyObservation = {
  date: string;
  caloriesKcal?: number | null;
  weightKg?: number | null;
  steps?: number | null;
  workoutMinutes?: number | null;
};

export type ExpenditureDay = {
  date: string;
  trendWeightKg: number;
  intakeKcal: number;
  intakeImputed: boolean;
  observedTdeeKcal: number | null;
  estimatedTdeeKcal: number;
  confidence: number;
  energyDensityKcalPerKg: number;
  stepResponseMultiplier: number;
};

export type ExpenditureEstimate = {
  currentTdeeKcal: number;
  priorTdeeKcal: number;
  confidence: number;
  loggedIntakeDays: number;
  weighedDays: number;
  totalDays: number;
  history: ExpenditureDay[];
};

const KCAL_PER_MJ = 239.005736;
const FAT_ENERGY_MJ_PER_KG = 39.5;
const LEAN_CHANGE_ENERGY_MJ_PER_KG = 7.6;
const DEFAULT_ENERGY_DENSITY_KCAL_PER_KG = 7000;
const FORBES_KG = 10.4;

/**
 * Mifflin-St Jeor resting energy expenditure.
 * Mifflin et al., Am J Clin Nutr. 1990;51(2):241-247.
 * PMID: 2305711. https://pubmed.ncbi.nlm.nih.gov/2305711/
 */
export function mifflinStJeorRmr(profile: ExpenditureProfile): number {
  const sexTerm = profile.sex === "male" ? 5 : -161;
  return 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.ageYears + sexTerm;
}

export function initialTdee(profile: ExpenditureProfile): number {
  return mifflinStJeorRmr(profile) * (profile.activityFactor ?? 1.45);
}

/**
 * For small day-to-day changes, Forbes/Hall gives the fraction of a body-weight
 * change attributable to fat-free mass as 10.4 / (10.4 + fat mass).
 * Hall KD. Br J Nutr. 2007;97(6):1059-1063. PMID: 17367567.
 * https://pubmed.ncbi.nlm.nih.gov/17367567/
 */
export function forbesLeanFraction(fatMassKg: number): number {
  return clamp(FORBES_KG / (FORBES_KG + Math.max(0.1, fatMassKg)), 0.05, 0.95);
}

/**
 * Hall proposed 39.5 MJ/kg for fat-mass change and 7.6 MJ/kg for lean-mass
 * change. This avoids treating every kilogram of weight change as having one
 * fixed caloric value.
 * Hall KD. Int J Obes. 2008;32(3):573-576. PMID: 17848938.
 * https://pubmed.ncbi.nlm.nih.gov/17848938/
 */
export function energyDensityForWeightChangeKcalPerKg(fatMassKg?: number): number {
  if (fatMassKg == null || !Number.isFinite(fatMassKg) || fatMassKg <= 0) {
    return DEFAULT_ENERGY_DENSITY_KCAL_PER_KG;
  }

  const leanFraction = forbesLeanFraction(fatMassKg);
  const mjPerKg =
    FAT_ENERGY_MJ_PER_KG +
    (LEAN_CHANGE_ENERGY_MJ_PER_KG - FAT_ENERGY_MJ_PER_KG) * leanFraction;
  return mjPerKg * KCAL_PER_MJ;
}

/**
 * Estimate free-living TDEE from logged intake and body-energy change.
 *
 * Each row represents one calendar day. weightKg should preferably be a
 * morning measurement; caloriesKcal is that calendar day's completed intake.
 * Therefore an estimate at the morning of day N uses completed intake through
 * day N-1 and weight change through the morning of day N.
 *
 * Research-backed pieces:
 * - Mifflin-St Jeor is used only as the cold-start prior.
 * - Hall/Forbes body-composition energetics convert trend-weight change into
 *   stored/released energy.
 *
 * Engineering choices (deliberately isolated here):
 * - robust constant-velocity Kalman filter for scale-weight noise
 * - up to 14 completed intake days per evidence window
 * - median imputation for missing intake, with reduced confidence
 * - Apple Health steps alter update responsiveness only; they are never
 *   converted into calories.
 */
export function estimateAdaptiveExpenditure(
  observations: DailyEnergyObservation[],
  profile: ExpenditureProfile,
): ExpenditureEstimate {
  const rows = [...observations]
    .filter((row) => row.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const prior = clamp(initialTdee(profile), 1200, 5000);
  if (rows.length === 0) {
    return {
      currentTdeeKcal: Math.round(prior),
      priorTdeeKcal: Math.round(prior),
      confidence: 0,
      loggedIntakeDays: 0,
      weighedDays: 0,
      totalDays: 0,
      history: [],
    };
  }

  const trendWeights = robustWeightTrend(rows, profile.weightKg);
  const history: ExpenditureDay[] = [];
  const observedIntakes: number[] = [];
  const fatMassHistory: Array<number | undefined> = [];
  let estimate = prior;
  let fatMassKg = profile.bodyFatPercent != null
    ? profile.weightKg * clamp(profile.bodyFatPercent / 100, 0.03, 0.7)
    : undefined;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const calories = finitePositive(row.caloriesKcal);
    if (calories != null) observedIntakes.push(calories);

    const recentObserved = observedIntakes.slice(-14);
    const intakeKcal = calories ?? median(recentObserved) ?? estimate;
    const intakeImputed = calories == null;

    let energyDensity = energyDensityForWeightChangeKcalPerKg(fatMassKg);
    if (i > 0 && fatMassKg != null) {
      const deltaWeight = trendWeights[i] - trendWeights[i - 1];
      const leanFraction = forbesLeanFraction(fatMassKg);
      fatMassKg = Math.max(0.1, fatMassKg + deltaWeight * (1 - leanFraction));
      energyDensity = energyDensityForWeightChangeKcalPerKg(fatMassKg);
    }
    fatMassHistory.push(fatMassKg);

    // Weight change from windowStart morning -> i morning is paired with intake
    // from windowStart -> i-1. That gives the same number of energy intervals.
    const windowStart = Math.max(0, i - 14);
    const intervalDays = i - windowStart;
    const intakeRows = rows.slice(windowStart, i);
    const weightRows = rows.slice(windowStart, i + 1);
    const windowLogged = intakeRows.filter((item) => finitePositive(item.caloriesKcal) != null).length;
    const windowWeights = weightRows.filter((item) => finitePositive(item.weightKg) != null).length;
    const intakeCoverage = intervalDays > 0 ? windowLogged / intervalDays : 0;
    const weightCoverage = weightRows.length > 0 ? windowWeights / weightRows.length : 0;

    let observedTdee: number | null = null;
    let confidence = 0;
    let stepResponseMultiplier = 1;

    if (intervalDays >= 7 && windowLogged >= 4 && windowWeights >= 3) {
      let intakeTotal = 0;
      for (let j = windowStart; j < i; j += 1) {
        const logged = finitePositive(rows[j].caloriesKcal);
        if (logged != null) {
          intakeTotal += logged;
        } else {
          const priorLogged = rows
            .slice(Math.max(0, j - 14), j)
            .map((item) => finitePositive(item.caloriesKcal))
            .filter((item): item is number => item != null);
          intakeTotal += median(priorLogged) ?? estimate;
        }
      }

      let bodyEnergyChange = 0;
      let rollingFatMass = fatMassHistory[windowStart];
      for (let j = windowStart + 1; j <= i; j += 1) {
        const deltaWeight = trendWeights[j] - trendWeights[j - 1];
        const density = energyDensityForWeightChangeKcalPerKg(rollingFatMass);
        bodyEnergyChange += deltaWeight * density;
        if (rollingFatMass != null) {
          const leanFraction = forbesLeanFraction(rollingFatMass);
          rollingFatMass = Math.max(0.1, rollingFatMass + deltaWeight * (1 - leanFraction));
        }
      }

      observedTdee = clamp((intakeTotal - bodyEnergyChange) / intervalDays, 1200, 5000);

      const maturity = clamp((i - 6) / 21, 0.15, 1);
      confidence = clamp(
        maturity * (0.62 * intakeCoverage + 0.38 * weightCoverage),
        0,
        0.98,
      );

      // Use the most recently completed activity day. Steps alter only the
      // update rate, not the expenditure observation itself.
      stepResponseMultiplier = activityResponseMultiplier(rows, i - 1, windowStart);
      const baseAlpha = 0.06 + 0.16 * confidence;
      const alpha = clamp(baseAlpha * stepResponseMultiplier, 0.05, 0.32);
      const requestedChange = (observedTdee - estimate) * alpha;
      const maxDailyChange = 120 * stepResponseMultiplier;
      estimate = clamp(
        estimate + clamp(requestedChange, -maxDailyChange, maxDailyChange),
        1200,
        5000,
      );
    }

    history.push({
      date: row.date,
      trendWeightKg: trendWeights[i],
      intakeKcal,
      intakeImputed,
      observedTdeeKcal: observedTdee == null ? null : Math.round(observedTdee),
      estimatedTdeeKcal: Math.round(estimate),
      confidence,
      energyDensityKcalPerKg: Math.round(energyDensity),
      stepResponseMultiplier,
    });
  }

  const last = history.at(-1)!;
  return {
    currentTdeeKcal: last.estimatedTdeeKcal,
    priorTdeeKcal: Math.round(prior),
    confidence: last.confidence,
    loggedIntakeDays: rows.filter((row) => finitePositive(row.caloriesKcal) != null).length,
    weighedDays: rows.filter((row) => finitePositive(row.weightKg) != null).length,
    totalDays: rows.length,
    history,
  };
}

function activityResponseMultiplier(
  rows: DailyEnergyObservation[],
  activityIndex: number,
  windowStart: number,
): number {
  if (activityIndex < 0) return 1;
  const currentSteps = finitePositive(rows[activityIndex]?.steps);
  if (currentSteps == null) return 1;

  const baselineSteps = rows
    .slice(windowStart, activityIndex)
    .map((row) => finitePositive(row.steps))
    .filter((value): value is number => value != null);
  const baseline = median(baselineSteps);
  if (baseline == null || baseline < 1000) return 1;

  const deviation = Math.abs(currentSteps - baseline) / baseline;
  return clamp(1 + Math.max(0, deviation - 0.15) * 0.8, 1, 1.35);
}

function robustWeightTrend(rows: DailyEnergyObservation[], fallbackWeightKg: number): number[] {
  let xWeight = finitePositive(rows[0]?.weightKg) ?? fallbackWeightKg;
  let xVelocity = 0;
  let p00 = 0.5;
  let p01 = 0;
  let p10 = 0;
  let p11 = 0.05;
  const result: number[] = [];

  for (const row of rows) {
    xWeight += xVelocity;
    const pp00 = p00 + p01 + p10 + p11 + 0.015;
    const pp01 = p01 + p11;
    const pp10 = p10 + p11;
    const pp11 = p11 + 0.0025;
    p00 = pp00;
    p01 = pp01;
    p10 = pp10;
    p11 = pp11;

    const measurement = finitePositive(row.weightKg);
    if (measurement != null) {
      const innovation = clamp(measurement - xWeight, -1.5, 1.5);
      const measurementVariance = 0.16;
      const s = p00 + measurementVariance;
      const k0 = p00 / s;
      const k1 = p10 / s;
      xWeight += k0 * innovation;
      xVelocity += k1 * innovation;

      const oldP00 = p00;
      const oldP01 = p01;
      p00 = (1 - k0) * oldP00;
      p01 = (1 - k0) * oldP01;
      p10 = p10 - k1 * oldP00;
      p11 = p11 - k1 * oldP01;
    }

    result.push(xWeight);
  }

  return result;
}

function finitePositive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
