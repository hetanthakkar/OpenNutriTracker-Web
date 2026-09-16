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
  isAdaptive: boolean;
  confidence: number;
  status: "building" | "active" | "paused";
  pauseReason: "missing_intake" | "stale_weight" | "insufficient_evidence" | null;
  loggedIntakeDays: number;
  weighedDays: number;
  totalDays: number;
  recentLoggedIntakeDays: number;
  recentWeighedDays: number;
  requiredLoggedIntakeDays: number;
  requiredWeighedDays: number;
  history: ExpenditureDay[];
};

const KCAL_PER_MJ = 239.005736;
const FAT_ENERGY_MJ_PER_KG = 39.5;
const LEAN_CHANGE_ENERGY_MJ_PER_KG = 7.6;
const DEFAULT_ENERGY_DENSITY_KCAL_PER_KG = 7000;
const FORBES_KG = 10.4;
const EVIDENCE_WINDOW_DAYS = 20;
const MIN_HISTORY_DAYS = 14;
const MIN_LOGGED_INTAKE_DAYS = 10;
const MIN_WEIGHED_DAYS = 6;
const MAX_WEIGHT_AGE_DAYS = 3;
const WEIGHT_TREND_ALPHA = 0.1;

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
 * - causal exponential weight smoothing, held steady without measurements
 * - up to 20 completed intake days per evidence window
 * - median imputation for missing intake, with reduced confidence
 * - Apple Health steps alter update responsiveness only; they are never
 *   converted into calories.
 */
export function estimateAdaptiveExpenditure(
  observations: DailyEnergyObservation[],
  profile: ExpenditureProfile,
): ExpenditureEstimate {
  const rows = dailyObservations(observations);

  const prior = clamp(initialTdee(profile), 1200, 5000);
  if (rows.length === 0) {
    return {
      currentTdeeKcal: Math.round(prior),
      priorTdeeKcal: Math.round(prior),
      isAdaptive: false,
      confidence: 0,
      status: "building",
      pauseReason: null,
      loggedIntakeDays: 0,
      weighedDays: 0,
      totalDays: 0,
      recentLoggedIntakeDays: 0,
      recentWeighedDays: 0,
      requiredLoggedIntakeDays: MIN_LOGGED_INTAKE_DAYS,
      requiredWeighedDays: MIN_WEIGHED_DAYS,
      history: [],
    };
  }

  const trendWeights = robustWeightTrend(rows, profile.weightKg);
  const history: ExpenditureDay[] = [];
  const observedIntakes: number[] = [];
  const fatMassHistory: Array<number | undefined> = [];
  let estimate = prior;
  let latestConfidence = 0;
  let hasAdapted = false;
  let pauseReason: ExpenditureEstimate["pauseReason"] = null;
  let completedLoggedDays = 0;
  let lastWeightIndex = -1;
  const firstWeightIndex = rows.findIndex((row) => finitePositive(row.weightKg) != null);
  let fatMassKg = profile.bodyFatPercent != null
    ? profile.weightKg * clamp(profile.bodyFatPercent / 100, 0.03, 0.7)
    : undefined;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (i > 0 && finitePositive(rows[i - 1].caloriesKcal) != null) completedLoggedDays += 1;
    if (finitePositive(row.weightKg) != null) lastWeightIndex = i;
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
    const windowStart = Math.max(0, firstWeightIndex, i - EVIDENCE_WINDOW_DAYS);
    const intervalDays = i - windowStart;
    const intakeRows = rows.slice(windowStart, i);
    const weightRows = rows.slice(windowStart, i + 1);
    const windowLogged = intakeRows.filter((item) => finitePositive(item.caloriesKcal) != null).length;
    const windowWeights = weightRows.filter((item) => finitePositive(item.weightKg) != null).length;
    const intakeCoverage = intervalDays > 0 ? windowLogged / intervalDays : 0;
    const weightCoverage = weightRows.length > 0 ? windowWeights / weightRows.length : 0;
    const recentNutrition = rows.slice(Math.max(0, i - 7), i);
    const missingNutritionDays = recentNutrition.filter((item) => finitePositive(item.caloriesKcal) == null).length;
    const weightAge = lastWeightIndex < 0 ? Infinity : i - lastWeightIndex;
    const reliable = firstWeightIndex >= 0 && hasReliableEvidence(intervalDays, windowLogged, windowWeights);
    pauseReason = missingNutritionDays > 3 ? "missing_intake"
      : weightAge > MAX_WEIGHT_AGE_DAYS ? "stale_weight"
      : !reliable ? "insufficient_evidence" : null;

    let observedTdee: number | null = null;
    let confidence = 0;
    let stepResponseMultiplier = 1;

    if (pauseReason === null) {
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

      const maturity = clamp((completedLoggedDays - (MIN_LOGGED_INTAKE_DAYS - 1)) / 21, 0.2, 1);
      confidence = clamp(
        maturity * (0.62 * intakeCoverage + 0.38 * weightCoverage) * Math.pow(0.8, weightAge),
        0,
        0.98,
      );
      latestConfidence = confidence;
      hasAdapted = true;

      // Use the most recently completed activity day. Steps alter only the
      // update rate, not the expenditure observation itself.
      stepResponseMultiplier = activityResponseMultiplier(rows, i - 1, windowStart);
      const baseAlpha = completedLoggedDays < 21 ? 0.2 : 0.1;
      const alpha = clamp(baseAlpha * stepResponseMultiplier, 0.05, 0.32);
      const requestedChange = (observedTdee - estimate) * alpha;
      const maxDailyChange = 120 * stepResponseMultiplier;
      estimate = clamp(
        estimate + clamp(requestedChange, -maxDailyChange, maxDailyChange),
        1200,
        5000,
      );
    } else {
      // A held estimate is still useful, but its old evidence is becoming stale.
      latestConfidence *= 0.8;
    }

    history.push({
      date: row.date,
      trendWeightKg: trendWeights[i],
      intakeKcal,
      intakeImputed,
      observedTdeeKcal: observedTdee == null ? null : Math.round(observedTdee),
      estimatedTdeeKcal: Math.round(estimate),
      confidence: latestConfidence,
      energyDensityKcalPerKg: Math.round(energyDensity),
      stepResponseMultiplier,
    });
  }

  const last = history.at(-1)!;
  const recentEvidence = recentEvidenceCounts(rows);
  return {
    currentTdeeKcal: last.estimatedTdeeKcal,
    priorTdeeKcal: Math.round(prior),
    isAdaptive: hasAdapted,
    status: !hasAdapted ? "building" : pauseReason === null ? "active" : "paused",
    pauseReason: hasAdapted ? pauseReason : null,
    confidence: last.confidence,
    loggedIntakeDays: rows.filter((row) => finitePositive(row.caloriesKcal) != null).length,
    weighedDays: rows.filter((row) => finitePositive(row.weightKg) != null).length,
    totalDays: rows.length,
    recentLoggedIntakeDays: recentEvidence.loggedIntakeDays,
    recentWeighedDays: recentEvidence.weighedDays,
    requiredLoggedIntakeDays: Math.max(MIN_LOGGED_INTAKE_DAYS, Math.ceil(Math.min(EVIDENCE_WINDOW_DAYS, rows.length - 1) * 0.7)),
    requiredWeighedDays: MIN_WEIGHED_DAYS,
    history,
  };
}

function hasReliableEvidence(intervalDays: number, loggedIntakeDays: number, weighedDays: number) {
  return intervalDays >= MIN_HISTORY_DAYS
    && loggedIntakeDays >= Math.max(MIN_LOGGED_INTAKE_DAYS, Math.ceil(intervalDays * 0.7))
    && weighedDays >= MIN_WEIGHED_DAYS;
}

/** Count the most recent completed tracking window; today's partial log is excluded. */
function recentEvidenceCounts(rows: DailyEnergyObservation[]) {
  const completedRows = rows.slice(0, -1);
  const window = completedRows.slice(-EVIDENCE_WINDOW_DAYS);
  return {
    loggedIntakeDays: window.filter((row) => finitePositive(row.caloriesKcal) != null).length,
    weighedDays: rows.slice(-(EVIDENCE_WINDOW_DAYS + 1)).filter((row) => finitePositive(row.weightKg) != null).length,
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

export function robustWeightTrend(rows: DailyEnergyObservation[], fallbackWeightKg: number): number[] {
  let trend = fallbackWeightKg;
  let lastMeasuredIndex: number | null = null;
  const result: number[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const measurement = finitePositive(rows[i].weightKg);
    if (measurement != null) {
      // Account for short gaps without inventing a continuing weight velocity.
      const alpha = lastMeasuredIndex === null ? 1
        : 1 - Math.pow(1 - WEIGHT_TREND_ALPHA, Math.min(i - lastMeasuredIndex, MAX_WEIGHT_AGE_DAYS));
      trend += alpha * (measurement - trend);
      lastMeasuredIndex = i;
    }
    result.push(trend);
  }

  return result;
}

/** Normalize calendar gaps and discard empty history before tracking began. */
function dailyObservations(observations: DailyEnergyObservation[]): DailyEnergyObservation[] {
  const byDate = new Map(observations.filter((row) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return false;
    const time = Date.parse(`${row.date}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === row.date;
  }).map((row) => [row.date, row]));
  const dates = [...byDate.keys()].sort();
  const first = dates.find((date) => {
    const row = byDate.get(date)!;
    return finitePositive(row.caloriesKcal) != null || finitePositive(row.weightKg) != null;
  });
  if (!first) return [];
  const end = Date.parse(`${dates.at(-1)}T00:00:00Z`);
  const rows: DailyEnergyObservation[] = [];
  for (let time = Date.parse(`${first}T00:00:00Z`); time <= end; time += 86_400_000) {
    const date = new Date(time).toISOString().slice(0, 10);
    rows.push(byDate.get(date) ?? { date });
  }
  return rows;
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
