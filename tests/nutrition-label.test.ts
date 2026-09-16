import assert from "node:assert/strict";
import test from "node:test";

import { parseNutritionLabel, reconcileNutritionScans, type NutritionScanResult, type OcrLine } from "../lib/nutrition-label.ts";

function lines(text: string[]): OcrLine[] {
  return text.map((value, index) => ({
    text: value,
    score: 0.98,
    poly: [{ x: 0, y: index * 20 }],
  }));
}

test("parses a per-100g label with total, saturated, and trans fat", () => {
  const result = parseNutritionLabel(lines([
    "NUTRITIONAL INFORMATION PER 100g",
    "ENERGY 539 Kcal",
    "PROTEIN 7.4 g",
    "CARBOHYDRATES 56.9 g",
    "TOTAL FAT 29.5 g",
    "SATURATED FAT 14.0 g",
    "TRANS FAT <0.1 g",
    "SODIUM 760 mg",
  ]), "PP-OCRv5", 100);

  assert.equal(result.basis, "per_100g");
  assert.equal(result.nutrients.total_fat_g.amount, 29.5);
  assert.equal(result.nutrients.saturated_fat_g.amount, 14);
  assert.equal(result.nutrients.trans_fat_g.amount, 0.1);
  assert.equal(result.nutrients.trans_fat_g.qualifier, "lt");
});

test("does not crash when OCR omits salt, sodium, or a child nutrient", () => {
  const result = parseNutritionLabel(lines([
    "Calories 210 kcal",
    "Total Fat 8 g",
    "Carbohydrate 30 g",
    "Protein 6 g",
  ]), "PP-OCRv5", 100);

  assert.equal(result.nutrients.total_fat_g.amount, 8);
  assert.equal(result.nutrients.saturated_fat_g, undefined);
  assert.equal(result.nutrients.sodium_mg, undefined);
});

test("reconstructs nutrients when OCR returns table cells separately and out of order", () => {
  const cell = (text: string, x: number, y: number): OcrLine => ({
    text,
    score: 0.97,
    poly: [
      { x, y },
      { x: x + 100, y },
      { x: x + 100, y: y + 18 },
      { x, y: y + 18 },
    ],
  });
  const result = parseNutritionLabel([
    cell("29.5 g", 240, 100),
    cell("7.4 g", 240, 60),
    cell("TOTAL FAT", 10, 100),
    cell("PER 100 g", 240, 20),
    cell("PROTEIN", 10, 60),
    cell("ENERGY", 10, 40),
    cell("539 kcal", 240, 40),
  ], "PP-OCRv6-small-det-small-rec", 100);

  assert.equal(result.basis, "per_100g");
  assert.equal(result.nutrients.energy_kcal.amount, 539);
  assert.equal(result.nutrients.protein_g.amount, 7.4);
  assert.equal(result.nutrients.total_fat_g.amount, 29.5);
});

test("reconciles repeated live camera views without keeping a one-frame outlier", () => {
  const frameOne = parseNutritionLabel(lines([
    "Calories 210 kcal", "Total Fat 8 g", "Carbohydrate 30 g", "Protein 6 g", "Sodium 900 mg",
  ]), "PP-OCRv6-small-det-small-rec", 100);
  const frameTwo = parseNutritionLabel(lines([
    "Calories 211 kcal", "Total Fat 8 g", "Carbohydrate 30.1 g", "Protein 6 g",
  ]), "PP-OCRv6-small-det-small-rec", 100);
  const frameThree = parseNutritionLabel(lines([
    "Calories 210 kcal", "Total Fat 8 g", "Carbohydrate 30 g", "Protein 6.1 g",
  ]), "PP-OCRv6-small-det-small-rec", 100);

  const result = reconcileNutritionScans([frameOne, frameTwo, frameThree]);
  assert.ok(result);
  assert.equal(result.nutrients.energy_kcal.amount, 210);
  assert.equal(result.nutrients.carbohydrate_g.amount, 30);
  assert.equal(result.nutrients.protein_g.amount, 6);
  assert.equal(result.nutrients.sodium_mg, undefined);
  assert.match(result.warnings.join(" "), /reconciled across 3 live camera frames/i);
});

test("uses the nutrition amount column and ignores the US daily-value column", () => {
  const cell = (text: string, x: number, y: number): OcrLine => ({
    text,
    score: 0.98,
    poly: [{ x, y }, { x: x + 100, y }, { x: x + 100, y: y + 18 }, { x, y: y + 18 }],
  });
  const result = parseNutritionLabel([
    cell("Nutrition Facts", 10, 10),
    cell("Amount per serving", 240, 30),
    cell("% Daily Value", 390, 30),
    cell("Calories", 10, 55), cell("230", 240, 55),
    cell("Total Fat", 10, 80), cell("8 g", 240, 80), cell("10%", 390, 80),
    cell("Total Carbohydrate", 10, 105), cell("30 g", 240, 105), cell("11%", 390, 105),
    cell("Protein", 10, 130), cell("6 g", 240, 130),
  ], "PP-OCRv6-small-det-small-rec", 100);

  assert.equal(result.basis, "per_serving");
  assert.equal(result.nutrients.energy_kcal.amount, 230);
  assert.equal(result.nutrients.total_fat_g.amount, 8);
  assert.equal(result.nutrients.carbohydrate_g.amount, 30);
  assert.equal(result.nutrients.protein_g.amount, 6);
  assert.equal(result.nutrients.total_fat_g.column, "nutrition");
});

test("chooses the serving column on a dual-column Canadian-style label", () => {
  const cell = (text: string, x: number, y: number): OcrLine => ({
    text,
    score: 0.99,
    poly: [{ x, y }, { x: x + 90, y }, { x: x + 90, y: y + 16 }, { x, y: y + 16 }],
  });
  const result = parseNutritionLabel([
    cell("Nutrition Facts", 10, 10),
    cell("Per 100 g", 180, 28), cell("Amount per serving", 300, 28), cell("% Daily Value", 420, 28),
    cell("Serving Size 1 cup (250 mL)", 10, 48),
    cell("Calories", 10, 70), cell("80 kcal", 180, 70), cell("200", 300, 70),
    cell("Total Fat", 10, 92), cell("2 g", 180, 92), cell("5 g", 300, 92), cell("7%", 420, 92),
    cell("Carbohydrate", 10, 114), cell("12 g", 180, 114), cell("30 g", 300, 114),
    cell("Protein", 10, 136), cell("2.4 g", 180, 136), cell("6 g", 300, 136),
  ], "PP-OCRv6-small-det-small-rec", 100);

  assert.equal(result.basis, "per_serving");
  assert.equal(result.servingMl, 250);
  assert.equal(result.nutrients.energy_kcal.amount, 200);
  assert.equal(result.nutrients.total_fat_g.amount, 5);
  assert.equal(result.nutrients.carbohydrate_g.amount, 30);
  assert.equal(result.nutrients.protein_g.amount, 6);
});

test("normalizes comma decimals and derives sodium from salt without reading percent values", () => {
  const result = parseNutritionLabel(lines([
    "Nutritional information per 100 g",
    "Energy 1,200 kJ",
    "Total Fat 3,5 g 5%",
    "Carbohydrates 12,4 g",
    "Protein 7,2 g",
    "Salt 1,25 g 21%",
  ]), "PP-OCRv6-small-det-small-rec", 100);

  assert.equal(result.basis, "per_100g");
  assert.equal(result.nutrients.energy_kcal.amount, Number((1200 / 4.184).toFixed(4)));
  assert.equal(result.nutrients.total_fat_g.amount, 3.5);
  assert.equal(result.nutrients.sodium_mg.amount, 500);
  assert.equal(result.nutrients.sodium_mg.derived, true);
});

test("keeps a one-frame value visible but marked unstable in a live preview", () => {
  const stableFrame = parseNutritionLabel(lines([
    "Calories 210 kcal", "Total Fat 8 g", "Carbohydrate 30 g", "Protein 6 g",
  ]), "PP-OCRv6-small-det-small-rec", 100, 0, { frameQuality: 0.9 });
  const partialFrame = parseNutritionLabel(lines([
    "Calories 210 kcal", "Total Fat 8 g", "Carbohydrate 30 g", "Protein 6 g", "Sodium 900 mg",
  ]), "PP-OCRv6-small-det-small-rec", 100, 0, { frameQuality: 0.9 });
  const result = reconcileNutritionScans([stableFrame, partialFrame], { minimumAgreement: 2, includeUnstable: true });

  assert.ok(result);
  assert.equal(result.nutrients.energy_kcal.stable, true);
  assert.equal(result.nutrients.sodium_mg.amount, 900);
  assert.equal(result.nutrients.sodium_mg.stable, false);
  assert.match(result.warnings.join(" "), /still being confirmed/i);
});

test("keeps reconciling when a partial worker result contains an empty nutrient entry", () => {
  const clearFrame = parseNutritionLabel(lines([
    "Calories 210 kcal", "Total Fat 8 g", "Carbohydrate 30 g", "Protein 6 g",
  ]), "PP-OCRv6-small-det-small-rec", 100, 0, { frameQuality: 0.9 });
  // A Worker payload is external data at this boundary. Its sparse shape
  // must not recreate the old `undefined.amount` live-scanner crash.
  const partialFrame = {
    ...clearFrame,
    nutrients: { ...clearFrame.nutrients, incomplete_worker_item: undefined },
  } as unknown as NutritionScanResult;

  const result = reconcileNutritionScans([clearFrame, partialFrame], { minimumAgreement: 2, includeUnstable: true });
  assert.ok(result);
  assert.equal(result.nutrients.energy_kcal.amount, 210);
  assert.equal(result.nutrients.incomplete_worker_item, undefined);
});
