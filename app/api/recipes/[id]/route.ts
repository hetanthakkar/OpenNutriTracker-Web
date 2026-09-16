import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RecipeRow = {
  id: string;
  recipe_name: string;
  description: string | null;
  servings: string;
  ingredients: unknown[];
  nutrients: Record<string, unknown>;
  energy_kcal: string;
  protein_g: string;
  carbohydrate_g: string;
  total_fat_g: string;
};

const columns = "id, recipe_name, description, servings::text, ingredients, nutrients, energy_kcal::text, protein_g::text, carbohydrate_g::text, total_fat_g::text";

function validId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function serialize(recipe: RecipeRow) {
  return {
    id: recipe.id, name: recipe.recipe_name, description: recipe.description, servings: Number(recipe.servings),
    ingredients: recipe.ingredients, nutrients: recipe.nutrients,
    macros: { energyKcal: Number(recipe.energy_kcal), proteinG: Number(recipe.protein_g), carbohydrateG: Number(recipe.carbohydrate_g), totalFatG: Number(recipe.total_fat_g) },
  };
}

function parseRecipe(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const number = (key: string) => typeof input[key] === "number" ? input[key] : Number(input[key]);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" && input.description.trim() ? input.description.trim() : null;
  const servings = number("servings");
  const energyKcal = number("energyKcal");
  const proteinG = number("proteinG");
  const carbohydrateG = number("carbohydrateG");
  const totalFatG = number("totalFatG");
  if (!name || name.length > 160 || (description?.length ?? 0) > 2000 || !Array.isArray(input.ingredients) || input.ingredients.length > 100
    || [servings, energyKcal, proteinG, carbohydrateG, totalFatG].some((item) => !Number.isFinite(item) || item < 0) || servings <= 0 || servings > 1000) return null;
  const nutrients = typeof input.nutrients === "object" && input.nutrients && !Array.isArray(input.nutrients)
    ? input.nutrients
    : { energy_kcal: energyKcal, protein_g: proteinG, carbohydrate_g: carbohydrateG, total_fat_g: totalFatG };
  return { name, description, servings, ingredients: input.ingredients, nutrients, energyKcal, proteinG, carbohydrateG, totalFatG };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message: "Invalid recipe id." }, { status: 400 });
  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<RecipeRow>(`SELECT ${columns} FROM food_catalog.app.recipes WHERE id=$1 AND profile_id=$2`, [id, user.profileId]);
    if (!result.rows[0]) return attachCurrentUserCookie(NextResponse.json({ message: "Recipe not found." }, { status: 404 }), user);
    return attachCurrentUserCookie(NextResponse.json(serialize(result.rows[0])), user);
  } catch (error) {
    return NextResponse.json({ message: error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Recipe storage is temporarily unavailable." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message: "Invalid recipe id." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 }); }
  const recipe = parseRecipe(body);
  if (!recipe) return NextResponse.json({ message: "Send a complete valid recipe." }, { status: 400 });
  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<RecipeRow>(
      `UPDATE food_catalog.app.recipes
       SET recipe_name=$1, description=$2, servings=$3, ingredients=$4::JSONB, nutrients=$5::JSONB,
           energy_kcal=$6, protein_g=$7, carbohydrate_g=$8, total_fat_g=$9, updated_at=now()
       WHERE id=$10 AND profile_id=$11
       RETURNING ${columns}`,
      [recipe.name, recipe.description, recipe.servings, JSON.stringify(recipe.ingredients), JSON.stringify(recipe.nutrients), recipe.energyKcal, recipe.proteinG, recipe.carbohydrateG, recipe.totalFatG, id, user.profileId],
    );
    if (!result.rows[0]) return attachCurrentUserCookie(NextResponse.json({ message: "Recipe not found." }, { status: 404 }), user);
    return attachCurrentUserCookie(NextResponse.json(serialize(result.rows[0])), user);
  } catch (error) {
    return NextResponse.json({ message: error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Recipe storage is temporarily unavailable." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message: "Invalid recipe id." }, { status: 400 });
  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<{ id: string }>("DELETE FROM food_catalog.app.recipes WHERE id=$1 AND profile_id=$2 RETURNING id", [id, user.profileId]);
    if (!result.rows[0]) return attachCurrentUserCookie(NextResponse.json({ message: "Recipe not found." }, { status: 404 }), user);
    return attachCurrentUserCookie(new NextResponse(null, { status: 204 }), user);
  } catch (error) {
    return NextResponse.json({ message: error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Recipe storage is temporarily unavailable." }, { status: 503 });
  }
}
