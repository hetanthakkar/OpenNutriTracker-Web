import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type InvitationRow = {
  id: string;
  invitee_name: string;
  invitee_email: string;
  relationship: string;
  status: string;
  last_sent_at: string;
  expires_at: string;
  send_count: string;
};
type OutgoingRow = {
  id: string;
  viewer_name: string;
  viewer_email: string | null;
  relationship: string;
  connected_at: string;
  notify_owner_on_view: boolean;
  last_viewed_at: string | null;
};
type IncomingRow = {
  id: string;
  owner_name: string;
  relationship: string;
  connected_at: string;
};

async function permissionsFor(column: "invitation_id" | "share_id", ids: string[]) {
  if (ids.length === 0) return new Map<string, string[]>();
  const table = column === "invitation_id" ? "sharing_invitation_permissions" : "profile_share_permissions";
  const result = await databaseQuery<{ entity_id: string; permission_code: string }>(
    `SELECT ${column} AS entity_id, permission_code
     FROM food_catalog.app.${table}
     WHERE ${column} = ANY($1::UUID[])
     ORDER BY permission_code`,
    [ids],
  );
  const grouped = new Map<string, string[]>();
  for (const row of result.rows) grouped.set(row.entity_id, [...(grouped.get(row.entity_id) ?? []), row.permission_code]);
  return grouped;
}

/** List invitations and active shares involving the current browser user/profile. */
export async function GET(request: NextRequest) {
  try {
    const user = await getOrCreateCurrentUser(request);
    await databaseQuery(
      "UPDATE food_catalog.app.sharing_invitations SET status='expired',updated_at=now() WHERE owner_profile_id=$1 AND status='pending' AND expires_at<=now()",
      [user.profileId],
    );
    const [invitationResult, outgoingResult, incomingResult] = await Promise.all([
      databaseQuery<InvitationRow>(
        `SELECT id,invitee_name,invitee_email,relationship,status,last_sent_at::text,expires_at::text,send_count::text
         FROM food_catalog.app.sharing_invitations
         WHERE owner_profile_id=$1 AND status='pending'
         ORDER BY created_at DESC`,
        [user.profileId],
      ),
      databaseQuery<OutgoingRow>(
        `SELECT s.id,
                COALESCE((SELECT i.invitee_name FROM food_catalog.app.sharing_invitations i
                          WHERE i.owner_profile_id=s.owner_profile_id AND i.invitee_user_id=s.viewer_user_id AND i.status='accepted'
                          ORDER BY i.accepted_at DESC LIMIT 1),u.display_name) AS viewer_name,
                u.email AS viewer_email,s.relationship,s.connected_at::text,s.notify_owner_on_view,
                (SELECT max(v.viewed_at)::text FROM food_catalog.app.share_view_events v WHERE v.share_id=s.id) AS last_viewed_at
         FROM food_catalog.app.profile_shares s
         JOIN food_catalog.app.users u ON u.id=s.viewer_user_id
         WHERE s.owner_profile_id=$1 AND s.revoked_at IS NULL
         ORDER BY s.connected_at DESC`,
        [user.profileId],
      ),
      databaseQuery<IncomingRow>(
        `SELECT s.id,p.name AS owner_name,s.relationship,s.connected_at::text
         FROM food_catalog.app.profile_shares s
         JOIN food_catalog.app.profiles p ON p.id=s.owner_profile_id
         WHERE s.viewer_user_id=$1 AND s.revoked_at IS NULL
         ORDER BY s.connected_at DESC`,
        [user.id],
      ),
    ]);
    const [invitationPermissions, sharePermissions] = await Promise.all([
      permissionsFor("invitation_id", invitationResult.rows.map((row) => row.id)),
      permissionsFor("share_id", [...outgoingResult.rows, ...incomingResult.rows].map((row) => row.id)),
    ]);
    return attachCurrentUserCookie(NextResponse.json({
      invitations: invitationResult.rows.map((row) => ({
        id: row.id,
        inviteeName: row.invitee_name,
        inviteeEmail: row.invitee_email,
        relationship: row.relationship,
        status: row.status,
        lastSentAt: row.last_sent_at,
        expiresAt: row.expires_at,
        sendCount: Number(row.send_count),
        permissions: invitationPermissions.get(row.id) ?? [],
      })),
      outgoing: outgoingResult.rows.map((row) => ({
        id: row.id,
        name: row.viewer_name,
        email: row.viewer_email,
        relationship: row.relationship,
        connectedAt: row.connected_at,
        notifyOwnerOnView: row.notify_owner_on_view,
        lastViewedAt: row.last_viewed_at,
        permissions: sharePermissions.get(row.id) ?? [],
      })),
      incoming: incomingResult.rows.map((row) => ({
        id: row.id,
        name: row.owner_name,
        relationship: row.relationship,
        connectedAt: row.connected_at,
        permissions: sharePermissions.get(row.id) ?? [],
      })),
    }), user);
  } catch (error) {
    console.error("Read sharing relationships failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Partner sharing is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
