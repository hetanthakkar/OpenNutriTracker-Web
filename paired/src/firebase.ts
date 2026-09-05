// Firebase Web config, shared by Cloud Messaging (push) and Google sign-in.
// Fill these from the Firebase console (Project settings -> General -> your web
// app) via a .env file, e.g. VITE_FB_API_KEY=... . Notifications and Google
// sign-in stay disabled (gracefully) until these are set, so the app runs fine
// without them.
export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FB_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FB_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FB_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FB_APP_ID as string | undefined,
};

export const VAPID_KEY = import.meta.env.VITE_FB_VAPID_KEY as string | undefined;

export const firebaseConfigured = Boolean(FIREBASE_CONFIG.apiKey && VAPID_KEY);

/** Google sign-in needs the web config, but not the push VAPID key. */
export const googleAuthConfigured = Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.authDomain);

/** Thrown when the user closes the Google popup — not an error worth showing. */
export const GOOGLE_CANCELLED = "google-cancelled";

/** `notifications.ts` may have initialised the default app already. */
async function firebaseApp() {
  const { initializeApp, getApps, getApp } = await import("firebase/app");
  return getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG as Record<string, string>);
}

/** Run the Google popup and return a Firebase ID token for the backend to verify.
 *
 *  Firebase Auth is imported lazily so it stays out of the main bundle — the
 *  sign-in screen is the only thing that needs it, and a returning user with a
 *  live session never gets there.
 */
export async function signInWithGoogle(): Promise<string> {
  const { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import(
    "firebase/auth"
  );

  const auth = getAuth(await firebaseApp());
  const provider = new GoogleAuthProvider();
  // Always let the user choose the account rather than silently reusing whichever
  // one the browser happens to be signed into.
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    const result = await signInWithPopup(auth, provider);
    return await result.user.getIdToken();
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      throw new Error(GOOGLE_CANCELLED);
    }
    // An installed iOS PWA has no window opener, so the popup can never resolve.
    // Fall back to a full-page redirect; `consumeGoogleRedirect` picks the result
    // up when the app reloads.
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
      return new Promise<string>(() => {}); // navigating away; never settles
    }
    throw e;
  }
}

/** After a redirect sign-in, the pending ID token — or null on an ordinary load. */
export async function consumeGoogleRedirect(): Promise<string | null> {
  if (!googleAuthConfigured) return null;
  const { getAuth, getRedirectResult } = await import("firebase/auth");
  const result = await getRedirectResult(getAuth(await firebaseApp()));
  return result ? await result.user.getIdToken() : null;
}
