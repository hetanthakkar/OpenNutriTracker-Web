import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { foodDetailColumns, type FoodDetailRow, serializeFoodDetail } from "@/lib/food-catalog";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Full catalog food data for the serving picker and nutrition preview. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || id.length > 255) {
    return Response.json({ message: "Invalid food id." }, { status: 400 });
  }

  try {
    const user = await getOrCreateCurrentUser(request);
    const [result, history] = await Promise.all([
      databaseQuery<FoodDetailRow>(`SELECT ${foodDetailColumns} FROM food_catalog.public.typesense_foods WHERE id=$1 LIMIT 1`, [id]),
      databaseQuery<{ portion_id: string | null; quantity: string }>(`SELECT portion_id,quantity::text FROM food_catalog.app.diary_entries WHERE profile_id=$1 AND source_item_type='food' AND source_item_id=$2 ORDER BY logged_at DESC LIMIT 1`, [user.profileId, id]),
    ]);
    const food = result.rows[0];

    if (!food) {
      return attachCurrentUserCookie(NextResponse.json({ message: "Food not found." }, { status: 404 }), user);
    }

    return attachCurrentUserCookie(NextResponse.json({
      ...serializeFoodDetail(food),
      lastPortion: history.rows[0] ? { portionId: history.rows[0].portion_id, amount: Number(history.rows[0].quantity) } : null,
    }, { headers: { "Cache-Control": "private, no-store" } }), user);
  } catch (error) {
    console.error("Food detail lookup failed", error);
    const message = error instanceof DatabaseNotConfiguredError
      ? "Set DATABASE_URL on the server."
      : "Food lookup is temporarily unavailable.";
    return Response.json({ message }, { status: 503 });
  }
}
