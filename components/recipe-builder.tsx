"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, LoaderCircle, Plus, Search, X } from "lucide-react";
import { macroValues, positivePortionAmount, scaleNutrients, selectedPortionGrams, selectedPortionMultiplier, type PortionOption } from "@/lib/food-portions";
import { formatEnergy, type EnergyUnit } from "@/lib/user-preferences";

type Source = "typesense" | "mfp" | "custom" | "scanned";
type Nutrients = Record<string, number>;

type SearchResult = {
  id: string;
  source: Source;
  name: string;
  brand: string | null;
  description: string | null;
  defaultCalories: number | null;
  nutrients?: Record<string, unknown>;
  servingGrams?: number;
};

type ScannedFoodSearchResult = SearchResult & {
  catalogFoodId: string;
};

type FoodDetail = {
  id: string;
  source: Source;
  name: string;
  brand: string | null;
  portions: PortionOption[];
  defaultPortionId: string | null;
  nutrientBase: Record<string, unknown>;
};

type Ingredient = {
  id: string;
  sourceItemId: string;
  source: Source;
  name: string;
  brand: string | null;
  portionId: string;
  amount: number;
  unit: string;
  grams: number | null;
  nutrients: Nutrients;
};

export type EditableRecipe = {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  ingredients: unknown[];
};

export type SavedRecipe = EditableRecipe & {
  nutrients: Record<string, unknown>;
  macros: { energyKcal: number; proteinG: number; carbohydrateG: number; totalFatG: number };
};

function numericNutrients(value: Record<string, unknown>): Nutrients {
  return Object.fromEntries(Object.entries(value).flatMap(([key, amount]) => (
    typeof amount === "number" && Number.isFinite(amount) ? [[key, amount]] : []
  )));
}

function addNutrients(ingredients: Ingredient[]) {
  return ingredients.reduce<Nutrients>((total, ingredient) => {
    for (const [key, amount] of Object.entries(ingredient.nutrients)) total[key] = (total[key] ?? 0) + amount;
    return total;
  }, {});
}

function divideNutrients(nutrients: Nutrients, divisor: number) {
  return Object.fromEntries(Object.entries(nutrients).map(([key, amount]) => [key, Number((amount / divisor).toFixed(4))]));
}

function amountLabel(amount: number, unit: string, grams: number | null) {
  const displayedAmount = Number.isInteger(amount) ? String(amount) : Number(amount.toFixed(2)).toString();
  return `${displayedAmount} ${unit}${grams === null ? "" : ` · ${grams.toFixed(grams >= 10 ? 0 : 1)} g`}`;
}

function editableIngredients(value: unknown[]): Ingredient[] {
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>;
    const source = item.source;
    const sourceItemId = typeof item.sourceItemId === "string" ? item.sourceItemId : "";
    const name = typeof item.name === "string" ? item.name : "";
    const amount = Number(item.amount);
    const unit = typeof item.unit === "string" ? item.unit : "serving";
    if ((source !== "typesense" && source !== "mfp" && source !== "custom" && source !== "scanned") || !sourceItemId || !name || !Number.isFinite(amount) || amount <= 0) return [];
    const grams = item.grams === null || item.grams === undefined ? null : Number(item.grams);
    return [{
      id: crypto.randomUUID(), source, sourceItemId, name,
      brand: typeof item.brand === "string" ? item.brand : null,
      portionId: typeof item.portionId === "string" ? item.portionId : "serving",
      amount, unit, grams: Number.isFinite(grams) && grams !== null ? grams : null,
      nutrients: numericNutrients(item.nutrients && typeof item.nutrients === "object" ? item.nutrients as Record<string, unknown> : {}),
    }];
  });
}

function detailFromCustomFood(result: SearchResult): FoodDetail {
  const grams = result.servingGrams ?? 100;
  const portion: PortionOption = {
    id: "custom-serving", label: `1 serving · ${grams} g`, unit: "serving", amount: 1, nutrientMultiplier: 1, grams,
  };
  return {
    id: result.id, source: "custom", name: result.name, brand: result.brand,
    portions: [portion], defaultPortionId: portion.id, nutrientBase: result.nutrients ?? {},
  };
}

/** Builds recipe nutrition from a selected catalog food and its portion engine multiplier. */
export function RecipeBuilder({ onToast, energyUnit = "kcal", recipe, onSaved, onCancel }: { onToast: (message: string) => void; energyUnit?: EnergyUnit; recipe?: EditableRecipe; onSaved?: (recipe: SavedRecipe) => void; onCancel?: () => void }) {
  const [recipeName, setRecipeName] = useState(() => recipe?.name ?? "");
  const [description, setDescription] = useState(() => recipe?.description ?? "");
  const [servingsInput, setServingsInput] = useState(() => String(recipe?.servings ?? 2));
  const [ingredients, setIngredients] = useState<Ingredient[]>(() => recipe ? editableIngredients(recipe.ingredients) : []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selection, setSelection] = useState<FoodDetail | null>(null);
  const [portionId, setPortionId] = useState("");
  const [amountInput, setAmountInput] = useState("1");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || selection) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const [catalogResponse, mfpResponse, customResponse, scannedResponse] = await Promise.all([
          fetch(`/api/foods?query=${encodeURIComponent(term)}&limit=8`, { signal: controller.signal }),
          fetch(`/api/mfp-foods?query=${encodeURIComponent(term)}`, { signal: controller.signal }),
          fetch(`/api/custom-foods?query=${encodeURIComponent(term)}`, { signal: controller.signal }),
          fetch(`/api/scanned-foods?query=${encodeURIComponent(term)}`, { signal: controller.signal }),
        ]);
        const catalog = await catalogResponse.json() as { results?: SearchResult[]; message?: string };
        const mfp = await mfpResponse.json() as { results?: SearchResult[] };
        const custom = await customResponse.json() as { foods?: Array<{ id: string; name: string; brand: string | null; nutrients: Record<string, unknown>; servingGrams: number; macros: { energyKcal: number } }> };
        const scanned = await scannedResponse.json() as { foods?: ScannedFoodSearchResult[] };
        if (!catalogResponse.ok) throw new Error(catalog.message ?? "Food search failed.");
        setResults([
          ...(custom.foods ?? []).map((food) => ({ id: food.id, source: "custom" as const, name: food.name, brand: food.brand, description: "Your custom food", defaultCalories: food.macros.energyKcal, nutrients: food.nutrients, servingGrams: food.servingGrams })),
          ...(scannedResponse.ok ? scanned.foods ?? [] : []).map((food) => ({ ...food, source: "scanned" as const, description: food.description ?? "Scanned product" })),
          ...(catalog.results ?? []).map((food) => ({ ...food, source: "typesense" as const })),
          ...(mfpResponse.ok ? mfp.results ?? [] : []).map((food) => ({ ...food, source: "mfp" as const })),
        ]);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Food search failed.");
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, selection]);

  const selectedPortion = selection?.portions.find((portion) => portion.id === portionId) ?? selection?.portions[0] ?? null;
  const amount = positivePortionAmount(amountInput);
  const multiplier = selectedPortion ? selectedPortionMultiplier(selectedPortion, amount) : 0;
  const selectedGrams = selectedPortion ? selectedPortionGrams(selectedPortion, amount) : null;
  const selectedNutrients = selection ? numericNutrients(scaleNutrients(selection.nutrientBase, multiplier)) : {};
  const selectedMacros = macroValues(selectedNutrients);
  const totals = useMemo(() => addNutrients(ingredients), [ingredients]);
  const servings = Number(servingsInput);
  const servingsForCalculation = Number.isFinite(servings) && servings > 0 ? servings : 1;
  const perServing = useMemo(() => divideNutrients(totals, servingsForCalculation), [servingsForCalculation, totals]);
  const perServingMacros = macroValues(perServing);

  const selectFood = async (result: SearchResult) => {
    setSearching(true);
    setError("");
    try {
      let detail: FoodDetail;
      if (result.source === "custom") {
        detail = detailFromCustomFood(result);
      } else if (result.source === "scanned") {
        const response = await fetch(`/api/scanned-foods/${encodeURIComponent(result.id)}`);
        const data = await response.json() as Omit<FoodDetail, "source"> & { message?: string };
        if (!response.ok) throw new Error(data.message ?? "Could not load scanned food.");
        detail = { ...data, source: "scanned" };
      } else {
        const endpoint = result.source === "mfp" ? "/api/mfp-foods" : "/api/foods";
        const response = await fetch(`${endpoint}/${encodeURIComponent(result.id)}`);
        const data = await response.json() as Omit<FoodDetail, "source"> & { message?: string };
        if (!response.ok) throw new Error(data.message ?? "Could not load food portions.");
        detail = { ...data, source: result.source };
      }
      const defaultPortion = detail.portions.find((portion) => portion.id === detail.defaultPortionId) ?? detail.portions[0];
      if (!defaultPortion) throw new Error("This food has no usable serving size.");
      setSelection(detail);
      setPortionId(defaultPortion.id);
      setAmountInput(String(defaultPortion.amount));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load this food.");
    } finally {
      setSearching(false);
    }
  };

  const addIngredient = () => {
    if (!selection || !selectedPortion || amount <= 0) return;
    setIngredients((current) => [...current, {
      id: `${selection.source}:${selection.id}:${crypto.randomUUID()}`,
      sourceItemId: selection.id,
      source: selection.source, name: selection.name, brand: selection.brand, portionId: selectedPortion.id,
      amount, unit: selectedPortion.unit, grams: selectedGrams, nutrients: selectedNutrients,
    }]);
    setSelection(null);
    setQuery("");
    setResults([]);
    setPickerOpen(false);
    onToast(`${selection.name} added to the recipe.`);
  };

  const saveRecipe = async () => {
    if (ingredients.length === 0) { setError("Add at least one ingredient before saving."); return; }
    if (!servingsInput.trim() || !Number.isFinite(servings) || servings <= 0 || servings > 1000) { setError("Enter between 1 and 1,000 servings."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(recipe ? `/api/recipes/${encodeURIComponent(recipe.id)}` : "/api/recipes", {
        method: recipe ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: recipeName, description, servings,
          ingredients: ingredients.map((ingredient) => ({
            source: ingredient.source,
            sourceItemId: ingredient.sourceItemId,
            name: ingredient.name,
            brand: ingredient.brand,
            portionId: ingredient.portionId,
            amount: ingredient.amount,
            unit: ingredient.unit,
            grams: ingredient.grams,
            nutrients: ingredient.nutrients,
          })),
          nutrients: perServing,
          energyKcal: perServingMacros.energyKcal ?? 0,
          carbohydrateG: perServingMacros.carbohydrateG ?? 0,
          totalFatG: perServingMacros.totalFatG ?? 0,
          proteinG: perServingMacros.proteinG ?? 0,
        }),
      });
      const data = await response.json() as SavedRecipe & { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Could not save recipe.");
      if (recipe) {
        onSaved?.(data);
        onToast(`${data.name} updated.`);
      } else {
        setRecipeName(""); setDescription(""); setServingsInput("2"); setIngredients([]);
        onToast(`${data.name ?? "Recipe"} saved with calculated nutrition.`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save recipe.");
    } finally {
      setSaving(false);
    }
  };

  if (pickerOpen) return <section className="ingredient-picker ingredient-picker-view">
    <div className="ingredient-picker-head"><div><span className="eyebrow">Ingredient library</span><h3>Add an ingredient</h3><p>Search your scanned foods, saved foods, the catalog, and MFP.</p></div><button aria-label="Back to recipe" onClick={() => { setPickerOpen(false); setSelection(null); }}><ChevronLeft size={18} /></button></div>
    {!selection ? <>
      <label className="ingredient-search"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search foods, brands, or ingredients" />{searching ? <LoaderCircle className="spin" size={16} /> : <kbd>2+ letters</kbd>}</label>
      <div className="ingredient-results">
        {query.trim().length < 2 ? <div className="ingredient-empty"><Search size={20} /><strong>Search your food sources</strong><span>Type at least two letters to search your scanned products, Typesense, MFP, and saved foods.</span></div> :
          results.length ? results.map((food) => <button key={`${food.source}-${food.id}`} onClick={() => void selectFood(food)}><span>{food.name.slice(0, 1).toUpperCase()}</span><span><strong>{food.name}</strong><small>{food.brand ?? food.description ?? "Food catalog"}{food.source === "mfp" ? " · MFP" : food.source === "custom" ? " · Your food" : food.source === "scanned" ? " · Scanned" : ""}</small></span><i><Plus size={16} /></i></button>) : !searching && <div className="ingredient-empty"><Search size={20} /><strong>No foods found</strong><span>Try another name, scan it, or add it as a custom food first.</span></div>}
      </div>
    </> : <div className="panel-stack">
      <div className="ingredient-picker-head"><div><h3>{selection.name}</h3><p>{selection.brand ?? (selection.source === "custom" ? "Your custom food" : selection.source === "mfp" ? "MFP food" : "Food catalog")}</p></div><button aria-label="Back to search" onClick={() => setSelection(null)}><ChevronLeft size={18} /></button></div>
      <div className="form-row"><label className="settings-field"><span>Amount</span><input type="number" inputMode="decimal" min="0.01" step="0.01" value={amountInput} aria-invalid={amount <= 0} onChange={(event) => setAmountInput(event.target.value)} onBlur={() => { if (amount <= 0) setAmountInput(String(selectedPortion?.amount ?? 1)); }} /></label><label className="settings-field"><span>Unit</span><select value={selectedPortion?.id ?? ""} onChange={(event) => { const next = selection.portions.find((portion) => portion.id === event.target.value); setPortionId(event.target.value); if (next) setAmountInput(String(next.amount)); }}>{selection.portions.map((portion) => <option key={portion.id} value={portion.id}>{portion.label}</option>)}</select></label></div>
      <p className="food-portion-summary">{selectedGrams === null ? "The catalog does not provide this serving's gram weight." : amountLabel(amount, selectedPortion?.unit ?? "serving", selectedGrams)}</p>
      <div className="food-macro-preview"><div><span>Energy</span><strong>{formatEnergy(selectedMacros.energyKcal ?? 0, energyUnit)}</strong></div><div><span>Carbs</span><strong>{(selectedMacros.carbohydrateG ?? 0).toFixed(1)} <small>g</small></strong></div><div><span>Fat</span><strong>{(selectedMacros.totalFatG ?? 0).toFixed(1)} <small>g</small></strong></div><div><span>Protein</span><strong>{(selectedMacros.proteinG ?? 0).toFixed(1)} <small>g</small></strong></div></div>
      <button className="primary-button panel-button" disabled={amount <= 0} onClick={addIngredient}><Plus size={17} /> Add ingredient</button>
    </div>}
    {error && <p className="food-picker-error" role="alert">{error}</p>}
  </section>;

  return <div className="recipe-form panel-stack">
    <div className="form-row"><label className="settings-field"><span>Recipe name</span><input value={recipeName} onChange={(event) => setRecipeName(event.target.value)} placeholder="e.g. Weeknight salmon bowl" /></label><label className="settings-field"><span>Servings</span><input type="number" value={servingsInput} min="1" onChange={(event) => setServingsInput(event.target.value)} /></label></div>
    <label className="settings-field"><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional notes or preparation details" /></label>
    <div className="ingredient-head"><h3>Ingredients</h3><span>{ingredients.length} item{ingredients.length === 1 ? "" : "s"}</span></div>
    <div className="ingredient-list">{ingredients.length ? ingredients.map((ingredient, index) => <div key={ingredient.id}><span>{index + 1}</span><p><strong>{ingredient.name}</strong><small>{amountLabel(ingredient.amount, ingredient.unit, ingredient.grams)} · {formatEnergy(ingredient.nutrients.energy_kcal ?? 0, energyUnit)}</small></p><button aria-label={`Remove ${ingredient.name}`} onClick={() => setIngredients((current) => current.filter((item) => item.id !== ingredient.id))}><X size={16} /></button></div>) : <p className="food-picker-placeholder">No ingredients yet.</p>}</div>
    <button className="secondary-button panel-button" onClick={() => setPickerOpen(true)}><Plus size={17} /> Add ingredient</button>
    <div className="recipe-summary"><span>Per serving · calculated from ingredients</span><strong>{formatEnergy(perServingMacros.energyKcal ?? 0, energyUnit)}</strong><small>Carbs {(perServingMacros.carbohydrateG ?? 0).toFixed(1)} g · Fat {(perServingMacros.totalFatG ?? 0).toFixed(1)} g · Protein {(perServingMacros.proteinG ?? 0).toFixed(1)} g</small></div>
    {error && <p className="food-picker-error" role="alert">{error}</p>}{recipe && onCancel && <button className="secondary-button panel-button" disabled={saving} onClick={onCancel}>Cancel editing</button>}<button className="primary-button panel-button" disabled={saving || !recipeName.trim() || ingredients.length === 0} onClick={() => void saveRecipe()}>{saving ? "Saving…" : recipe ? "Update recipe" : "Save recipe"}</button>
  </div>;
}
