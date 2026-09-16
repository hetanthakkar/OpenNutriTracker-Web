import assert from "node:assert/strict";
import test from "node:test";
import { barcodeNutritionResult } from "../lib/barcode-scan-result.ts";
import { parseCustomFood } from "../lib/custom-food.ts";

test("barcode lookup maps catalog nutrients into the shared editable scan result", () => {
  const result = barcodeNutritionResult({
    id: "food-1",
    name: "Example cereal",
    brand: "Example",
    barcode: "0123456789012",
    nutrientBase: { energy_kcal: 380, protein_g: 8, carbohydrate_g: 72, total_fat_g: 5, sodium_mg: 180, ignored: "n/a" },
    nutritionBasis: "per_100g",
    servingGrams: 40,
    servingAmount: 1,
    servingUnit: "bowl",
  });
  assert.equal(result.modelVersion, "barcode");
  assert.equal(result.basis, "per_100g");
  assert.equal(result.nutrients.energy_kcal.amount, 380);
  assert.equal(result.nutrients.sodium_mg.unit, "mg");
  assert.equal(result.nutrients.ignored, undefined);
  assert.equal(result.servingGrams, 40);
  assert.equal(result.servingUnit, "bowl");
});

test("barcode results fall back to a serving basis for unknown catalog bases", () => {
  const result = barcodeNutritionResult({ id: "food-2", name: "Food", nutrientBase: { energy_kcal: 10 }, nutritionBasis: "custom_per_serving", defaultServing: { amount: 2, msreDesc: "slices" } });
  assert.equal(result.basis, "per_serving");
  assert.equal(result.servingAmount, 2);
  assert.equal(result.servingUnit, "slices");
});

test("barcode provenance survives saving as a private food", () => {
  const food = parseCustomFood({
    name: "Example cereal", source: "barcode_scan", brand: null,
    servingAmount: 1, servingUnit: "bowl", servingGrams: 40, servingMl: null,
    nutritionBasis: "per_100g", barcode: "0123456789012", sourceUrl: null,
    energyKcal: 380, proteinG: 8, carbohydrateG: 72, totalFatG: 5,
    dietaryFiberG: 4, totalSugarsG: 12, nutrients: { energy_kcal: 380 },
  });
  assert.equal(food?.source, "barcode_scan");
});
