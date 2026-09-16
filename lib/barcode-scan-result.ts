import type { NutritionScanResult, ScannedNutrient } from "./nutrition-label";

export type BarcodeFood = {
  id: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  source?: string;
  sourceUrl?: string | null;
  nutrientBase: Record<string, unknown>;
  nutritionBasis: string;
  servingGrams?: number | null;
  servingMl?: number | null;
  servingAmount?: number;
  servingUnit?: string;
  defaultServing?: { amount?: number; gmWgt?: string | number; msreDesc?: string } | null;
};

export function barcodeNutritionResult(food: BarcodeFood): NutritionScanResult {
  const nutrients: Record<string, ScannedNutrient> = {};
  for (const [key, raw] of Object.entries(food.nutrientBase ?? {})) {
    if (raw === null || raw === undefined || raw === "" || typeof raw === "boolean") continue;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) continue;
    const unit = key === "energy_kcal" ? "kcal" : key.endsWith("_mg") ? "mg" : key.endsWith("_ug") ? "ug" : key.endsWith("_g") ? "g" : null;
    if (!unit) continue;
    nutrients[key] = { amount, unit, rawText: "Barcode lookup", ocrConfidence: 0, parserConfidence: 1, stable: true };
  }
  const basis = ["per_100g", "per_100ml", "per_package"].includes(food.nutritionBasis) ? food.nutritionBasis as NutritionScanResult["basis"] : "per_serving";
  const grams = food.servingGrams ?? Number(food.defaultServing?.gmWgt);
  return {
    basis, nutrients,
    servingLabel: food.defaultServing?.msreDesc ?? "",
    servingAmount: food.servingAmount ?? food.defaultServing?.amount ?? 1,
    servingUnit: food.servingUnit ?? food.defaultServing?.msreDesc ?? "serving",
    servingGrams: Number.isFinite(grams) && grams > 0 ? grams : null,
    servingMl: food.servingMl ?? null,
    warnings: [], rawLines: [], modelVersion: "barcode", initializationMs: 0, durationMs: 0,
  };
}
