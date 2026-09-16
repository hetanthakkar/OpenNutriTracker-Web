import assert from "node:assert/strict";
import test from "node:test";
import { parseNutritionLabel } from "../lib/nutrition-label.ts";
import { applyLiveNutritionEdits, type LiveNutrientEdits } from "../lib/nutrition-live-draft.ts";

test("later OCR fills untouched fields without replacing edited, zero, or cleared values", () => {
  const edits: LiveNutrientEdits = {
    energy_kcal: { raw: "130", unit: "kcal" },
    total_fat_g: { raw: "0", unit: "g" },
    sodium_mg: { raw: "", unit: "mg" },
  };
  const scan = parseNutritionLabel([
    { text: "Calories 150 kcal", score: 1 },
    { text: "Total Fat 14 g", score: 1 },
    { text: "Sodium 20 mg", score: 1 },
    { text: "Protein 6 g", score: 1 },
  ], "test", 0);
  const draft = applyLiveNutritionEdits(scan, edits, { servingAmount: 1, servingUnit: "tbsp", servingMl: 15, basis: "per_serving" });
  assert.equal(draft.nutrients.energy_kcal.amount, 130);
  assert.equal(draft.nutrients.total_fat_g.amount, 0);
  assert.equal(draft.nutrients.sodium_mg.amount, null);
  assert.equal(draft.nutrients.protein_g.amount, 6);
  assert.equal(draft.servingUnit, "tbsp");
  assert.equal(draft.servingMl, 15);
  assert.equal(scan.nutrients.energy_kcal.amount, 150, "OCR evidence must remain untouched");
  assert.equal(draft.nutrients.energy_kcal.stable, true);
});

test("partial or invalid edits never turn into a misleading numeric value", () => {
  const scan = parseNutritionLabel([], "test", 0);
  for (const raw of [".", "-1", "NaN", "Infinity", " "]) {
    assert.equal(applyLiveNutritionEdits(scan, { total_fat_g: { raw, unit: "g" } }, {}).nutrients.total_fat_g.amount, null);
  }
  assert.equal(applyLiveNutritionEdits(scan, { total_fat_g: { raw: "1.25", unit: "g" } }, {}).nutrients.total_fat_g.amount, 1.25);
});
