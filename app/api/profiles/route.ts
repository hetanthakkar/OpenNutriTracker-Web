import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProfileRow = { id: string; name: string; avatar_url: string | null; timezone: string; height_cm: string | null; created_at: string };
const columns = "id,name,avatar_url,timezone,height_cm::text,created_at::text";
const serialize = (row: ProfileRow, currentProfileId: string) => ({ id: row.id, name: row.name, avatarUrl: row.avatar_url, timezone: row.timezone, heightCm: row.height_cm === null ? null : Number(row.height_cm), createdAt: row.created_at, current: row.id === currentProfileId });

function validTimezone(value: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; }
  catch { return false; }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<ProfileRow>(`SELECT ${columns} FROM food_catalog.app.profiles WHERE owner_user_id=$1 ORDER BY created_at,id`, [user.id]);
    return attachCurrentUserCookie(NextResponse.json({ profiles: result.rows.map((row) => serialize(row, user.profileId)), currentProfileId: user.profileId }), user);
  } catch (error) {
    return NextResponse.json({ message: error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Profiles are temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  let body: { name?: unknown; timezone?: unknown; heightCm?: unknown; avatarUrl?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const timezone = typeof body.timezone === "string" ? body.timezone : "UTC";
  const heightCm = body.heightCm === undefined || body.heightCm === null ? null : Number(body.heightCm);
  const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl.trim() || null : null;
  if (!name || name.length > 80 || !validTimezone(timezone) || (heightCm !== null && (!Number.isFinite(heightCm) || heightCm < 80 || heightCm > 250)) || (avatarUrl?.length ?? 0) > 1000) {
    return NextResponse.json({ message: "Invalid profile." }, { status: 400 });
  }
  try {
    const user = await getOrCreateCurrentUser(request);
    const count = await databaseQuery<{ count: string }>("SELECT count(*)::text AS count FROM food_catalog.app.profiles WHERE owner_user_id=$1", [user.id]);
    if (Number(count.rows[0].count) >= 10) return NextResponse.json({ message: "A user can have up to 10 profiles." }, { status: 409 });
    const result = await databaseQuery<ProfileRow>(`INSERT INTO food_catalog.app.profiles (owner_user_id,name,avatar_url,timezone,height_cm) VALUES ($1,$2,$3,$4,$5) RETURNING ${columns}`, [user.id, name, avatarUrl, timezone, heightCm]);
    await databaseQuery("INSERT INTO food_catalog.app.profile_goals (profile_id) VALUES ($1)", [result.rows[0].id]);
    return attachCurrentUserCookie(NextResponse.json(serialize(result.rows[0], user.profileId), { status: 201 }), user);
  } catch (error) {
    return NextResponse.json({ message: error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Profile creation is temporarily unavailable." }, { status: 503 });
  }
}
