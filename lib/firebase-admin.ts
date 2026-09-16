import type { DecodedIdToken, Auth } from "firebase-admin/auth";

function credentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  return projectId && clientEmail && privateKey ? { projectId, clientEmail, privateKey } : null;
}

export function firebaseAdminConfigured() {
  return Boolean(credentials());
}

async function adminAuth(): Promise<Auth> {
  const serviceAccount = credentials();
  if (!serviceAccount) throw new Error("Firebase Admin credentials are not configured.");

  // Keep Firebase Admin out of the initial server module graph. Besides avoiding
  // unnecessary work when Firebase is not configured, this prevents the CJS
  // auth entrypoint from eagerly loading its ESM jose dependency on Vercel.
  const [{ cert, getApp, getApps, initializeApp }, { getAuth }] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/auth"),
  ]);
  const app = getApps().length ? getApp() : initializeApp({ credential: cert(serviceAccount) });
  return getAuth(app);
}

export async function verifyFirebaseIdToken(idToken: string) {
  return (await adminAuth()).verifyIdToken(idToken);
}

export async function createFirebaseSession(idToken: string, expiresIn: number) {
  return (await adminAuth()).createSessionCookie(idToken, { expiresIn });
}

export async function verifyFirebaseSession(sessionCookie: string): Promise<DecodedIdToken | null> {
  if (!firebaseAdminConfigured()) return null;
  try {
    return await (await adminAuth()).verifySessionCookie(sessionCookie, true);
  } catch {
    return null;
  }
}
