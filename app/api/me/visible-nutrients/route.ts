import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";
import { nutrientDefinitions } from "@/lib/nutrition-targets";
import { ensureNutrientDefinitions } from "@/lib/nutrient-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const validCodes = new Set(nutrientDefinitions.map((item) => item.code));

async function visibleFor(userId: string) {
  const result = await databaseQuery<{ nutrient_code: string }>(
    "SELECT nutrient_code FROM food_catalog.app.user_visible_nutrients WHERE user_id=$1 ORDER BY sort_order",
    [userId],
  );
  return result.rows.length ? result.rows.map((row) => row.nutrient_code) : nutrientDefinitions.map((item) => item.code);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getOrCreateCurrentUser(request);
    await ensureNutrientDefinitions();
    return attachCurrentUserCookie(NextResponse.json({ nutrients: await visibleFor(user.id) }), user);
  } catch (error) {
    return NextResponse.json({ message: error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Visible nutrients are temporarily unavailable." }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  let body: { nutrients?: unknown };
  try { body = await request.json() as { nutrients?: unknown }; }
  catch { return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 }); }
  const codes = body.nutrients;
  if (!Array.isArray(codes) || codes.length > validCodes.size || codes.some((code) => typeof code !== "string" || !validCodes.has(code)) || new Set(codes).size !== codes.length) {
    return NextResponse.json({ message: "Invalid visible nutrient list." }, { status: 400 });
  }
  try {
    const user = await getOrCreateCurrentUser(request);
    await ensureNutrientDefinitions();
    await databaseQuery("DELETE FROM food_catalog.app.user_visible_nutrients WHERE user_id=$1", [user.id]);
    for (const [index, code] of codes.entries()) {
      await databaseQuery("INSERT INTO food_catalog.app.user_visible_nutrients (user_id,nutrient_code,sort_order) VALUES ($1,$2,$3)", [user.id, code, index]);
    }
    return attachCurrentUserCookie(NextResponse.json({ nutrients: codes }), user);
  } catch (error) {
    return NextResponse.json({ message: error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Visible nutrients are temporarily unavailable." }, { status: 503 });
  }
}
