import assert from "node:assert/strict";
import test from "node:test";
import { estimateAdaptiveExpenditure, mifflinStJeorRmr, robustWeightTrend, type DailyEnergyObservation, type ExpenditureProfile } from "../lib/expenditure.ts";
import { caloriePlanFromExpenditure } from "../lib/calorie-plan.ts";

const profile: ExpenditureProfile = { ageYears: 35, sex: "male", heightCm: 180, weightKg: 80 };
profile.activityFactor = 2500 / mifflinStJeorRmr(profile);
const days = (count: number, overrides: (i: number) => Partial<DailyEnergyObservation> = () => ({})) =>
  Array.from({ length: count }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
    weightKg: 80, caloriesKcal: 2500, ...overrides(i),
  }));

test("empty calendar padding cannot mature confidence or change the estimate", () => {
  const padded = days(120, (i) => i < 105 ? { weightKg: null, caloriesKcal: null } : {});
  assert.deepEqual(estimateAdaptiveExpenditure(padded, profile), estimateAdaptiveExpenditure(padded.slice(105), profile));
  assert.ok(estimateAdaptiveExpenditure(padded, profile).confidence < 0.3);
  assert.equal(estimateAdaptiveExpenditure(days(120, () => ({ weightKg: null, caloriesKcal: null })), profile).confidence, 0);
});

test("startup requires 14 real intervals and enough food and weight observations", () => {
  assert.equal(estimateAdaptiveExpenditure(days(14), profile).status, "building");
  assert.equal(estimateAdaptiveExpenditure(days(15), profile).status, "active");
  const lateWeights = days(40, (i) => ({ weightKg: i < 30 ? null : 80 }));
  assert.equal(estimateAdaptiveExpenditure(lateWeights, profile).status, "building");
});

test("today's nutrition cannot affect this morning's expenditure or confidence", () => {
  const rows = days(70, (i) => ({ weightKg: 80 - i * 0.04 }));
  const baseline = estimateAdaptiveExpenditure(rows, profile);
  for (const caloriesKcal of [null, 100, 6000]) {
    const result = estimateAdaptiveExpenditure([...rows.slice(0, -1), { ...rows.at(-1)!, caloriesKcal }], profile);
    assert.equal(result.currentTdeeKcal, baseline.currentTdeeKcal);
    assert.equal(result.confidence, baseline.confidence);
    assert.equal(result.status, baseline.status);
  }
});

test("occasional missing intake is imputed, but four missing days in seven pause updates", () => {
  const rows = days(81, (i) => ({ caloriesKcal: i >= 76 ? null : 2500 }));
  const result = estimateAdaptiveExpenditure(rows, profile);
  assert.equal(result.history[79].observedTdeeKcal, 2500);
  assert.equal(result.history[80].observedTdeeKcal, null);
  assert.equal(result.status, "paused");
  assert.equal(result.pauseReason, "missing_intake");
  assert.equal(result.currentTdeeKcal, result.history[79].estimatedTdeeKcal);
  assert.ok(result.confidence < result.history[79].confidence);
});

test("stale weigh-ins hold the estimate and reduce confidence", () => {
  const rows = days(90, (i) => ({ weightKg: i <= 80 ? 80 - i * 0.04 : null }));
  const result = estimateAdaptiveExpenditure(rows, profile);
  assert.equal(result.history[83].observedTdeeKcal === null, false);
  assert.equal(result.history[84].observedTdeeKcal, null);
  assert.equal(result.pauseReason, "stale_weight");
  assert.equal(result.currentTdeeKcal, result.history[83].estimatedTdeeKcal);
  assert.ok(result.confidence < result.history[83].confidence);
  const trend = robustWeightTrend(rows, profile.weightKg);
  assert.equal(trend[89], trend[80]);
});

test("confidence decays to near zero after tracking stops and recovers with new evidence", () => {
  const stopped = days(120, (i) => i >= 80 ? { weightKg: null, caloriesKcal: null } : {});
  const estimate = estimateAdaptiveExpenditure(stopped, profile);
  assert.equal(estimate.status, "paused");
  assert.ok(estimate.confidence < 0.001);
  const resumed = [...stopped, ...days(145).slice(120)];
  const recovered = estimateAdaptiveExpenditure(resumed, profile);
  assert.equal(recovered.status, "active");
  assert.ok(recovered.confidence > 0.9);
});

test("calendar gaps count as missing days and duplicate dates cannot inflate evidence", () => {
  const rows = days(80);
  const sparse = rows.filter((_, i) => i < 74 || i === 79);
  const explicit = rows.map((row, i) => i >= 74 && i < 79 ? { date: row.date } : row);
  assert.deepEqual(estimateAdaptiveExpenditure(sparse, profile), estimateAdaptiveExpenditure(explicit, profile));
  assert.deepEqual(estimateAdaptiveExpenditure([...rows, ...rows].reverse(), profile), estimateAdaptiveExpenditure(rows, profile));
});

test("temporary water weight cannot drive a large calorie-budget change", () => {
  const result = estimateAdaptiveExpenditure(days(120, (i) => ({ weightKg: i >= 50 && i < 55 ? 82 : 80 })), profile);
  const maxError = Math.max(...result.history.slice(50).map((day) => Math.abs(day.estimatedTdeeKcal - 2500)));
  assert.ok(maxError < 160, `water-shift error: ${maxError}`);
  assert.ok(Math.abs(result.currentTdeeKcal - 2500) < 15);
});

test("isolated anomalous weigh-ins have a bounded effect", () => {
  for (const sign of [-1, 1]) {
    const result = estimateAdaptiveExpenditure(days(100, (i) => ({ weightKg: i === 50 ? 80 + sign * 3 : 80 })), profile);
    assert.ok(Math.max(...result.history.slice(50).map((day) => Math.abs(day.estimatedTdeeKcal - 2500))) < 80);
  }
});

test("sustained expenditure increases and decreases are learned in the correct direction", () => {
  for (const delta of [-400, 400]) {
    const result = estimateAdaptiveExpenditure(days(120, (i) => ({ weightKg: 80 - Math.max(0, i - 50) * delta / 7000 })), profile);
    const target = 2500 + delta;
    assert.ok(Math.abs(result.history[78].estimatedTdeeKcal - target) < 190);
    assert.ok(Math.abs(result.history[106].estimatedTdeeKcal - target) < 25);
  }
});

test("steady loss and gain converge without reversing the energy-balance sign", () => {
  for (const adjustment of [-500, 500]) {
    const result = estimateAdaptiveExpenditure(days(120, (i) => ({ caloriesKcal: 2500 + adjustment, weightKg: 80 + i * adjustment / 7000 })), profile);
    assert.ok(Math.abs(result.currentTdeeKcal - 2500) < 5);
  }
});

test("steps change responsiveness only and never add exercise calories", () => {
  const rows = days(120, (i) => ({ steps: i < 100 ? 5000 : 20000, workoutMinutes: 90 }));
  assert.equal(estimateAdaptiveExpenditure(rows, profile).currentTdeeKcal, 2500);
  const changing = rows.map((row, i) => ({ ...row, weightKg: 80 - Math.max(0, i - 90) * 0.06 }));
  const withSteps = estimateAdaptiveExpenditure(changing, profile);
  const withoutSteps = estimateAdaptiveExpenditure(changing.map((row) => ({ ...row, steps: null })), profile);
  assert.ok(withSteps.currentTdeeKcal > withoutSteps.currentTdeeKcal);
  assert.deepEqual(withSteps.history.map((day) => day.observedTdeeKcal), withoutSteps.history.map((day) => day.observedTdeeKcal));
});

test("calorie goals use the same energy conversion, respect signs and remain bounded", () => {
  for (const weeklyWeightChangeKg of [-0.5, 0, 0.5]) {
    const plan = caloriePlanFromExpenditure({ expenditureKcal: 2500, weeklyWeightChangeKg, currentWeightKg: 80 });
    assert.equal(plan.targetKcal, 2500 + weeklyWeightChangeKg * 1000);
  }
  assert.equal(caloriePlanFromExpenditure({ expenditureKcal: 1400, weeklyWeightChangeKg: -0.5, currentWeightKg: 80 }).targetKcal, 1200);
});
