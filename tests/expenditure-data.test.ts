import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { estimateAdaptiveExpenditure } from "../lib/expenditure.ts";
import { caloriePlanFromExpenditure } from "../lib/calorie-plan.ts";

const observations = Array.from({ length: 120 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
  caloriesKcal: 2500,
  weightKg: 80 - Math.max(0, i - 90) * 0.06,
  steps: i < 100 ? 5000 : 20000,
}));
const profile = {
  height_cm: "180", date_of_birth: "1991-01-01", energy_equation_sex: "male",
  activity_level: "moderate", weekly_rate_kg: "-0.4", calorie_adjustment_kcal: "100",
  carbs_pct: "45", fat_pct: "25", protein_pct: "30", water_goal_ml: "2100",
  latest_weight_kg: String(observations.at(-1)!.weightKg),
};
let profileAvailable = true;
let includeSteps = true;
const snapshots: unknown[][] = [];
const requests: Array<{ sql: string; values: readonly unknown[] }> = [];

mock.module("../lib/db.ts", {
  namedExports: {
    databaseQuery: async (sql: string, values: readonly unknown[] = []) => {
      requests.push({ sql, values });
      if (sql.includes("INSERT INTO")) {
        snapshots.push([...values]);
        return { rows: [] };
      }
      if (sql.includes("profile_nutrient_targets")) return { rows: [{ nutrient_code: "fiber_g", target_value: "30" }] };
      if (sql.includes("FROM food_catalog.app.profiles")) return { rows: profileAvailable ? [profile] : [] };
      if (sql.includes("FROM food_catalog.app.diary_entries")) return { rows: observations.map((row) => ({ day: row.date, calories: String(row.caloriesKcal) })) };
      if (sql.includes("FROM food_catalog.app.weight_entries")) return { rows: observations.map((row) => ({ day: row.date, weight_kg: String(row.weightKg) })) };
      if (sql.includes("FROM food_catalog.app.health_measurements")) return { rows: includeSteps ? observations.map((row) => ({ day: row.date, steps: String(row.steps) })) : [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  },
});
const { loadExpenditureData } = await import("../lib/expenditure-data.ts");
const { resolveDailyPlan } = await import("../lib/daily-plan.ts");
const asOf = observations.at(-1)!.date;

test("shared data loader and daily budget use identical dated evidence, including steps", async () => {
  const context = await loadExpenditureData("test-profile", asOf);
  const budget = await resolveDailyPlan("test-profile", asOf);
  const expected = estimateAdaptiveExpenditure(observations, {
    ageYears: 35, sex: "male", heightCm: 180, weightKg: Number(profile.latest_weight_kg), activityFactor: 1.55,
  });
  assert.deepEqual(context.estimate, expected);
  assert.equal(budget.expenditureKcal, expected.currentTdeeKcal);
  const goal = caloriePlanFromExpenditure({ expenditureKcal: expected.currentTdeeKcal, weeklyWeightChangeKg: -0.4, currentWeightKg: Number(profile.latest_weight_kg) });
  assert.equal(budget.calorieGoalKcal, goal.targetKcal + 100);
  assert.equal(budget.carbsTargetG, budget.calorieGoalKcal! * 45 / 400);
  assert.equal(budget.nutrientTargets.fiber_g, 30);
  assert.equal(snapshots.at(-1)![2], expected.currentTdeeKcal);
  assert.equal(snapshots.at(-1)![5], budget.calorieGoalKcal);
  assert.ok(requests.every(({ values }) => values[0] === "test-profile"));
});

test("optional health data changes both consumers together", async () => {
  includeSteps = false;
  try {
    const context = await loadExpenditureData("test-profile", asOf);
    const budget = await resolveDailyPlan("test-profile", asOf);
    assert.equal(budget.expenditureKcal, context.estimate!.currentTdeeKcal);
    includeSteps = true;
    const withSteps = await loadExpenditureData("test-profile", asOf);
    assert.notEqual(context.estimate!.currentTdeeKcal, withSteps.estimate!.currentTdeeKcal);
  } finally {
    includeSteps = true;
  }
});

test("incomplete setup returns no estimate or calculated budget", async () => {
  profileAvailable = false;
  const writesBefore = snapshots.length;
  try {
    const context = await loadExpenditureData("test-profile", asOf);
    const budget = await resolveDailyPlan("test-profile", asOf);
    assert.equal(context.estimate, null);
    assert.equal(budget.available, false);
    assert.equal(budget.calorieGoalKcal, null);
    assert.equal(snapshots.length, writesBefore);
  } finally {
    profileAvailable = true;
  }
});
