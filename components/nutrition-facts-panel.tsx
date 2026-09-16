"use client";

import { Check, Pencil } from "lucide-react";
import type { NutritionScanResult } from "@/lib/nutrition-label";
import type { LiveNutrientEdits, LiveServingEdits } from "@/lib/nutrition-live-draft";

const fields = [
  ["energy_kcal", "Calories", "kcal", "calories"],
  ["total_fat_g", "Total Fat", "g", "major"],
  ["saturated_fat_g", "Saturated Fat", "g", "child"],
  ["trans_fat_g", "Trans Fat", "g", "child"],
  ["cholesterol_mg", "Cholesterol", "mg", "major"],
  ["sodium_mg", "Sodium", "mg", "major"],
  ["carbohydrate_g", "Total Carbohydrate", "g", "major"],
  ["dietary_fiber_g", "Dietary Fiber", "g", "child"],
  ["total_sugars_g", "Total Sugars", "g", "child"],
  ["source_added_sugars_g", "Added Sugars", "g", "child"],
  ["protein_g", "Protein", "g", "major"],
  ["vitamin_d_d2_d3_ug", "Vitamin D", "ug", "minor"],
  ["calcium_mg", "Calcium", "mg", "minor"],
  ["iron_mg", "Iron", "mg", "minor"],
  ["potassium_mg", "Potassium", "mg", "minor"],
] as const;

export function NutritionFactsPanel({ draft, foodName, foodBrand, edits, onEdit, onServingChange, onFoodNameChange, onFoodBrandChange, disabled = false }: {
  draft: NutritionScanResult;
  foodName: string;
  foodBrand: string;
  edits: LiveNutrientEdits;
  onEdit: (key: string, unit: "kcal" | "g" | "mg" | "ug", raw: string) => void;
  onServingChange: (edit: LiveServingEdits) => void;
  onFoodNameChange: (value: string) => void;
  onFoodBrandChange: (value: string) => void;
  disabled?: boolean;
}) {
  return <section className="scan-facts" aria-label="Editable nutrition facts">
    <div className="scan-facts-grip" aria-hidden="true" />
    <header className="scan-facts-heading"><h3>Nutrition Facts</h3><span><Pencil size={12} /> Tap to edit</span></header>
    <div className="scan-food-identity">
      <label><span>Food name</span><input value={foodName} disabled={disabled} onChange={(event) => onFoodNameChange(event.target.value)} placeholder="e.g. Edamame" /></label>
      <label><span>Brand <em>optional</em></span><input value={foodBrand} disabled={disabled} onChange={(event) => onFoodBrandChange(event.target.value)} placeholder="e.g. Homemade" /></label>
    </div>
    <div className="scan-facts-serving">
      <span>Serving size</span>
      <div>
        <input aria-label="Serving amount" type="number" inputMode="decimal" min="0.01" step="any" placeholder="1" value={draft.servingAmount ?? ""} onChange={(event) => onServingChange({ servingAmount: event.target.value === "" ? null : Number(event.target.value) })} />
        <input aria-label="Serving unit" placeholder="serving" value={draft.servingUnit ?? ""} onChange={(event) => onServingChange({ servingUnit: event.target.value })} />
      </div>
    </div>
    <details className="scan-serving-details">
      <summary>{draft.servingGrams != null ? `${draft.servingGrams} g` : draft.servingMl != null ? `${draft.servingMl} ml` : "Serving details"} · {draft.basis === "per_100g" ? "per 100 g" : draft.basis === "per_100ml" ? "per 100 ml" : draft.basis === "per_package" ? "per package" : "per serving"}</summary>
      <div>
        <label>Weight (g)<input type="number" inputMode="decimal" min="0.01" step="any" placeholder="Optional" value={draft.servingGrams ?? ""} onChange={(event) => onServingChange({ servingGrams: event.target.value === "" ? null : Number(event.target.value) })} /></label>
        <label>Volume (ml)<input type="number" inputMode="decimal" min="0.01" step="any" placeholder="Optional" value={draft.servingMl ?? ""} onChange={(event) => onServingChange({ servingMl: event.target.value === "" ? null : Number(event.target.value) })} /></label>
        <label className="scan-serving-basis">Values are<select value={draft.basis} onChange={(event) => onServingChange({ basis: event.target.value as NutritionScanResult["basis"] })}><option value="per_serving">Per serving</option><option value="per_100g">Per 100 g</option><option value="per_100ml">Per 100 ml</option><option value="per_package">Per package</option></select></label>
      </div>
    </details>
    <div className="scan-facts-rows">
      {fields.map(([key, label, unit, kind]) => {
        const value = draft.nutrients[key];
        const edited = edits[key] !== undefined;
        const raw = edited ? edits[key].raw : value?.amount ?? "";
        const invalid = raw !== "" && (!Number.isFinite(Number(raw)) || Number(raw) < 0);
        const state = edited ? "edited" : value?.amount == null ? "waiting" : value.stable ? "confirmed" : "reading";
        return <label key={key} className={`scan-facts-row ${kind} ${state}`}>
          <span>{label}</span>
          <div className="scan-facts-value">
            <span className="scan-facts-marker" title={state === "edited" ? "Your edit is protected from new scans" : state}>
              {edited ? <Pencil size={11} /> : state === "confirmed" ? <Check size={12} /> : state === "reading" ? <i /> : null}
            </span>
            <input aria-label={`${label} (${unit})`} aria-invalid={invalid || undefined} type="text" inputMode="decimal" autoComplete="off" placeholder="—" value={raw} onChange={(event) => onEdit(key, unit, event.target.value)} />
            <span className="scan-facts-unit">{unit === "ug" ? "µg" : unit}</span>
          </div>
        </label>;
      })}
    </div>
    <p className="scan-facts-note">Values fill in as you scan. Your edits stay yours.</p>
  </section>;
}
