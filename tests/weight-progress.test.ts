import assert from "node:assert/strict";
import test from "node:test";
import { weightProgress } from "../lib/weight-progress.ts";

const weights = (step: number) => Array.from({ length: 14 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, weight_kg: String(80 + step * i) }));

test("weekly rate follows the existing smoothed trend and keeps its direction", () => {
  const falling = weightProgress(weights(-0.05), "2026-09-14", -0.4);
  assert.equal(falling.status, "ready");
  assert.ok(falling.weeklyChangeKg! < -0.2 && falling.weeklyChangeKg! > -0.6);
  assert.equal(falling.weeklyGoalKg, -0.4);
  assert.ok(weightProgress(weights(0.05), "2026-09-14", 0.2).weeklyChangeKg! > 0);
  assert.equal(weightProgress(weights(0), "2026-09-14", 0).weeklyChangeKg, 0);
});

test("empty, short, and duplicate-day histories do not invent a weekly rate", () => {
  for (const rows of [[], weights(0).slice(-2), [weights(0)[0], weights(0)[0], weights(0)[13]]]) {
    const result = weightProgress(rows, "2026-09-14", null);
    assert.equal(result.weeklyChangeKg, null);
    assert.equal(result.status, "building");
  }
});

test("stale measurements cannot be shown as current weekly progress", () => {
  const result = weightProgress(weights(-0.05), "2026-09-20", -0.4);
  assert.equal(result.status, "stale");
  assert.equal(result.weeklyChangeKg, null);
});

test("future and invalid weights do not affect historical progress", () => {
  const baseline = weightProgress(weights(-0.05), "2026-09-14", 0);
  const result = weightProgress([...weights(-0.05), { day: "2026-09-15", weight_kg: "150" }, { day: "2026-09-14", weight_kg: "NaN" }], "2026-09-14", 0);
  assert.deepEqual(result, baseline);
  assert.equal(result.history.length, 14);
});
