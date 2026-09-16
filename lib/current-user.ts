import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { databaseQuery } from "@/lib/db";
import { verifyFirebaseSession } from "@/lib/firebase-admin";

export const USER_COOKIE = "ont_profile";
export const FIREBASE_SESSION_COOKIE = "ont_firebase_session";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

type CurrentUser = {
  id: string;
  profileId: string;
  isNew: boolean;
};

type FirebaseUserRow = { id: string };

function isUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}

/** Resolve a Firebase session to the app's UUID user, with a browser profile fallback during onboarding. */
export async function getOrCreateCurrentUser(request: NextRequest): Promise<CurrentUser> {
  const cookieValue = request.cookies.get(USER_COOKIE)?.value;
  const firebaseSession = request.cookies.get(FIREBASE_SESSION_COOKIE)?.value;
  const firebaseUser = firebaseSession ? await verifyFirebaseSession(firebaseSession) : null;
  let id = isUuid(cookieValue) ? cookieValue : randomUUID();
  let isNew = id !== cookieValue;

  if (firebaseUser) {
    const existing = await databaseQuery<FirebaseUserRow>(
      "SELECT id FROM food_catalog.app.users WHERE firebase_uid = $1 LIMIT 1",
      [firebaseUser.uid],
    );
    if (existing.rows[0]) {
      id = existing.rows[0].id;
      isNew = false;
    } else if (isUuid(cookieValue)) {
      const claimed = await databaseQuery<FirebaseUserRow>(
        `UPDATE food_catalog.app.users
         SET firebase_uid = $1, email = $2, display_name = CASE WHEN display_name = 'Local user' THEN $3 ELSE display_name END,
             updated_at = now()
         WHERE id = $4 AND firebase_uid IS NULL
         RETURNING id`,
        [firebaseUser.uid, firebaseUser.email ?? null, firebaseUser.name ?? "My profile", cookieValue],
      );
      if (claimed.rows[0]) {
        id = claimed.rows[0].id;
        isNew = false;
      } else {
        id = randomUUID();
        isNew = true;
      }
    } else {
      id = randomUUID();
      isNew = true;
    }
    const persisted = await databaseQuery<FirebaseUserRow>(
      `INSERT INTO food_catalog.app.users (id, display_name, firebase_uid, email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (firebase_uid) DO UPDATE SET email = excluded.email, last_seen_at = now(), updated_at = now()
       RETURNING id`,
      [id, firebaseUser.name ?? "My profile", firebaseUser.uid, firebaseUser.email ?? null],
    );
    if (persisted.rows[0]) {
      id = persisted.rows[0].id;
      isNew = false;
    }
  } else {
    await databaseQuery(
      "INSERT INTO food_catalog.app.users (id, display_name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
      [id, "Local user"],
    );
  }

  await databaseQuery("UPDATE food_catalog.app.users SET last_seen_at = now(), updated_at = now() WHERE id = $1", [id]);
  await databaseQuery(
    `INSERT INTO food_catalog.app.profiles (owner_user_id, name)
     SELECT $1, 'My profile' WHERE NOT EXISTS (
       SELECT 1 FROM food_catalog.app.profiles WHERE owner_user_id = $1
     )`,
    [id],
  );
  await databaseQuery(
    `INSERT INTO food_catalog.app.user_preferences (user_id, current_profile_id)
     SELECT $1, p.id FROM food_catalog.app.profiles p
     WHERE p.owner_user_id = $1 ORDER BY p.created_at, p.id LIMIT 1
     ON CONFLICT (user_id) DO NOTHING`,
    [id],
  );
  const profileResult = await databaseQuery<{ id: string }>(
    `SELECT p.id FROM food_catalog.app.profiles p
     LEFT JOIN food_catalog.app.user_preferences pref
       ON pref.user_id = $1 AND pref.current_profile_id = p.id
     WHERE p.owner_user_id = $1
     ORDER BY (pref.current_profile_id IS NOT NULL) DESC, p.created_at, p.id
     LIMIT 1`,
    [id],
  );
  const profileId = profileResult.rows[0]?.id;
  if (!profileId) throw new Error("Could not create a profile for the current user.");
  await databaseQuery(
    "UPDATE food_catalog.app.user_preferences SET current_profile_id = $1 WHERE user_id = $2 AND current_profile_id IS NULL",
    [profileId, id],
  );
  await databaseQuery(
    "INSERT INTO food_catalog.app.profile_goals (profile_id) VALUES ($1) ON CONFLICT (profile_id) DO NOTHING",
    [profileId],
  );

  return { id, profileId, isNew: !firebaseUser && isNew };
}

export function attachCurrentUserCookie(response: NextResponse, user: CurrentUser): NextResponse {
  if (!user.isNew) return response;

  response.cookies.set(USER_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });
  return response;
}
