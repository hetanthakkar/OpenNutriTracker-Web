import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";
import { mfpFoodColumns, serializeMfpFoodDetail, type MfpFoodRow } from "@/lib/mfp-food-catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id.length > 255) return NextResponse.json({ message: "Invalid food id." }, { status: 400 });
  try {
    const user = await getOrCreateCurrentUser(request);
    const [result, history] = await Promise.all([
      databaseQuery<MfpFoodRow>(`SELECT ${mfpFoodColumns} FROM food_catalog.public.mfp_foods WHERE id=$1 LIMIT 1`, [id]),
      databaseQuery<{ portion_id: string | null; quantity: string }>(`SELECT portion_id,quantity::text FROM food_catalog.app.diary_entries WHERE profile_id=$1 AND source_item_type='mfp_food' AND source_item_id=$2 ORDER BY logged_at DESC LIMIT 1`, [user.profileId, id]),
    ]);
    if (!result.rows[0]) return attachCurrentUserCookie(NextResponse.json({ message: "Food not found." }, { status: 404 }), user);
    return attachCurrentUserCookie(NextResponse.json({ ...serializeMfpFoodDetail(result.rows[0]), lastPortion: history.rows[0] ? { portionId: history.rows[0].portion_id, amount: Number(history.rows[0].quantity) } : null }, { headers: { "Cache-Control": "private, no-store" } }), user);
  } catch (error) {
    console.error("MFP food detail lookup failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Food lookup is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
