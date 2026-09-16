import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { foodDetailColumns, type FoodDetailRow, type JsonObject } from "@/lib/food-catalog";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";
import { customFoodPortions, macroValues, mfpPortions, normalizeMfpNutrients, scaleNutrients, selectedPortionGrams, selectedPortionMultiplier, typesensePortions, type PortionOption } from "@/lib/food-portions";
import { mfpFoodColumns, type MfpFoodRow } from "@/lib/mfp-food-catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const mealTypes = ["breakfast", "lunch", "dinner", "snack"] as const;
type MealType = (typeof mealTypes)[number];

type CreateEntryInput = {
  catalogFoodId?: unknown; mfpFoodId?: unknown; customFoodId?: unknown; recipeId?: unknown;
  mealType?: unknown; portionId?: unknown; amount?: unknown; servingIndex?: unknown; quantity?: unknown;
  loggedAt?: unknown; diaryDate?: unknown; note?: unknown;
};

type SaveableFood = {
  id: string; sourceType: "food" | "mfp_food" | "custom_food" | "recipe"; name: string; brand: string | null;
  nutrientBase: JsonObject; nutritionBasis: string; portions: PortionOption[];
};

function isMealType(value: unknown): value is MealType {
  return typeof value === "string" && mealTypes.includes(value as MealType);
}

function parseLoggedAt(value: unknown): Date | null {
  if (value === undefined) return new Date();
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function choosePortion(food: SaveableFood, portionId: string, legacyIndex: number) {
  return food.portions.find((portion) => portion.id === portionId) ?? food.portions[legacyIndex] ?? food.portions[0] ?? null;
}

async function catalogFood(catalogFoodId: string, mfpFoodId: string): Promise<SaveableFood | null> {
  if (mfpFoodId) {
    const result = await databaseQuery<MfpFoodRow>(`SELECT ${mfpFoodColumns} FROM food_catalog.public.mfp_foods WHERE id=$1 LIMIT 1`, [mfpFoodId]);
    const row = result.rows[0];
    if (!row) return null;
    return { id:row.id,sourceType:"mfp_food",name:row.food_name,brand:row.brand_name,nutrientBase:normalizeMfpNutrients(row.nutrients),nutritionBasis:"mfp_base_serving",portions:mfpPortions(row.serving_sizes) };
  }
  const result = await databaseQuery<FoodDetailRow>(`SELECT ${foodDetailColumns} FROM food_catalog.public.typesense_foods WHERE id=$1 LIMIT 1`, [catalogFoodId]);
  const row = result.rows[0];
  if (!row) return null;
  const portions = typesensePortions(row.default_serving,row.servings);
  return { id:row.id,sourceType:"food",name:row.food_name,brand:row.brand_name,nutrientBase:row.nutrients,nutritionBasis:portions.every((portion) => portion.grams === null) ? "per_source_serving_unknown_weight" : row.nutrition_basis,portions };
}

async function savedFood(customFoodId: string, recipeId: string, profileId: string): Promise<SaveableFood | null> {
  if (customFoodId) {
    const result = await databaseQuery<{id:string;food_name:string;brand_name:string|null;serving_grams:string|null;serving_ml:string|null;serving_amount:string;serving_unit:string;nutrition_basis:string;nutrients:JsonObject}>("SELECT id,food_name,brand_name,serving_grams::text,serving_ml::text,serving_amount::text,serving_unit,nutrition_basis,nutrients FROM food_catalog.app.custom_foods WHERE id=$1 AND profile_id=$2", [customFoodId,profileId]);
    const row = result.rows[0];
    if (!row) return null;
    const basis = row.nutrition_basis || "per_serving";
    const grams = row.serving_grams === null ? null : Number(row.serving_grams);
    const ml = row.serving_ml === null ? null : Number(row.serving_ml);
    const portions = customFoodPortions({ nutritionBasis:basis, servingGrams:grams, servingMl:ml, servingAmount:Number(row.serving_amount), servingUnit:row.serving_unit });
    return { id:row.id,sourceType:"custom_food",name:row.food_name,brand:row.brand_name,nutrientBase:row.nutrients,nutritionBasis:`custom_${basis}`,portions };
  }
  const result = await databaseQuery<{id:string;recipe_name:string;nutrients:JsonObject}>("SELECT id,recipe_name,nutrients FROM food_catalog.app.recipes WHERE id=$1 AND profile_id=$2", [recipeId,profileId]);
  const row = result.rows[0];
  if (!row) return null;
  return { id:row.id,sourceType:"recipe",name:row.recipe_name,brand:null,nutrientBase:row.nutrients,nutritionBasis:"recipe_per_serving",portions:[{id:"serving",label:"1 recipe serving",unit:"recipe serving",amount:1,nutrientMultiplier:1,grams:null}] };
}

/** Recalculate and save a source-food snapshot into the current profile's diary. */
export async function POST(request: NextRequest) {
  let input: CreateEntryInput;
  try { input = await request.json() as CreateEntryInput; }
  catch { return NextResponse.json({ message:"Request body must be valid JSON." }, { status:400 }); }

  const catalogFoodId = typeof input.catalogFoodId === "string" ? input.catalogFoodId : "";
  const mfpFoodId = typeof input.mfpFoodId === "string" ? input.mfpFoodId : "";
  const customFoodId = typeof input.customFoodId === "string" ? input.customFoodId : "";
  const recipeId = typeof input.recipeId === "string" ? input.recipeId : "";
  const portionId = typeof input.portionId === "string" ? input.portionId : "";
  const legacyIndex = Number.isInteger(input.servingIndex) ? Number(input.servingIndex) : 0;
  const rawAmount = input.amount ?? input.quantity;
  const amount = typeof rawAmount === "number" ? rawAmount : Number(rawAmount);
  const loggedAt = parseLoggedAt(input.loggedAt);
  const diaryDate = typeof input.diaryDate === "string" ? input.diaryDate : loggedAt?.toISOString().slice(0,10);
  const note = typeof input.note === "string" ? input.note.trim() || null : null;
  if ([catalogFoodId,mfpFoodId,customFoodId,recipeId].filter(Boolean).length !== 1 || !isMealType(input.mealType) || legacyIndex < 0 || legacyIndex > 100 || !Number.isFinite(amount) || amount < 0.01 || amount > 100000 || !loggedAt || !diaryDate || !/^\d{4}-\d{2}-\d{2}$/.test(diaryDate) || (note?.length ?? 0) > 1000) {
    return NextResponse.json({ message:"Invalid diary entry." }, { status:400 });
  }

  try {
    const user = await getOrCreateCurrentUser(request);
    const food = customFoodId || recipeId ? await savedFood(customFoodId,recipeId,user.profileId) : await catalogFood(catalogFoodId,mfpFoodId);
    if (!food) return attachCurrentUserCookie(NextResponse.json({ message:"Food not found." }, { status:404 }), user);
    const portion = choosePortion(food,portionId,legacyIndex);
    if (!portion) return attachCurrentUserCookie(NextResponse.json({ message:"This food has no usable portions." }, { status:422 }), user);
    const multiplier = selectedPortionMultiplier(portion,amount);
    const grams = selectedPortionGrams(portion,amount);
    const nutrients = scaleNutrients(food.nutrientBase,multiplier);
    const macros = macroValues(nutrients);
    const gramsPerUnit = portion.grams === null ? null : portion.grams/portion.amount;
    const result = await databaseQuery<{id:string;created_at:string}>(
      `INSERT INTO food_catalog.app.diary_entries (
         user_id,profile_id,diary_date,catalog_food_id,source_item_type,source_item_id,meal_type,logged_at,
         food_name,brand_name,serving,quantity,grams,unit,portion_id,portion_label_snapshot,gram_weight_per_portion,
         nutrition_basis,nutrients,nutrition_per_100_snapshot,portion_options_snapshot,note,
         energy_kcal,protein_g,carbohydrate_g,total_fat_g,dietary_fiber_g,total_sugars_g,sodium_mg
       ) VALUES ($1,$2,$3,$4,$5,$4,$6,$7,$8,$9,$10::JSONB,$11,$12,$13,$14,$15,$16,$17,$18::JSONB,$19::JSONB,$20::JSONB,$21,$22,$23,$24,$25,$26,$27,$28)
       RETURNING id,created_at::text`,
      [user.id,user.profileId,diaryDate,food.id,food.sourceType,input.mealType,loggedAt.toISOString(),food.name,food.brand,
       JSON.stringify({...portion,selectedAmount:amount}),amount,grams,portion.unit,portion.id,portion.label,gramsPerUnit,food.nutritionBasis,
       JSON.stringify(nutrients),JSON.stringify(food.nutrientBase),JSON.stringify(food.portions),note,
       macros.energyKcal,macros.proteinG,macros.carbohydrateG,macros.totalFatG,macros.dietaryFiberG,macros.totalSugarsG,macros.sodiumMg],
    );
    await databaseQuery("DELETE FROM food_catalog.app.diary_day_completions WHERE profile_id=$1 AND diary_date=$2", [user.profileId, diaryDate]);
    return attachCurrentUserCookie(NextResponse.json({ id:result.rows[0].id,catalogFoodId:food.id,mealType:input.mealType,loggedAt:loggedAt.toISOString(),name:food.name,brand:food.brand,portion,amount,quantity:amount,grams,nutrients,macros,nutritionBasis:food.nutritionBasis,createdAt:result.rows[0].created_at }, { status:201 }), user);
  } catch (error) {
    console.error("Create diary entry failed",error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Diary storage is temporarily unavailable. Run npm run db:enable-flexible-portions if you have not migrated yet.";
    return NextResponse.json({ message }, { status:503 });
  }
}
