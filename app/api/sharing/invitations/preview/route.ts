import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (token.length < 32 || token.length > 200) return NextResponse.json({ message: "Invalid invitation link." }, { status: 400 });
  try {
    const user = await getOrCreateCurrentUser(request);
    const hash = createHash("sha256").update(token).digest("hex");
    const result = await databaseQuery<{
      id: string;
      invitee_name: string;
      relationship: string;
      expires_at: string;
      owner_name: string;
      owner_user_id: string;
    }>(
      `SELECT i.id,i.invitee_name,i.relationship,i.expires_at::text,p.name AS owner_name,p.owner_user_id
       FROM food_catalog.app.sharing_invitations i
       JOIN food_catalog.app.profiles p ON p.id=i.owner_profile_id
       WHERE i.token_hash=$1 AND i.status='pending' AND i.expires_at>now()`,
      [hash],
    );
    const invitation = result.rows[0];
    if (!invitation) return attachCurrentUserCookie(NextResponse.json({ message: "This invitation is invalid or has expired." }, { status: 404 }), user);
    const permissions = await databaseQuery<{ permission_code: string }>(
      "SELECT permission_code FROM food_catalog.app.sharing_invitation_permissions WHERE invitation_id=$1 ORDER BY permission_code",
      [invitation.id],
    );
    return attachCurrentUserCookie(NextResponse.json({
      inviteeName: invitation.invitee_name,
      ownerName: invitation.owner_name,
      relationship: invitation.relationship,
      expiresAt: invitation.expires_at,
      permissions: permissions.rows.map((row) => row.permission_code),
      canAccept: invitation.owner_user_id !== user.id,
    }), user);
  } catch (error) {
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "The invitation could not be loaded.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
