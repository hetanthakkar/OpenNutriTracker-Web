import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, withDatabaseTransaction } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: { token?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 }); }
  const token = typeof body.token === "string" ? body.token : "";
  if (token.length < 32 || token.length > 200) return NextResponse.json({ message: "Invalid invitation link." }, { status: 400 });

  try {
    const user = await getOrCreateCurrentUser(request);
    const hash = createHash("sha256").update(token).digest("hex");
    const share = await withDatabaseTransaction(async (client) => {
      const invitationResult = await client.query<{
        id: string;
        owner_profile_id: string;
        owner_user_id: string;
        relationship: string;
      }>(
        `SELECT i.id,i.owner_profile_id,p.owner_user_id,i.relationship
         FROM food_catalog.app.sharing_invitations i
         JOIN food_catalog.app.profiles p ON p.id=i.owner_profile_id
         WHERE i.token_hash=$1 AND i.status='pending' AND i.expires_at>now()
         FOR UPDATE`,
        [hash],
      );
      const invitation = invitationResult.rows[0];
      if (!invitation) return { error: "This invitation is invalid or has expired.", status: 404 } as const;
      if (invitation.owner_user_id === user.id) return { error: "Open this link in the other person’s browser to accept it.", status: 409 } as const;

      const shareResult = await client.query<{ id: string }>(
        `INSERT INTO food_catalog.app.profile_shares (owner_profile_id,viewer_user_id,relationship)
         VALUES ($1,$2,$3)
         ON CONFLICT (owner_profile_id,viewer_user_id) DO UPDATE SET
           relationship=excluded.relationship,revoked_at=NULL,updated_at=now()
         RETURNING id`,
        [invitation.owner_profile_id, user.id, invitation.relationship],
      );
      const shareId = shareResult.rows[0].id;
      await client.query("DELETE FROM food_catalog.app.profile_share_permissions WHERE share_id=$1", [shareId]);
      await client.query(
        `INSERT INTO food_catalog.app.profile_share_permissions (share_id,permission_code)
         SELECT $1,permission_code FROM food_catalog.app.sharing_invitation_permissions WHERE invitation_id=$2`,
        [shareId, invitation.id],
      );
      await client.query(
        "UPDATE food_catalog.app.sharing_invitations SET status='accepted',invitee_user_id=$1,accepted_at=now(),updated_at=now() WHERE id=$2",
        [user.id, invitation.id],
      );
      return { id: shareId } as const;
    });
    if ("error" in share) return attachCurrentUserCookie(NextResponse.json({ message: share.error }, { status: share.status }), user);
    return attachCurrentUserCookie(NextResponse.json({ shareId: share.id }), user);
  } catch (error) {
    console.error("Accept sharing invitation failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "The invitation could not be accepted.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
