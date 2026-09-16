import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { foodDetailColumns, type FoodDetailRow, serializeFoodDetail } from "@/lib/food-catalog";
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
  scan_count: string;
  last_scanned_at: string;
};

const columns = "id, catalog_food_id, barcode, food_name, brand_name, nutrients, portions, default_portion_id, nutrition_basis, scan_count::text, last_scanned_at::text";

function serialize(row: ScannedFoodRow) {
  const portions = Array.isArray(row.portions) ? row.portions : [];
  const defaultPortion = portions.find((portion) => portion.id === row.default_portion_id) ?? portions[0] ?? null;
  const macros = macroValues(row.nutrients);
  return {
    id: row.id,
    catalogFoodId: row.catalog_food_id,
    barcode: row.barcode,
    name: row.food_name,
    brand: row.brand_name,
    description: "Scanned product",
    nutrients: row.nutrients,
    portions,
    defaultPortionId: row.default_portion_id,
    nutritionBasis: row.nutrition_basis,
    defaultCalories: defaultPortion ? (macros.energyKcal ?? 0) * defaultPortion.nutrientMultiplier : null,
    defaultPortionLabel: defaultPortion?.label ?? "Saved scan",
    scanCount: Number(row.scan_count),
    lastScannedAt: row.last_scanned_at,
  };
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim().toLocaleLowerCase("en-US") ?? "";
  if (query.length > 80) return NextResponse.json({ message: "query is too long." }, { status: 400 });

  try {
    const user = await getOrCreateCurrentUser(request);
    const tokens = query.match(/[\p{L}\p{N}]+/gu)?.slice(0, 8) ?? [];
    const clauses = tokens.map((_, index) => `(lower(food_name) LIKE '%' || $${index + 2} || '%' OR lower(coalesce(brand_name, '')) LIKE '%' || $${index + 2} || '%')`);
    const result = await databaseQuery<ScannedFoodRow>(
      `SELECT ${columns} FROM food_catalog.app.scanned_foods
       WHERE profile_id = $1 ${clauses.length ? `AND ${clauses.join(" AND ")}` : ""}
       ORDER BY last_scanned_at DESC, food_name LIMIT 100`,
      [user.profileId, ...tokens],
    );
    return attachCurrentUserCookie(NextResponse.json({ foods: result.rows.map(serialize) }), user);
  } catch (error) {
    return NextResponse.json({ message: error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Scanned-food storage is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  let body: { catalogFoodId?: unknown };
  try { body = await request.json() as { catalogFoodId?: unknown }; }
  catch { return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 }); }
  const catalogFoodId = typeof body.catalogFoodId === "string" ? body.catalogFoodId.trim() : "";
  if (!catalogFoodId || catalogFoodId.length > 160) return NextResponse.json({ message: "Invalid catalog food id." }, { status: 400 });

  try {
    const user = await getOrCreateCurrentUser(request);
    const lookup = await databaseQuery<FoodDetailRow>(`SELECT ${foodDetailColumns} FROM food_catalog.public.typesense_foods WHERE id = $1 LIMIT 1`, [catalogFoodId]);
    const catalogFood = lookup.rows[0];
    if (!catalogFood) return attachCurrentUserCookie(NextResponse.json({ message: "Food not found." }, { status: 404 }), user);
    const food = serializeFoodDetail(catalogFood);
    const result = await databaseQuery<ScannedFoodRow>(
      `INSERT INTO food_catalog.app.scanned_foods
         (user_id, profile_id, catalog_food_id, barcode, food_name, brand_name, nutrients, portions, default_portion_id, nutrition_basis)
       VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB, $8::JSONB, $9, $10)
       ON CONFLICT (profile_id, catalog_food_id) DO UPDATE SET
         barcode = excluded.barcode, food_name = excluded.food_name, brand_name = excluded.brand_name,
         nutrients = excluded.nutrients, portions = excluded.portions, default_portion_id = excluded.default_portion_id,
         nutrition_basis = excluded.nutrition_basis, scan_count = food_catalog.app.scanned_foods.scan_count + 1,
         last_scanned_at = now()
       RETURNING ${columns}`,
      [user.id, user.profileId, food.id, food.barcode, food.name, food.brand, JSON.stringify(food.nutrientBase), JSON.stringify(food.portions), food.defaultPortionId, food.nutritionBasis],
    );
    return attachCurrentUserCookie(NextResponse.json(serialize(result.rows[0]), { status: 201 }), user);
  } catch (error) {
    return NextResponse.json({ message: error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Could not save the scanned food." }, { status: 503 });
  }
}
