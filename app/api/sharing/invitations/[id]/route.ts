import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const validId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function invitationUrl(request: NextRequest, token: string) {
  const url = new URL("/", request.nextUrl.origin);
  url.searchParams.set("invite", token);
  return url.toString();
}

/** Rotate a pending invitation token and extend it for another 14 days. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message: "Invalid invitation id." }, { status: 400 });
  try {
    const user = await getOrCreateCurrentUser(request);
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    const result = await databaseQuery<{ id: string; expires_at: string; send_count: string }>(
      `UPDATE food_catalog.app.sharing_invitations
       SET token_hash=$1,last_sent_at=now(),send_count=send_count+1,expires_at=now()+INTERVAL '14 days',updated_at=now()
       WHERE id=$2 AND owner_profile_id=$3 AND status='pending'
       RETURNING id,expires_at::text,send_count::text`,
      [hash, id, user.profileId],
    );
    if (!result.rows[0]) return attachCurrentUserCookie(NextResponse.json({ message: "Pending invitation not found." }, { status: 404 }), user);
    return attachCurrentUserCookie(NextResponse.json({
      id,
      invitationUrl: invitationUrl(request, token),
      expiresAt: result.rows[0].expires_at,
      sendCount: Number(result.rows[0].send_count),
    }), user);
  } catch (error) {
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "The invitation could not be renewed.";
    return NextResponse.json({ message }, { status: 503 });
  }
}

/** Revoke a pending invitation. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message: "Invalid invitation id." }, { status: 400 });
  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<{ id: string }>(
      "UPDATE food_catalog.app.sharing_invitations SET status='revoked',updated_at=now() WHERE id=$1 AND owner_profile_id=$2 AND status='pending' RETURNING id",
      [id, user.profileId],
    );
    if (!result.rows[0]) return attachCurrentUserCookie(NextResponse.json({ message: "Pending invitation not found." }, { status: 404 }), user);
    return attachCurrentUserCookie(new NextResponse(null, { status: 204 }), user);
  } catch (error) {
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "The invitation could not be revoked.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
