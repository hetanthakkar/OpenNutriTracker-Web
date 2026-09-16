"use client";

import { useEffect, useState } from "react";
import { Barcode, ChevronLeft, LoaderCircle, Search, X } from "lucide-react";
import { NutritionLabelScanner, type LabelScanDraft } from "./nutrition-label-scanner";
import type { DemoMealSection } from "./diary-view";
import { buildTargetGroups, formatNutrientAmount } from "@/lib/nutrition-targets";
import { customFoodPortions, macroValues, positivePortionAmount, selectedPortionGrams, selectedPortionMultiplier, type PortionOption } from "@/lib/food-portions";
import { mealSectionForTime } from "@/lib/meal-time";
import { diaryDateKey, energyValue, type EnergyUnit, type FoodUnitPreference } from "@/lib/user-preferences";

type Serving = {
  amount?: number;
  gmWgt?: string | number;
  msreDesc?: string;
  sortOrder?: number;
};

type SearchFood = {
  id: string;
  source?: "typesense" | "mfp" | "custom" | "recipe" | "scanned" | "open_food_facts";
  catalogFoodId?: string;
  savedNutrients?: Record<string, unknown>;
  personalized?: boolean;
  loggedCount?: number;
  name: string;
  description: string | null;
  brand: string | null;
  barcode?: string | null;
  isVegan?: boolean;
  defaultServing: Serving | null;
  nutritionPer100g?: { energyKcal: number | null; proteinG: number | null; carbohydrateG: number | null; totalFatG: number | null };
  defaultCalories?: number | null;
  defaultPortionLabel?: string;
  nutritionBasis?: string;
  servingGrams?: number | null;
  servingMl?: number | null;
  servingAmount?: number;
  servingUnit?: string;
  sourceUrl?: string | null;
};

type FoodDetail = SearchFood & {
  servings: Serving[];
  portions: PortionOption[];
  defaultPortionId: string | null;
  nutrientBase: Record<string, unknown>;
  macrosBase: {
    energyKcal: number | null;
    proteinG: number | null;
    carbohydrateG: number | null;
    totalFatG: number | null;
    dietaryFiberG: number | null;
    totalSugarsG: number | null;
    sodiumMg: number | null;
  };
  nutritionBasis: string;
  lastPortion?: { portionId: string | null; amount: number } | null;
  sourceUrl?: string | null;
  provider?: string;
  servingGrams?: number | null;
  servingMl?: number | null;
  servingAmount?: number;
  servingUnit?: string;
};

type PickerMode = "search" | "barcode";
type SavedLibrary = "custom" | "recipe" | "scanned";
const searchPageSize = 12;

type CustomFoodSearchItem = {
  id: string;
  name: string;
  brand: string | null;
  servingGrams: number | null;
  servingMl?: number | null;
  servingAmount?: number;
  servingUnit?: string;
  nutritionBasis?: string;
  source?: string;
  barcode?: string | null;
  sourceUrl?: string | null;
  nutrients: Record<string, unknown>;
  macros: { energyKcal: number; proteinG: number; carbohydrateG: number; totalFatG: number };
};

type RecipeSearchItem = {
  id: string;
  name: string;
  description: string | null;
  nutrients: Record<string, unknown>;
  macros: { energyKcal: number; proteinG: number; carbohydrateG: number; totalFatG: number };
};

type ScannedFoodSearchItem = {
  id: string;
  catalogFoodId: string;
  name: string;
  description: string;
  brand: string | null;
  barcode: string | null;
  defaultCalories: number | null;
  defaultPortionLabel: string;
  scanCount: number;
};

export type FoodPickerSelection = {
  catalogFoodId?: string;
  customFoodId?: string;
  recipeId?: string;
  mfpFoodId?: string;
  section: DemoMealSection;
  loggedAt: string;
  diaryDate: string;
  portionId: string;
  amount: number;
  name: string;
  servingLabel: string;
  kcal: number;
};

function localDateTimeInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateTimeInputForDiaryDate(diaryDate: string, dayStart: string): string {
  const now = new Date();
  if (diaryDateKey(now, dayStart) === diaryDate) return localDateTimeInput(now);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(diaryDate);
  if (!match) return localDateTimeInput(now);
  const candidate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), now.getHours(), now.getMinutes());
  if (diaryDateKey(candidate, dayStart) !== diaryDate) {
    const [hours, minutes] = dayStart.split(":").map(Number);
    candidate.setHours(hours, minutes, 0, 0);
  }
  return localDateTimeInput(candidate);
}

function servingGrams(serving: Serving | null | undefined): number | null {
  if (!serving?.gmWgt) return null;
  const grams = Number.parseFloat(String(serving.gmWgt));
  return Number.isFinite(grams) && grams > 0 ? grams : null;
}

function servingLabel(serving: Serving | null | undefined): string {
  if (!serving) return "100 g";
  const amount = serving.amount ?? 1;
  const description = serving.msreDesc ?? "serving";
  const grams = servingGrams(serving);
  return `${amount} ${description}${grams ? ` · ${grams} g` : ""}`;
}

function scaled(value: number | null, multiplier: number): string {
  if (value === null) return "—";
  const result = value * multiplier;
  return result >= 10 ? result.toFixed(0) : result.toFixed(1);
}

function defaultPortionId(portions: PortionOption[], fallback: string | null, preference: FoodUnitPreference, preserveFallback = false) {
  if (preserveFallback && fallback && portions.some((portion) => portion.id === fallback)) return fallback;
  const preferred = preference === "imperial"
    ? portions.find((portion) => portion.id === "oz" || portion.unit.toLowerCase() === "oz")
    : portions.find((portion) => portion.id === "g" || portion.unit.toLowerCase() === "g");
  return preferred?.id ?? fallback ?? portions[0]?.id ?? "";
}

function scaledNutrients(nutrients: Record<string, unknown>, multiplier: number): Record<string, number> {
  return Object.fromEntries(Object.entries(nutrients).flatMap(([key, value]) => (
    typeof value === "number" && Number.isFinite(value) ? [[key, value * multiplier]] : []
  )));
}

function normalizedSearchText(value: string | null | undefined) {
  return (value ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isCatalogFood(result: SearchFood) {
  return result.source === "typesense" || result.source === "mfp";
}

function customFoodSearchResults(items: CustomFoodSearchItem[]): SearchFood[] {
  return items.map((item) => {
    const scale = item.nutritionBasis === "per_100g" || item.nutritionBasis === "per_100ml" ? 1 : item.servingGrams && item.servingGrams > 0 ? 100 / item.servingGrams : 1;
    return {
      id: item.id,
      source: "custom",
      name: item.name,
      description: "Your custom food",
      brand: item.brand,
      defaultServing: { amount: item.servingAmount ?? 1, gmWgt: item.servingGrams ?? undefined, msreDesc: item.servingUnit ?? "custom serving" },
      nutritionPer100g: {
        energyKcal: item.macros.energyKcal * scale,
        proteinG: item.macros.proteinG * scale,
        carbohydrateG: item.macros.carbohydrateG * scale,
        totalFatG: item.macros.totalFatG * scale,
      },
      savedNutrients: item.nutrients,
      nutritionBasis: item.nutritionBasis,
      servingGrams: item.servingGrams,
      servingMl: item.servingMl,
      servingAmount: item.servingAmount,
      servingUnit: item.servingUnit,
      sourceUrl: item.sourceUrl,
    };
  });
}

function recipeSearchResults(items: RecipeSearchItem[]): SearchFood[] {
  return items.map((item) => ({
    id: item.id,
    source: "recipe",
    name: item.name,
    description: item.description ?? "Your recipe",
    brand: "Recipe",
    defaultServing: { amount: 1, gmWgt: 100, msreDesc: "recipe serving" },
    nutritionPer100g: item.macros,
    savedNutrients: item.nutrients,
  }));
}

function scannedFoodSearchResults(items: ScannedFoodSearchItem[]): SearchFood[] {
  return items.map((item) => ({
    id: item.id,
    source: "scanned",
    catalogFoodId: item.catalogFoodId,
    name: item.name,
    description: item.description,
    brand: item.brand,
    barcode: item.barcode,
    defaultServing: null,
    defaultCalories: item.defaultCalories,
    defaultPortionLabel: item.defaultPortionLabel,
    loggedCount: item.scanCount,
  }));
}

/** Keep personal entries distinct, but merge equivalent catalog matches across providers. */
function mergeSearchResults(current: SearchFood[], additions: SearchFood[]) {
  const merged = [...current];
  for (const candidate of additions) {
    if (!isCatalogFood(candidate)) {
      if (!merged.some((item) => item.source === candidate.source && item.id === candidate.id)) merged.push(candidate);
      continue;
    }
    const name = normalizedSearchText(candidate.name);
    const brand = normalizedSearchText(candidate.brand);
    const duplicateIndex = merged.findIndex((item) => isCatalogFood(item)
      && normalizedSearchText(item.name) === name
      && normalizedSearchText(item.brand) === brand);
    if (duplicateIndex === -1) {
      merged.push(candidate);
    } else if (candidate.source === "typesense" && merged[duplicateIndex].source === "mfp") {
      merged[duplicateIndex] = candidate;
    }
  }
  return merged;
}

export function FoodPicker({
  mode,
  initialDate,
  dayStart,
  foodUnit,
  energyUnit,
  locale,
  showMicros,
  onClose,
  onAddToDiary,
}: {
  mode: PickerMode;
  initialDate: string;
  dayStart: string;
  foodUnit: FoodUnitPreference;
  energyUnit: EnergyUnit;
  locale: string;
  showMicros: boolean;
  onClose: () => void;
  onAddToDiary: (selection: FoodPickerSelection) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [savedLibrary, setSavedLibrary] = useState<SavedLibrary | null>(null);
  const [results, setResults] = useState<SearchFood[]>([]);
  const [food, setFood] = useState<FoodDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchOffset, setSearchOffset] = useState(searchPageSize);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [loggedAtInput, setLoggedAtInput] = useState(() => dateTimeInputForDiaryDate(initialDate, dayStart));
  const [portionId, setPortionId] = useState("");
  const [amountInput, setAmountInput] = useState("1");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const term = query.trim();
    // Keep the result list mounted while a food detail is open. Selecting a
    // result changes `food`, but it does not change the search inputs, so it
    // must not restart the same request when the user navigates back.
    if (mode !== "search" || (!savedLibrary && term.length === 1)) {
      return;
    }

    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      setResults([]);
      setHasMore(false);
      setSearchOffset(searchPageSize);
      const requestTimeout = window.setTimeout(() => controller.abort(), 15_000);
      let successfulCatalogRequests = 0;
      let publishedResults = 0;
      let timedOut = false;

      const publish = (items: SearchFood[], options?: { catalog?: boolean; hasMore?: boolean }) => {
        if (options?.catalog) successfulCatalogRequests += 1;
        publishedResults += items.length;
        if (!active) return;
        setResults((current) => mergeSearchResults(current, items));
        if (options?.hasMore) setHasMore(true);
        // Personal matches and either catalog are useful immediately; a slow
        // supplemental provider should never hold the entire result list back.
        if (items.length > 0 || options?.catalog) setLoading(false);
      };

      const recordFailure = (requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") timedOut = true;
      };

      try {
        if (savedLibrary) {
          const encodedTerm = encodeURIComponent(term);
          const response = await fetch(
            savedLibrary === "custom" ? `/api/custom-foods?query=${encodedTerm}` : savedLibrary === "recipe" ? `/api/recipes?query=${encodedTerm}` : `/api/scanned-foods?query=${encodedTerm}`,
            { signal: controller.signal },
          );
          const data = await response.json() as {
            foods?: CustomFoodSearchItem[];
            recipes?: RecipeSearchItem[];
            message?: string;
          };
          if (!response.ok) throw new Error(data.message ?? `Could not load your ${savedLibrary === "custom" ? "foods" : savedLibrary === "recipe" ? "recipes" : "scanned foods"}.`);
          if (active) setResults(savedLibrary === "custom" ? customFoodSearchResults(data.foods ?? []) : savedLibrary === "recipe" ? recipeSearchResults(data.recipes ?? []) : scannedFoodSearchResults((data.foods ?? []) as unknown as ScannedFoodSearchItem[]));
          return;
        }
        const recent = term.length === 0;
        if (recent) {
          const response = await fetch("/api/foods?recent=true&limit=8", { signal: controller.signal });
          const data = await response.json() as { results?: SearchFood[]; message?: string };
          if (!response.ok) throw new Error(data.message ?? "Could not load recent foods.");
          publish((data.results ?? []).map((item) => ({ ...item, source: "typesense" as const })), { catalog: true });
        } else {
          const encodedTerm = encodeURIComponent(term);
          const requests = [
            (async () => {
              const response = await fetch(`/api/foods?query=${encodedTerm}&limit=${searchPageSize}&offset=0`, { signal: controller.signal });
              const data = await response.json() as { results?: SearchFood[]; hasMore?: boolean; message?: string };
              if (!response.ok) throw new Error(data.message ?? "Food search failed.");
              publish((data.results ?? []).map((item) => ({ ...item, source: "typesense" as const })), { catalog: true, hasMore: data.hasMore });
            })(),
            (async () => {
              const response = await fetch(`/api/custom-foods?query=${encodedTerm}`, { signal: controller.signal });
              const data = await response.json() as { foods?: CustomFoodSearchItem[]; message?: string };
              if (!response.ok) throw new Error(data.message ?? "Custom food search failed.");
              publish(customFoodSearchResults(data.foods ?? []));
            })(),
            (async () => {
              const response = await fetch(`/api/recipes?query=${encodedTerm}`, { signal: controller.signal });
              const data = await response.json() as { recipes?: RecipeSearchItem[]; message?: string };
              if (!response.ok) throw new Error(data.message ?? "Recipe search failed.");
              publish(recipeSearchResults(data.recipes ?? []));
            })(),
            (async () => {
              const response = await fetch(`/api/mfp-foods?query=${encodedTerm}&limit=${searchPageSize}&offset=0`, { signal: controller.signal });
              const data = await response.json() as { results?: SearchFood[]; hasMore?: boolean; message?: string };
              if (!response.ok) throw new Error(data.message ?? "MFP food search failed.");
              publish((data.results ?? []).map((item) => ({ ...item, source: "mfp" as const })), { catalog: true, hasMore: data.hasMore });
            })(),
          ];
          const outcomes = await Promise.allSettled(requests);
          outcomes.forEach((outcome) => {
            if (outcome.status === "rejected") recordFailure(outcome.reason);
          });

          if (active && successfulCatalogRequests === 0 && publishedResults === 0) {
            setError(timedOut ? "Search took too long. Please try again." : "Food catalogs are temporarily unavailable.");
          }
        }
      } catch (requestError) {
        recordFailure(requestError);
        if (active) setError(timedOut ? "Search took too long. Please try again." : requestError instanceof Error ? requestError.message : "Food search failed.");
      } finally {
        window.clearTimeout(requestTimeout);
        if (active) setLoading(false);
      }
    }, 600);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [mode, query, savedLibrary]);

  const loadMoreResults = async () => {
    const term = query.trim();
    if (savedLibrary || term.length < 2 || loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const [catalogResponse, mfpResponse] = await Promise.all([
        fetch(`/api/foods?query=${encodeURIComponent(term)}&limit=${searchPageSize}&offset=${searchOffset}`),
        fetch(`/api/mfp-foods?query=${encodeURIComponent(term)}&limit=${searchPageSize}&offset=${searchOffset}`),
      ]);
      const catalogData = await catalogResponse.json() as { results?: SearchFood[]; hasMore?: boolean; message?: string };
      const mfpData = mfpResponse.ok ? await mfpResponse.json() as { results?: SearchFood[]; hasMore?: boolean } : {};
      if (!catalogResponse.ok) throw new Error(catalogData.message ?? "Food search failed.");
      const additions = [
        ...(catalogData.results ?? []).map((item) => ({ ...item, source: "typesense" as const })),
        ...(mfpData.results ?? []).map((item) => ({ ...item, source: "mfp" as const })),
      ];
      setResults((current) => mergeSearchResults(current, additions));
      setSearchOffset((offset) => offset + searchPageSize);
      setHasMore(Boolean(catalogData.hasMore || mfpData.hasMore));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Food search failed.");
    } finally {
      setLoadingMore(false);
    }
  };

  const openFood = async (result: SearchFood) => {
    setLoading(true);
    setError("");
    try {
      if (result.source === "custom" || result.source === "recipe") {
        const serving = result.defaultServing!;
        const rawNutrients = { ...(result.savedNutrients ?? {}), energy_kcal:result.source === "recipe" ? result.nutritionPer100g?.energyKcal ?? 0 : (result.savedNutrients?.energy_kcal ?? 0), protein_g:result.source === "recipe" ? result.nutritionPer100g?.proteinG ?? 0 : (result.savedNutrients?.protein_g ?? 0), carbohydrate_g:result.source === "recipe" ? result.nutritionPer100g?.carbohydrateG ?? 0 : (result.savedNutrients?.carbohydrate_g ?? 0), total_fat_g:result.source === "recipe" ? result.nutritionPer100g?.totalFatG ?? 0 : (result.savedNutrients?.total_fat_g ?? 0) };
        const portion = result.source === "custom" ? customFoodPortions({ nutritionBasis:result.nutritionBasis, servingGrams:result.servingGrams ?? servingGrams(serving), servingMl:result.servingMl, servingAmount:result.servingAmount ?? serving.amount, servingUnit:result.servingUnit ?? serving.msreDesc }) : [{ id:"serving", label:servingLabel(serving), unit:serving.msreDesc ?? "serving", amount:serving.amount ?? 1, nutrientMultiplier:1, grams:null }];
        setFood({ ...result, servings:[serving], portions:portion, defaultPortionId:portion[0]?.id ?? null, nutrientBase:rawNutrients, macrosBase:macroValues(rawNutrients), nutritionBasis:result.source === "custom" ? "custom_per_serving" : "recipe_per_serving" });
        const selectedId = defaultPortionId(portion, portion[0]?.id ?? null, foodUnit, result.source === "custom");
        setPortionId(selectedId); setAmountInput(String(portion.find((item) => item.id === selectedId)?.amount ?? 1)); return;
      }
      if (result.source === "scanned") {
        const response = await fetch(`/api/scanned-foods/${encodeURIComponent(result.id)}`);
        const data = await response.json() as FoodDetail & { message?: string };
        if (!response.ok) throw new Error(data.message ?? "Could not load scanned food.");
        setFood(data);
        const selectedId = defaultPortionId(data.portions, data.defaultPortionId, foodUnit);
        setPortionId(selectedId);
        setAmountInput(String(data.portions.find((portion) => portion.id === selectedId)?.amount ?? 1));
        return;
      }
      const response = await fetch(`/${result.source === "mfp" ? "api/mfp-foods" : "api/foods"}/${encodeURIComponent(result.id)}`);
      const data = await response.json() as FoodDetail & { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Food lookup failed.");
      setFood({ ...data, source: result.source ?? "typesense" });
      const remembered = data.lastPortion && data.portions.some((portion) => portion.id === data.lastPortion?.portionId) ? data.lastPortion : null;
      const selectedId = remembered?.portionId ?? defaultPortionId(data.portions, data.defaultPortionId, foodUnit);
      setPortionId(selectedId);
      setAmountInput(String(remembered?.amount ?? data.portions.find((portion) => portion.id === selectedId)?.amount ?? 1));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Food lookup failed.");
    } finally {
      setLoading(false);
    }
  };

  const saveScannedFood = async (draft: LabelScanDraft) => {
    const nutrients = draft.nutrients;
    const response = await fetch("/api/custom-foods", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({
      ...draft, brand:draft.brand || null, source:draft.barcode ? "barcode_scan" : "label_scan", energyKcal:nutrients.energy_kcal ?? 0, proteinG:nutrients.protein_g ?? 0, carbohydrateG:nutrients.carbohydrate_g ?? 0, totalFatG:nutrients.total_fat_g ?? 0, dietaryFiberG:nutrients.dietary_fiber_g ?? 0, totalSugarsG:nutrients.total_sugars_g ?? 0,
    }) });
    const data = await response.json() as CustomFoodSearchItem & { message?: string; nutrients:Record<string, unknown>; macros:FoodDetail["macrosBase"] };
    if (!response.ok) throw new Error(data.message ?? "Could not save this private food.");
    const portions = customFoodPortions({ nutritionBasis:data.nutritionBasis, servingGrams:data.servingGrams, servingMl:data.servingMl, servingAmount:data.servingAmount, servingUnit:data.servingUnit });
    setFood({ id:data.id, source:"custom", name:data.name, description:"Private scanned food", brand:data.brand, barcode:data.barcode, defaultServing:{ amount:data.servingAmount ?? 1, gmWgt:data.servingGrams ?? undefined, msreDesc:data.servingUnit ?? "serving" }, servings:[], portions, defaultPortionId:portions[0]?.id ?? null, nutrientBase:data.nutrients, macrosBase:data.macros, nutritionBasis:data.nutritionBasis ?? "per_serving", servingGrams:data.servingGrams, servingMl:data.servingMl, servingAmount:data.servingAmount, servingUnit:data.servingUnit });
    setPortionId(portions[0]?.id ?? "serving"); setAmountInput(String(portions[0]?.amount ?? 1));
  };

  const saveOpenFoodFactsFood = async (external: FoodDetail) => {
    const nutrients = scaledNutrients(external.nutrientBase, 1);
    const response = await fetch("/api/custom-foods", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ name:external.name, brand:external.brand, barcode:external.barcode, source:"open_food_facts", sourceUrl:external.sourceUrl, nutritionBasis:external.nutritionBasis, servingGrams:external.portions.find((portion) => portion.id === "serving")?.grams ?? null, servingAmount:1, servingUnit:"serving", nutrients, energyKcal:nutrients.energy_kcal ?? 0, proteinG:nutrients.protein_g ?? 0, carbohydrateG:nutrients.carbohydrate_g ?? 0, totalFatG:nutrients.total_fat_g ?? 0, dietaryFiberG:nutrients.dietary_fiber_g ?? 0, totalSugarsG:nutrients.total_sugars_g ?? 0 }) });
    const data = await response.json() as { id?:string; message?:string };
    if (!response.ok || !data.id) throw new Error(data.message ?? "Could not save the Open Food Facts product.");
    return data.id;
  };

  const selectedPortion = food?.portions.find((portion) => portion.id === portionId) ?? food?.portions[0] ?? null;
  const amount = positivePortionAmount(amountInput);
  const multiplier = selectedPortion ? selectedPortionMultiplier(selectedPortion, amount) : 0;
  const selectedGrams = selectedPortion ? selectedPortionGrams(selectedPortion, amount) : null;
  const micronutrientGroups = food
    ? buildTargetGroups(scaledNutrients(food.nutrientBase, multiplier)).filter((group) => group.name === "Vitamins & related" || group.name === "Minerals")
    : [];

  const addToDiary = async () => {
    if (!food || amount <= 0) {
      if (food) setError("Enter an amount greater than zero.");
      return;
    }
    const loggedAtDate = new Date(loggedAtInput);
    if (Number.isNaN(loggedAtDate.getTime())) {
      setError("Choose a valid date and time.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const customFoodId = food.source === "open_food_facts" ? await saveOpenFoodFactsFood(food) : undefined;
      await onAddToDiary({
        ...(customFoodId ? { customFoodId } : food.source === "custom" ? { customFoodId: food.id } : food.source === "recipe" ? { recipeId: food.id } : food.source === "scanned" ? { catalogFoodId: food.catalogFoodId } : food.source === "mfp" ? { mfpFoodId: food.id } : { catalogFoodId: food.id }),
        section: mealSectionForTime(loggedAtDate),
        loggedAt: loggedAtDate.toISOString(),
        diaryDate: diaryDateKey(loggedAtDate, dayStart),
        portionId: selectedPortion?.id ?? "",
        amount,
        name: food.name,
        servingLabel: selectedPortion ? `${amount} ${selectedPortion.unit}${selectedGrams === null ? "" : ` · ${selectedGrams.toFixed(selectedGrams >= 10 ? 0 : 1)} g`}` : "",
        kcal: Math.round((food.macrosBase.energyKcal ?? 0) * multiplier),
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save this diary entry.");
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop food-picker-backdrop" role="presentation" onMouseDown={onClose}>
      <section className={`food-picker-sheet ${!food && mode === "barcode" ? "nutrition-label-sheet" : ""}`} role="dialog" aria-modal="true" aria-labelledby="food-picker-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="food-picker-head">
          {food ? <button className="icon-button" aria-label="Back to results" onClick={() => setFood(null)}><ChevronLeft size={20} /></button> : <span className={`round-icon ${mode === "barcode" ? "teal" : "green"}`}>{mode === "barcode" ? <Barcode size={19} /> : <Search size={19} />}</span>}
          <div>
            <span className="eyebrow">Food catalog</span>
            <h2 id="food-picker-title">{food ? food.name : mode === "barcode" ? "Scan barcode or nutrition" : "Search foods"}</h2>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}><X size={20} /></button>
        </header>

        {!food && mode === "search" && <div className="food-picker-search">
          <Search size={19} />
          <input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setHasMore(false); }} placeholder={savedLibrary === "custom" ? "Search your foods" : savedLibrary === "recipe" ? "Search your recipes" : "Search foods, brands or categories"} aria-label="Search foods, brands or categories" />
          {loading && <LoaderCircle className="spin" size={18} />}
        </div>}

        {!food && mode === "search" && <div className="food-picker-library-tabs" role="group" aria-label="Your saved food library">
          <button type="button" aria-pressed={savedLibrary === "custom"} className={savedLibrary === "custom" ? "active" : ""} onClick={() => { setSavedLibrary((current) => current === "custom" ? null : "custom"); setHasMore(false); }}>My foods</button>
          <button type="button" aria-pressed={savedLibrary === "recipe"} className={savedLibrary === "recipe" ? "active" : ""} onClick={() => { setSavedLibrary((current) => current === "recipe" ? null : "recipe"); setHasMore(false); }}>Recipes</button>
          <button type="button" aria-pressed={savedLibrary === "scanned"} className={savedLibrary === "scanned" ? "active" : ""} onClick={() => { setSavedLibrary((current) => current === "scanned" ? null : "scanned"); setHasMore(false); }}>Scanned</button>
        </div>}

        {!food && mode === "barcode" && <NutritionLabelScanner locale={locale} onSaved={saveScannedFood} onClose={onClose} />}

        {error && <p className="food-picker-error" role="alert">{error}</p>}

        {!food && mode === "search" && <div className="food-search-results">
          {!savedLibrary && query.trim().length === 1 ? <p className="food-picker-placeholder">Type one more character to search.</p> : !loading && results.length === 0 ? <p className="food-picker-placeholder">{savedLibrary === "custom" ? query.trim() ? "No saved foods match that search." : "No saved foods yet. Create one in Account to find it here." : savedLibrary === "recipe" ? query.trim() ? "No recipes match that search." : "No recipes yet. Create one in Account to find it here." : savedLibrary === "scanned" ? query.trim() ? "No scanned foods match that search." : "No scanned products yet. Scan a barcode to save it here." : query.trim() ? "No foods found. Try fewer or different words." : "Your recently logged foods will appear here."}</p> : results.map((result) => (
            <button key={`${result.source ?? "catalog"}-${result.id}`} onClick={() => void openFood(result)}>
              <span className="food-result-mark">{result.name.slice(0, 1).toUpperCase()}</span>
              <span><strong>{result.name}</strong><small>{result.source === "scanned" ? `Scanned${result.loggedCount && result.loggedCount > 1 ? ` · ${result.loggedCount} times` : ""}` : result.personalized ? `Recently logged${result.loggedCount && result.loggedCount > 1 ? ` · ${result.loggedCount} times` : ""}` : result.brand ?? result.description ?? "Food catalog"}{result.source === "mfp" ? " · MFP" : ""}{result.defaultPortionLabel ? ` · ${result.defaultPortionLabel}` : ""}{result.isVegan ? " · Vegan" : ""}</small></span>
              <b>{typeof (result.defaultCalories ?? result.nutritionPer100g?.energyKcal) === "number" ? energyValue(result.defaultCalories ?? result.nutritionPer100g?.energyKcal ?? 0, energyUnit).toLocaleString(locale, { maximumFractionDigits: 0 }) : "—"}<small> {energyUnit}</small></b>
            </button>
          ))}
        </div>}

        {!food && mode === "search" && hasMore && <button className="secondary-button food-search-more" disabled={loadingMore} onClick={() => void loadMoreResults()}>{loadingMore ? <LoaderCircle className="spin" size={17} /> : null}{loadingMore ? "Loading more foods…" : "Load more foods"}</button>}

        {food && <div className="food-detail-panel">
          <p className="food-detail-meta">{food.brand ?? "Food catalog"}{food.barcode ? ` · ${food.barcode}` : ""}{food.isVegan ? " · Vegan" : ""}</p>
          <div className="food-serving-controls">
            <label>Amount<input type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" value={amountInput} aria-invalid={amount <= 0} onChange={(event) => setAmountInput(event.target.value)} onBlur={() => { if (amount <= 0) setAmountInput(String(selectedPortion?.amount ?? 1)); }} /></label>
            <label>Unit<select value={selectedPortion?.id ?? ""} onChange={(event) => { const next = food.portions.find((portion) => portion.id === event.target.value); setPortionId(event.target.value); if (next) setAmountInput(String(next.amount)); }}>{food.portions.map((portion) => <option key={portion.id} value={portion.id}>{portion.label}</option>)}</select></label>
          </div>
          <p className="food-portion-summary">{selectedGrams === null ? `Nutrition is relative to the catalog’s ${selectedPortion?.label ?? "serving"}; its gram weight is unavailable.` : `${amount} ${selectedPortion?.unit ?? "serving"} = ${selectedGrams.toFixed(selectedGrams >= 10 ? 0 : 1)} g`}</p>
          <div className="food-macro-preview">
            <div><span>Energy</span><strong>{food.macrosBase.energyKcal === null ? "—" : energyValue(food.macrosBase.energyKcal * multiplier, energyUnit).toLocaleString(locale, { maximumFractionDigits: food.macrosBase.energyKcal * multiplier >= 10 ? 0 : 1 })} <small>{energyUnit}</small></strong></div>
            <div><span>Carbs</span><strong>{scaled(food.macrosBase.carbohydrateG, multiplier)} <small>g</small></strong></div>
            <div><span>Fat</span><strong>{scaled(food.macrosBase.totalFatG, multiplier)} <small>g</small></strong></div>
            <div><span>Protein</span><strong>{scaled(food.macrosBase.proteinG, multiplier)} <small>g</small></strong></div>
          </div>
          {showMicros && <details className="food-micronutrients">
            <summary><span><strong>Vitamins & minerals</strong><small>For this selected serving</small></span><span>View details</span></summary>
            <div className="food-micronutrient-groups">
              {micronutrientGroups.map((group) => <section key={group.name}>
                <h3>{group.name}</h3>
                <div>{group.rows.map((nutrient) => <p key={nutrient.key}><span>{nutrient.name}</span><strong>{formatNutrientAmount(nutrient.amount)} <small>{nutrient.unit}</small></strong></p>)}</div>
              </section>)}
            </div>
          </details>}
          <p className="food-basis-note">Calculated from the catalog’s {food.nutritionBasis.replaceAll("_", " ")} nutrition values.</p>
          <label className="food-log-datetime"><span>Log date and time</span><input type="datetime-local" value={loggedAtInput} step={60} onChange={(event) => setLoggedAtInput(event.target.value)} /><small>Defaults to now. You can change it anytime.</small></label>
          <button className="primary-button food-add-button" disabled={saving || amount <= 0} onClick={() => void addToDiary()}>{saving ? "Saving…" : "Log food"}</button>
        </div>}
      </section>
    </div>
  );
}
