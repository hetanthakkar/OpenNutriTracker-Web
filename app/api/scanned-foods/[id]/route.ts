import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";
import { macroValues, type PortionOption } from "@/lib/food-portions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ScannedFoodRow = {
  id: string;
  catalog_food_id: string;
  barcode: string | null;
  food_name: string;
  brand_name: string | null;
  nutrients: Record<string, unknown>;
  portions: PortionOption[];
  default_portion_id: string | null;
  nutrition_basis: string;
};

const columns = "id, catalog_food_id, barcode, food_name, brand_name, nutrients, portions, default_portion_id, nutrition_basis";

function validId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function serialize(row: ScannedFoodRow) {
  const nutrients = row.nutrients ?? {};
  const macros = macroValues(nutrients);
  return {
    id: row.id,
    source: "scanned",
    catalogFoodId: row.catalog_food_id,
    name: row.food_name,
    description: "Scanned product",
    brand: row.brand_name,
    barcode: row.barcode,
    servings: [],
    portions: Array.isArray(row.portions) ? row.portions : [],
    defaultPortionId: row.default_portion_id,
    nutrientBase: nutrients,
    macrosBase: macros,
    nutritionBasis: row.nutrition_basis,
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message: "Invalid scanned food id." }, { status: 400 });
  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<ScannedFoodRow>(`SELECT ${columns} FROM food_catalog.app.scanned_foods WHERE id = $1 AND profile_id = $2`, [id, user.profileId]);
    if (!result.rows[0]) return attachCurrentUserCookie(NextResponse.json({ message: "Scanned food not found." }, { status: 404 }), user);
    return attachCurrentUserCookie(NextResponse.json(serialize(result.rows[0])), user);
  } catch (error) {
    return NextResponse.json({ message: error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Scanned-food storage is temporarily unavailable." }, { status: 503 });
  }
}
