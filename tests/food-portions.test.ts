import assert from "node:assert/strict";
import test from "node:test";
import { customFoodPortions, selectedPortionGrams, selectedPortionMultiplier } from "../lib/food-portions.ts";

test("a serving with a known weight keeps serving default and offers gram editing", () => {
  const portions = customFoodPortions({ nutritionBasis: "per_serving", servingAmount: 1, servingUnit: "serving", servingGrams: 85 });
  assert.deepEqual(portions.map((portion) => portion.id), ["serving", "g", "oz"]);
  assert.equal(portions[0].grams, 85);
  const grams = portions.find((portion) => portion.id === "g");
  assert.ok(grams);
  assert.equal(selectedPortionGrams(grams, 85), 85);
  assert.equal(selectedPortionMultiplier(grams, 85), 1);
});
