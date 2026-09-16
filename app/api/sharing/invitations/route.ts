import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery, withDatabaseTransaction } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";
import { isSharePermission, isShareRelationship, type SharePermissionCode } from "@/lib/sharing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function invitationUrl(request: NextRequest, token: string) {
  const url = new URL("/", request.nextUrl.origin);
  url.searchParams.set("invite", token);
  return url.toString();
}

export async function POST(request: NextRequest) {
  let body: { inviteeName?: unknown; inviteeEmail?: unknown; relationship?: unknown; permissions?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 }); }

  const inviteeName = typeof body.inviteeName === "string" ? body.inviteeName.trim() : "";
  const inviteeEmail = typeof body.inviteeEmail === "string" ? body.inviteeEmail.trim().toLowerCase() : "";
  const permissions = Array.isArray(body.permissions) ? [...new Set(body.permissions)] : [];
  if (!inviteeName || inviteeName.length > 80
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteeEmail) || inviteeEmail.length > 254
    || !isShareRelationship(body.relationship)
    || permissions.length === 0 || permissions.some((permission) => !isSharePermission(permission))) {
    return NextResponse.json({ message: "Enter a valid name, email, relationship, and at least one permission." }, { status: 400 });
  }

  try {
    const user = await getOrCreateCurrentUser(request);
    await databaseQuery(
      "UPDATE food_catalog.app.sharing_invitations SET status='expired',updated_at=now() WHERE owner_profile_id=$1 AND status='pending' AND expires_at<=now()",
      [user.profileId],
    );
    const existing = await databaseQuery<{ id: string }>(
      "SELECT id FROM food_catalog.app.sharing_invitations WHERE owner_profile_id=$1 AND invitee_email=$2 AND status='pending' LIMIT 1",
      [user.profileId, inviteeEmail],
    );
    if (existing.rows[0]) return attachCurrentUserCookie(NextResponse.json({ message: "A pending invitation already exists for this email." }, { status: 409 }), user);

    const token = randomBytes(32).toString("base64url");
    const invitation = await withDatabaseTransaction(async (client) => {
      const result = await client.query<{ id: string; expires_at: string }>(
        `INSERT INTO food_catalog.app.sharing_invitations
           (owner_profile_id,invitee_name,invitee_email,relationship,token_hash,expires_at)
         VALUES ($1,$2,$3,$4,$5,now()+INTERVAL '14 days')
         RETURNING id,expires_at::text`,
        [user.profileId, inviteeName, inviteeEmail, body.relationship, tokenHash(token)],
      );
      for (const permission of permissions as SharePermissionCode[]) {
        await client.query(
          "INSERT INTO food_catalog.app.sharing_invitation_permissions (invitation_id,permission_code) VALUES ($1,$2)",
          [result.rows[0].id, permission],
        );
      }
      return result.rows[0];
    });
    return attachCurrentUserCookie(NextResponse.json({
      id: invitation.id,
      inviteeName,
      inviteeEmail,
      relationship: body.relationship,
      permissions,
      expiresAt: invitation.expires_at,
      invitationUrl: invitationUrl(request, token),
    }, { status: 201 }), user);
  } catch (error) {
    console.error("Create sharing invitation failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "The invitation could not be created.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
