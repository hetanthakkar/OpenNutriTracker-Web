import { NextRequest, NextResponse } from "next/server";
import { createFirebaseSession, firebaseAdminConfigured, verifyFirebaseIdToken, verifyFirebaseSession } from "@/lib/firebase-admin";
import { FIREBASE_SESSION_COOKIE, USER_COOKIE } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SESSION_MAX_AGE = 60 * 60 * 24 * 14;

/** Return the signed-in Firebase account without exposing an ID token. */
export async function GET(request: NextRequest) {
  const session = request.cookies.get(FIREBASE_SESSION_COOKIE)?.value;
  const user = session ? await verifyFirebaseSession(session) : null;
  return NextResponse.json({ user: user ? { email: user.email ?? null, name: user.name ?? null } : null, configured: firebaseAdminConfigured() });
}

/** Verify a Firebase ID token and issue a long-lived, HTTP-only session cookie. */
export async function POST(request: NextRequest) {
  if (!firebaseAdminConfigured()) return NextResponse.json({ message: "Firebase Authentication is not configured on the server." }, { status: 503 });
  let body: { idToken?: unknown };
  try {
    body = await request.json() as { idToken?: unknown };
  } catch {
    return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body.idToken !== "string" || body.idToken.length < 100) return NextResponse.json({ message: "Invalid Firebase ID token." }, { status: 400 });
  try {
    await verifyFirebaseIdToken(body.idToken);
    const session = await createFirebaseSession(body.idToken, SESSION_MAX_AGE * 1000);
    const response = NextResponse.json({ status: "signed_in" });
    response.cookies.set(FIREBASE_SESSION_COOKIE, session, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (error) {
    console.error("Firebase sign-in failed", error);
    return NextResponse.json({ message: "Could not verify your Firebase sign-in." }, { status: 401 });
  }
}

/** Remove the server session; the client also signs Firebase out locally. */
export async function DELETE() {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(FIREBASE_SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  response.cookies.set(USER_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
