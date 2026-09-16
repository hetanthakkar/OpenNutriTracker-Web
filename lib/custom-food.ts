export type CustomFoodRow = {
  id: string;
  food_name: string;
  brand_name: string | null;
  serving_grams: string | null;
  serving_ml: string | null;
  serving_amount: string;
  serving_unit: string;
  nutrition_basis: string;
  source: string;
  barcode: string | null;
  source_url: string | null;
  nutrients: Record<string, unknown>;
  energy_kcal: string;
  protein_g: string;
  carbohydrate_g: string;
  total_fat_g: string;
  dietary_fiber_g: string;
  total_sugars_g: string;
};

export const customFoodColumns = "id, food_name, brand_name, serving_grams::text, serving_ml::text, serving_amount::text, serving_unit, nutrition_basis, source, barcode, source_url, nutrients, energy_kcal::text, protein_g::text, carbohydrate_g::text, total_fat_g::text, dietary_fiber_g::text, total_sugars_g::text";

export function serializeCustomFood(food: CustomFoodRow) {
  return {
    id: food.id, name: food.food_name, brand: food.brand_name, servingGrams: food.serving_grams === null ? null : Number(food.serving_grams), servingMl: food.serving_ml === null ? null : Number(food.serving_ml), servingAmount: Number(food.serving_amount), servingUnit: food.serving_unit, nutritionBasis: food.nutrition_basis, source: food.source, barcode: food.barcode, sourceUrl: food.source_url, nutrients: food.nutrients,
    macros: { energyKcal: Number(food.energy_kcal), proteinG: Number(food.protein_g), carbohydrateG: Number(food.carbohydrate_g), totalFatG: Number(food.total_fat_g), dietaryFiberG: Number(food.dietary_fiber_g), totalSugarsG: Number(food.total_sugars_g) },
  };
}

export type CustomFoodInput = {
  name: string; brand: string | null; servingGrams: number | null; servingMl: number | null; servingAmount: number; servingUnit: string; nutritionBasis: "per_serving" | "per_100g" | "per_100ml" | "per_package"; source: "manual" | "label_scan" | "barcode_scan" | "open_food_facts"; barcode: string | null; sourceUrl: string | null;
  energyKcal: number; proteinG: number; carbohydrateG: number; totalFatG: number; dietaryFiberG: number; totalSugarsG: number; nutrients: Record<string, number>;
};

export function parseCustomFood(value: unknown): CustomFoodInput | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const brand = typeof data.brand === "string" && data.brand.trim() ? data.brand.trim() : null;
  const number = (key: string) => typeof data[key] === "number" ? data[key] : Number(data[key]);
  const nullableNumber = (key: string) => data[key] === null || data[key] === undefined || data[key] === "" ? null : number(key);
  const servingGrams = nullableNumber("servingGrams");
  const servingMl = nullableNumber("servingMl");
  const servingAmount = data.servingAmount === undefined ? 1 : number("servingAmount");
  const servingUnit = typeof data.servingUnit === "string" && data.servingUnit.trim() ? data.servingUnit.trim().slice(0, 80) : "serving";
  const nutritionBasis = data.nutritionBasis === "per_100g" || data.nutritionBasis === "per_100ml" || data.nutritionBasis === "per_package" ? data.nutritionBasis : "per_serving";
  const source = data.source === "label_scan" || data.source === "barcode_scan" || data.source === "open_food_facts" ? data.source : "manual";
  const barcode = typeof data.barcode === "string" && data.barcode.trim() ? data.barcode.trim().replace(/[^0-9A-Za-z-]/g, "").slice(0, 128) : null;
  const sourceUrl = typeof data.sourceUrl === "string" && /^https:\/\//.test(data.sourceUrl) ? data.sourceUrl.slice(0, 1000) : null;
  const energyKcal = number("energyKcal");
  const proteinG = number("proteinG");
  const carbohydrateG = number("carbohydrateG");
  const totalFatG = number("totalFatG");
  const dietaryFiberG = number("dietaryFiberG");
  const totalSugarsG = number("totalSugarsG");
  const submittedNutrients = data.nutrients && typeof data.nutrients === "object" && !Array.isArray(data.nutrients) ? data.nutrients as Record<string, unknown> : {};
  const nutrients = Object.fromEntries(Object.entries(submittedNutrients).flatMap(([key, value]) => {
    const parsed = typeof value === "number" ? value : Number(value);
    return /^[a-z0-9_]{2,80}$/.test(key) && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100000 ? [[key, parsed]] : [];
  }));
  const values = [energyKcal, proteinG, carbohydrateG, totalFatG, dietaryFiberG, totalSugarsG];
  if (!name || name.length > 160 || (brand?.length ?? 0) > 160 || !Number.isFinite(servingAmount) || servingAmount <= 0 || servingAmount > 100000 || (servingGrams !== null && (!Number.isFinite(servingGrams) || servingGrams <= 0 || servingGrams > 10000)) || (servingMl !== null && (!Number.isFinite(servingMl) || servingMl <= 0 || servingMl > 10000)) || values.some((item) => !Number.isFinite(item) || item < 0 || item > 100000)) return null;
  return { name, brand, servingGrams, servingMl, servingAmount, servingUnit, nutritionBasis, source, barcode, sourceUrl, energyKcal, proteinG, carbohydrateG, totalFatG, dietaryFiberG, totalSugarsG, nutrients };
}

export function nutrientSnapshot(input: CustomFoodInput) {
  return { ...input.nutrients, energy_kcal: input.energyKcal, protein_g: input.proteinG, carbohydrate_g: input.carbohydrateG, total_fat_g: input.totalFatG, dietary_fiber_g: input.dietaryFiberG, total_sugars_g: input.totalSugarsG };
}
