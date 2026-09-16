export type JsonObject = Record<string, unknown>;

export type PortionOption = {
  id: string;
  label: string;
  unit: string;
  amount: number;
  nutrientMultiplier: number;
  grams: number | null;
};

export type CustomNutritionBasis = "per_serving" | "per_100g" | "per_100ml" | "per_package";

type TypesenseServing = {
  amount?: unknown;
  gmWgt?: unknown;
  msreDesc?: unknown;
};

type MfpServing = {
  id?: unknown;
  index?: unknown;
  nutrition_multiplier?: unknown;
  unit?: unknown;
  value?: unknown;
};

const OUNCE_GRAMS = 28.349523125;

function positiveNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function cleanUnit(value: unknown, fallback = "serving") {
  const unit = String(value ?? "").trim();
  return unit || fallback;
}

function formatAmount(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

function portionLabel(amount: number, unit: string, grams: number | null) {
  const weight = grams === null || unit.toLowerCase() === "g" ? "" : ` · ${formatAmount(grams)} g`;
  return `${formatAmount(amount)} ${unit}${weight}`;
}

function deduplicate(options: PortionOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = `${option.unit.toLowerCase()}|${option.amount.toFixed(6)}|${option.nutrientMultiplier.toFixed(8)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Normalize Typesense's per-100g servings. Unknown-weight servings remain relative to their source serving. */
export function typesensePortions(defaultServing: JsonObject | null, servings: JsonObject[]) {
  const source = (servings.length ? servings : defaultServing ? [defaultServing] : []) as TypesenseServing[];
  const weighted = source.flatMap((serving, index): PortionOption[] => {
    const amount = positiveNumber(serving.amount) ?? 1;
    const grams = positiveNumber(serving.gmWgt);
    if (grams === null) return [];
    const unit = cleanUnit(serving.msreDesc);
    return [{ id: `source:${index}`, label: portionLabel(amount, unit, grams), unit, amount, nutrientMultiplier: grams / 100, grams }];
  });

  if (weighted.length) {
    return deduplicate([
      ...weighted,
      { id: "g", label: "1 g", unit: "g", amount: 1, nutrientMultiplier: 0.01, grams: 1 },
      { id: "oz", label: `1 oz · ${OUNCE_GRAMS.toFixed(2)} g`, unit: "oz", amount: 1, nutrientMultiplier: OUNCE_GRAMS / 100, grams: OUNCE_GRAMS },
    ]);
  }

  const fallback = source[0];
  const amount = positiveNumber(fallback?.amount) ?? 1;
  const unit = cleanUnit(fallback?.msreDesc);
  return [{ id: "source:0", label: `${formatAmount(amount)} ${unit}`, unit, amount, nutrientMultiplier: 1, grams: null }];
}

/** Normalize MFP's native serving multipliers and derive weights only when an explicit gram option exists. */
export function mfpPortions(servings: JsonObject[]) {
  const source = servings as MfpServing[];
  const gramReference = source.map((serving) => {
    const value = positiveNumber(serving.value);
    const multiplier = positiveNumber(serving.nutrition_multiplier);
    return cleanUnit(serving.unit).toLowerCase() === "g" && value && multiplier ? value / multiplier : null;
  }).find((value): value is number => value !== null);

  const options = source.flatMap((serving, arrayIndex): PortionOption[] => {
    const amount = positiveNumber(serving.value);
    const nutrientMultiplier = positiveNumber(serving.nutrition_multiplier);
    if (amount === null || nutrientMultiplier === null) return [];
    const unit = cleanUnit(serving.unit);
    const grams = gramReference === undefined ? null : nutrientMultiplier * gramReference;
    const sourceId = String(serving.id ?? serving.index ?? arrayIndex);
    return [{ id: `mfp:${sourceId}`, label: portionLabel(amount, unit, grams), unit, amount, nutrientMultiplier, grams }];
  });

  const unique = deduplicate(options).slice(0, 40);
  if (gramReference !== undefined) {
    const perGramMultiplier = 1 / gramReference;
    if (!unique.some((option) => option.unit.toLowerCase() === "g" && option.amount === 1)) {
      unique.push({ id: "g", label: "1 g", unit: "g", amount: 1, nutrientMultiplier: perGramMultiplier, grams: 1 });
    }
    unique.push({ id: "oz", label: `1 oz · ${OUNCE_GRAMS.toFixed(2)} g`, unit: "oz", amount: 1, nutrientMultiplier: OUNCE_GRAMS * perGramMultiplier, grams: OUNCE_GRAMS });
  }
  return deduplicate(unique);
}

/** Keep private foods in the basis the person reviewed, rather than inventing a gram conversion. */
export function customFoodPortions(input: {
  nutritionBasis?: string | null;
  servingGrams?: number | null;
  servingMl?: number | null;
  servingAmount?: number | null;
  servingUnit?: string | null;
}): PortionOption[] {
  const basis = input.nutritionBasis as CustomNutritionBasis | undefined ?? "per_serving";
  const amount = input.servingAmount && input.servingAmount > 0 ? input.servingAmount : 1;
  const unit = cleanUnit(input.servingUnit, basis === "per_package" ? "package" : "serving");
  if (basis === "per_100g") {
    const serving = input.servingGrams && input.servingGrams > 0
      ? [{ id: "serving", label: portionLabel(amount, unit, input.servingGrams), unit, amount, nutrientMultiplier: input.servingGrams / 100, grams: input.servingGrams }]
      : [];
    return deduplicate([...serving, { id: "g", label: "1 g", unit: "g", amount: 1, nutrientMultiplier: 0.01, grams: 1 }, { id: "oz", label: `1 oz · ${OUNCE_GRAMS.toFixed(2)} g`, unit: "oz", amount: 1, nutrientMultiplier: OUNCE_GRAMS / 100, grams: OUNCE_GRAMS }]);
  }
  if (basis === "per_100ml") {
    const serving = input.servingMl && input.servingMl > 0
      ? [{ id: "serving", label: `${formatAmount(amount)} ${unit}${unit.toLowerCase() === "ml" ? "" : ` · ${formatAmount(input.servingMl)} ml`}`, unit, amount, nutrientMultiplier: input.servingMl / 100, grams: null }]
      : [];
    return deduplicate([...serving, { id: "ml", label: "1 ml", unit: "ml", amount: 1, nutrientMultiplier: 0.01, grams: null }]);
  }
  const serving = { id: "serving", label: `${formatAmount(amount)} ${unit}`, unit, amount, nutrientMultiplier: 1, grams: input.servingGrams ?? null };
  if (input.servingGrams && input.servingGrams > 0) {
    return deduplicate([
      serving,
      { id: "g", label: "1 g", unit: "g", amount: 1, nutrientMultiplier: 1 / input.servingGrams, grams: 1 },
      { id: "oz", label: `1 oz · ${OUNCE_GRAMS.toFixed(2)} g`, unit: "oz", amount: 1, nutrientMultiplier: OUNCE_GRAMS / input.servingGrams, grams: OUNCE_GRAMS },
    ]);
  }
  return [serving];
}

export function selectedPortionMultiplier(portion: PortionOption, enteredAmount: number) {
  return (enteredAmount / portion.amount) * portion.nutrientMultiplier;
}

export function selectedPortionGrams(portion: PortionOption, enteredAmount: number) {
  return portion.grams === null ? null : (enteredAmount / portion.amount) * portion.grams;
}

/** Parse an editable amount without forcing a value while the input is temporarily blank. */
export function positivePortionAmount(value: string | number) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function scaleNutrients(nutrients: JsonObject, multiplier: number): JsonObject {
  return Object.fromEntries(Object.entries(nutrients).map(([key, value]) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return [key, value];
    return [key, Number((value * multiplier).toFixed(4))];
  }));
}

export function normalizeMfpNutrients(nutrients: JsonObject): JsonObject {
  const result: JsonObject = {};
  const mappings: Record<string, string> = {
    protein: "protein_g", carbohydrates: "carbohydrate_g", fat: "total_fat_g", fiber: "dietary_fiber_g",
    sugar: "total_sugars_g", added_sugars: "source_added_sugars_g", saturated_fat: "saturated_fat_g",
    trans_fat: "trans_fat_g", monounsaturated_fat: "monounsaturated_fat_g", polyunsaturated_fat: "polyunsaturated_fat_g",
    cholesterol: "cholesterol_mg", sodium: "sodium_mg", potassium: "potassium_mg",
    calcium: "calcium_daily_value_pct", iron: "iron_daily_value_pct", vitamin_a: "vitamin_a_daily_value_pct",
    vitamin_c: "vitamin_c_daily_value_pct", vitamin_d: "vitamin_d_daily_value_pct",
  };
  for (const [source, target] of Object.entries(mappings)) {
    const value = nutrients[source];
    if (typeof value === "number" && Number.isFinite(value)) result[target] = value;
  }
  const energy = nutrients.energy;
  if (energy && typeof energy === "object" && !Array.isArray(energy)) {
    const value = (energy as JsonObject).value;
    if (typeof value === "number" && Number.isFinite(value)) result.energy_kcal = value;
  }
  return result;
}

export function macroValues(nutrients: JsonObject) {
  const value = (key: string) => typeof nutrients[key] === "number" && Number.isFinite(nutrients[key]) ? nutrients[key] as number : null;
  return {
    energyKcal: value("energy_kcal"), proteinG: value("protein_g"), carbohydrateG: value("carbohydrate_g"),
    totalFatG: value("total_fat_g"), dietaryFiberG: value("dietary_fiber_g"),
    totalSugarsG: value("total_sugars_g"), sodiumMg: value("sodium_mg"),
  };
}
