import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery, withDatabaseTransaction } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";
import { isSharePermission, type SharePermissionCode } from "@/lib/sharing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const validId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** Update permissions for an active share owned by the current profile. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message: "Invalid share id." }, { status: 400 });
  let body: { permissions?: unknown; notifyOwnerOnView?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 }); }
  const permissions = Array.isArray(body.permissions) ? [...new Set(body.permissions)] : [];
  if (permissions.length === 0 || permissions.some((permission) => !isSharePermission(permission))
    || (body.notifyOwnerOnView !== undefined && typeof body.notifyOwnerOnView !== "boolean")) {
    return NextResponse.json({ message: "Choose at least one valid permission." }, { status: 400 });
  }
  try {
    const user = await getOrCreateCurrentUser(request);
    const updated = await withDatabaseTransaction(async (client) => {
      const share = await client.query<{ id: string }>(
        `UPDATE food_catalog.app.profile_shares
         SET notify_owner_on_view=COALESCE($1,notify_owner_on_view),updated_at=now()
         WHERE id=$2 AND owner_profile_id=$3 AND revoked_at IS NULL RETURNING id`,
        [body.notifyOwnerOnView ?? null, id, user.profileId],
      );
      if (!share.rows[0]) return false;
      await client.query("DELETE FROM food_catalog.app.profile_share_permissions WHERE share_id=$1", [id]);
      for (const permission of permissions as SharePermissionCode[]) {
        await client.query("INSERT INTO food_catalog.app.profile_share_permissions (share_id,permission_code) VALUES ($1,$2)", [id, permission]);
      }
      return true;
    });
    if (!updated) return attachCurrentUserCookie(NextResponse.json({ message: "Active share not found." }, { status: 404 }), user);
    return attachCurrentUserCookie(NextResponse.json({ id, permissions, notifyOwnerOnView: body.notifyOwnerOnView }), user);
  } catch (error) {
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Sharing permissions could not be updated.";
    return NextResponse.json({ message }, { status: 503 });
  }
}

/** Revoke an outgoing share, or remove an incoming share from this user. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ message: "Invalid share id." }, { status: 400 });
  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<{ id: string }>(
      `UPDATE food_catalog.app.profile_shares SET revoked_at=now(),updated_at=now()
       WHERE id=$1 AND revoked_at IS NULL AND (owner_profile_id=$2 OR viewer_user_id=$3)
       RETURNING id`,
      [id, user.profileId, user.id],
    );
    if (!result.rows[0]) return attachCurrentUserCookie(NextResponse.json({ message: "Active share not found." }, { status: 404 }), user);
    return attachCurrentUserCookie(new NextResponse(null, { status: 204 }), user);
  } catch (error) {
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "The share could not be revoked.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
