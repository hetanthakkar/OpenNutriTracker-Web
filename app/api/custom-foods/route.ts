import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";
import { customFoodColumns, type CustomFoodRow, nutrientSnapshot, parseCustomFood, serializeCustomFood } from "@/lib/custom-food";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim().toLowerCase() ?? "";
  if (query.length > 80) return NextResponse.json({ message: "query is too long." }, { status: 400 });
  try {
    const user = await getOrCreateCurrentUser(request);
    const tokens = query.match(/[\p{L}\p{N}]+/gu)?.slice(0, 8) ?? [];
    const clauses = tokens.map((_, index) => `(lower(food_name) LIKE '%' || $${index + 2} || '%' OR lower(coalesce(brand_name,'')) LIKE '%' || $${index + 2} || '%')`);
    const result = await databaseQuery<CustomFoodRow>(
      `SELECT ${customFoodColumns} FROM food_catalog.app.custom_foods
       WHERE profile_id = $1 ${clauses.length ? `AND ${clauses.join(" AND ")}` : ""}
       ORDER BY food_name ASC LIMIT 50`,
      [user.profileId, ...tokens],
    );
    return attachCurrentUserCookie(NextResponse.json({ foods: result.rows.map(serializeCustomFood) }), user);
  } catch (error) {
    console.error("Read custom foods failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Custom food storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 }); }
  const input = parseCustomFood(body);
  if (!input) return NextResponse.json({ message: "Invalid custom food." }, { status: 400 });
  try {
    const user = await getOrCreateCurrentUser(request);
    const nutrients = nutrientSnapshot(input);
    const result = await databaseQuery<CustomFoodRow>(
      `INSERT INTO food_catalog.app.custom_foods (user_id, profile_id, food_name, brand_name, serving_grams, serving_ml, serving_amount, serving_unit, nutrition_basis, source, barcode, source_url, nutrients, energy_kcal, protein_g, carbohydrate_g, total_fat_g, dietary_fiber_g, total_sugars_g)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::JSONB,$14,$15,$16,$17,$18,$19) RETURNING ${customFoodColumns}`,
      [user.id, user.profileId, input.name, input.brand, input.servingGrams, input.servingMl, input.servingAmount, input.servingUnit, input.nutritionBasis, input.source, input.barcode, input.sourceUrl, JSON.stringify(nutrients), input.energyKcal, input.proteinG, input.carbohydrateG, input.totalFatG, input.dietaryFiberG, input.totalSugarsG],
    );
    return attachCurrentUserCookie(NextResponse.json(serializeCustomFood(result.rows[0]), { status: 201 }), user);
  } catch (error) {
    console.error("Create custom food failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Custom food storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
