import { macroValues, mfpPortions, normalizeMfpNutrients, type JsonObject } from "@/lib/food-portions";

export type MfpFoodRow = {
  id: string;
  provider: string;
  source_food_id: string;
  food_name: string;
  brand_name: string | null;
  verified: boolean | null;
  serving_sizes: JsonObject[];
  nutrients: JsonObject;
  nutrition_source: string;
};

export const mfpFoodColumns = `
  id, provider, source_food_id, food_name, brand_name, verified,
  serving_sizes, nutrients, nutrition_source
`;

export function serializeMfpFoodDetail(food: MfpFoodRow) {
  const nutrientBase = normalizeMfpNutrients(food.nutrients);
  const portions = mfpPortions(food.serving_sizes);
  return {
    id: food.id,
    source: "mfp" as const,
    provider: food.provider,
    sourceFoodId: food.source_food_id,
    name: food.food_name,
    description: food.verified ? "Verified MFP food" : "MFP food",
    brand: food.brand_name,
    barcode: null,
    category: null,
    isCommon: false,
    isBranded: Boolean(food.brand_name),
    isVegan: false,
    defaultServing: null,
    servings: food.serving_sizes,
    portions,
    defaultPortionId: portions[0]?.id ?? null,
    nutrientBase,
    macrosBase: macroValues(nutrientBase),
    nutritionBasis: "mfp_base_serving",
  };
}
