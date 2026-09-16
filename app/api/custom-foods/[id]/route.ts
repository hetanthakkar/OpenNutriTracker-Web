import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";
import { customFoodColumns, type CustomFoodRow, nutrientSnapshot, parseCustomFood, serializeCustomFood } from "@/lib/custom-food";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function validId(id: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message: "Invalid custom food id." }, { status: 400 });
  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<CustomFoodRow>(`SELECT ${customFoodColumns} FROM food_catalog.app.custom_foods WHERE id = $1 AND profile_id = $2`, [id, user.profileId]);
    if (!result.rows[0]) return attachCurrentUserCookie(NextResponse.json({ message: "Custom food not found." }, { status: 404 }), user);
    return attachCurrentUserCookie(NextResponse.json(serializeCustomFood(result.rows[0])), user);
  } catch (error) {
    console.error("Read custom food failed", error);
    return NextResponse.json({ message: error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Custom food storage is temporarily unavailable." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message: "Invalid custom food id." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 }); }
  const input = parseCustomFood(body);
  if (!input) return NextResponse.json({ message: "Send a complete valid custom food." }, { status: 400 });
  try {
    const user = await getOrCreateCurrentUser(request);
    const nutrients = nutrientSnapshot(input);
    const result = await databaseQuery<CustomFoodRow>(
      `UPDATE food_catalog.app.custom_foods SET food_name=$1, brand_name=$2, serving_grams=$3, serving_ml=$4, serving_amount=$5, serving_unit=$6, nutrition_basis=$7, source=$8, barcode=$9, source_url=$10, nutrients=$11::JSONB, energy_kcal=$12, protein_g=$13, carbohydrate_g=$14, total_fat_g=$15, dietary_fiber_g=$16, total_sugars_g=$17, updated_at=now()
       WHERE id=$18 AND profile_id=$19 RETURNING ${customFoodColumns}`,
      [input.name, input.brand, input.servingGrams, input.servingMl, input.servingAmount, input.servingUnit, input.nutritionBasis, input.source, input.barcode, input.sourceUrl, JSON.stringify(nutrients), input.energyKcal, input.proteinG, input.carbohydrateG, input.totalFatG, input.dietaryFiberG, input.totalSugarsG, id, user.profileId],
    );
    if (!result.rows[0]) return attachCurrentUserCookie(NextResponse.json({ message: "Custom food not found." }, { status: 404 }), user);
    return attachCurrentUserCookie(NextResponse.json(serializeCustomFood(result.rows[0])), user);
  } catch (error) {
    console.error("Update custom food failed", error);
    return NextResponse.json({ message: error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Custom food storage is temporarily unavailable." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message: "Invalid custom food id." }, { status: 400 });
  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<{ id: string }>("DELETE FROM food_catalog.app.custom_foods WHERE id=$1 AND profile_id=$2 RETURNING id", [id, user.profileId]);
    if (!result.rows[0]) return attachCurrentUserCookie(NextResponse.json({ message: "Custom food not found." }, { status: 404 }), user);
    return attachCurrentUserCookie(new NextResponse(null, { status: 204 }), user);
  } catch (error) {
    console.error("Delete custom food failed", error);
    return NextResponse.json({ message: error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Custom food storage is temporarily unavailable." }, { status: 503 });
  }
}
