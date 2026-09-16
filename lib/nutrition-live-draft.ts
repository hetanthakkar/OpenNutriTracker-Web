import type { NutritionScanResult, ScannedNutrient } from "./nutrition-label";

export type LiveNutrientEdits = Record<string, { raw: string; unit: ScannedNutrient["unit"] }>;
export type LiveServingEdits = Partial<Pick<NutritionScanResult, "basis" | "servingAmount" | "servingUnit" | "servingGrams" | "servingMl">>;

// Keep manual edits separate from OCR evidence. A later frame can fill any
// untouched field, but can never replace a correction (including a cleared value).
export function applyLiveNutritionEdits(scan: NutritionScanResult, nutrients: LiveNutrientEdits, serving: LiveServingEdits): NutritionScanResult {
  const merged = { ...scan, ...serving, nutrients: { ...scan.nutrients } };
  for (const [key, edit] of Object.entries(nutrients)) {
    const amount = edit.raw.trim() === "" ? null : Number(edit.raw);
    merged.nutrients[key] = {
      amount: amount !== null && Number.isFinite(amount) && amount >= 0 ? amount : null,
      unit: edit.unit,
      rawText: "Manual entry",
      ocrConfidence: 0,
      parserConfidence: 1,
      derived: false,
      stable: true,
    };
  }
  return merged;
}
