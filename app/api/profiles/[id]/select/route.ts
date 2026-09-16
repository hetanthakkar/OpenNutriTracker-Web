import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const validId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message: "Invalid profile id." }, { status: 400 });
  try {
    const user = await getOrCreateCurrentUser(request);
    const profile = await databaseQuery<{ id: string }>("SELECT id FROM food_catalog.app.profiles WHERE id=$1 AND owner_user_id=$2", [id, user.id]);
    if (!profile.rows[0]) return attachCurrentUserCookie(NextResponse.json({ message: "Profile not found." }, { status: 404 }), user);
    await databaseQuery("UPDATE food_catalog.app.user_preferences SET current_profile_id=$1,updated_at=now() WHERE user_id=$2", [id, user.id]);
    return attachCurrentUserCookie(NextResponse.json({ currentProfileId: id }), user);
  } catch (error) {
    return NextResponse.json({ message: error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Profile selection is temporarily unavailable." }, { status: 503 });
  }
}
