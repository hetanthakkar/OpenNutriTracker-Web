import { macroValues, typesensePortions } from "@/lib/food-portions";

export type JsonObject = Record<string, unknown>;

export type FoodDetailRow = {
  id: string;
  provider: string;
  source_food_id: string;
  food_name: string;
  food_description: string | null;
  brand_name: string | null;
  barcode: string | null;
  category_tag: string | null;
  is_common: boolean;
  is_branded: boolean;
  food_group_id: string | null;
  default_serving: JsonObject | null;
  servings: JsonObject[];
  nutrients: JsonObject;
  energy_kcal: string | null;
  protein_g: string | null;
  carbohydrate_g: string | null;
  total_fat_g: string | null;
  dietary_fiber_g: string | null;
  total_sugars_g: string | null;
  sodium_mg: string | null;
  nutrition_basis: string;
  is_vegan: boolean;
};

function toNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

export function serializeFoodDetail(food: FoodDetailRow) {
  const portions = typesensePortions(food.default_serving, food.servings);
  const macros = macroValues(food.nutrients);
  const effectiveBasis = portions.every((portion) => portion.grams === null)
    ? "per_source_serving_unknown_weight"
    : food.nutrition_basis;
  return {
    id: food.id,
    provider: food.provider,
    sourceFoodId: food.source_food_id,
    name: food.food_name,
    description: food.food_description,
    brand: food.brand_name,
    barcode: food.barcode,
    category: food.category_tag,
    isCommon: food.is_common,
    isBranded: food.is_branded,
    foodGroupId: food.food_group_id,
    defaultServing: food.default_serving,
    servings: food.servings,
    portions,
    defaultPortionId: portions[0]?.id ?? null,
    nutrientBase: food.nutrients,
    macrosBase: macros,
    nutritionPer100g: food.nutrients,
    macrosPer100g: {
      energyKcal: toNumber(food.energy_kcal),
      proteinG: toNumber(food.protein_g),
      carbohydrateG: toNumber(food.carbohydrate_g),
      totalFatG: toNumber(food.total_fat_g),
      dietaryFiberG: toNumber(food.dietary_fiber_g),
      totalSugarsG: toNumber(food.total_sugars_g),
      sodiumMg: toNumber(food.sodium_mg),
    },
    nutritionBasis: effectiveBasis,
    isVegan: food.is_vegan,
  };
}

export const foodDetailColumns = `
  id, provider, source_food_id, food_name, food_description, brand_name,
  barcode, category_tag, is_common, is_branded, food_group_id,
  default_serving, servings, nutrients,
  energy_kcal, protein_g, carbohydrate_g, total_fat_g,
  dietary_fiber_g, total_sugars_g, sodium_mg, nutrition_basis,
  EXISTS (
    SELECT 1
    FROM food_catalog.app.vegan_products AS vegan
    WHERE vegan.canonical_barcode = nullif(ltrim(barcode, '0'), '')
  ) AS is_vegan
`;
