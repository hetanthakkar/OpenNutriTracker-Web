"use client";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const customAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_CUSTOM_AUTH_DOMAIN;

export function firebaseAuthConfigured() {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

async function firebaseApp() {
  const { getApp, getApps, initializeApp } = await import("firebase/app");
  const useCustomAuthDomain = typeof window !== "undefined" && customAuthDomain === window.location.host;
  const appConfig = { ...config, authDomain: useCustomAuthDomain ? customAuthDomain : config.authDomain };
  return getApps().length ? getApp() : initializeApp(appConfig as Required<typeof config>);
}

async function createSession(idToken: string) {
  const response = await fetch("/api/auth/session", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }),
  });
  const data = await response.json() as { message?: string };
  if (!response.ok) throw new Error(data.message ?? "Could not create your session.");
}

/** Complete a redirect sign-in after Firebase returns to the installed PWA. */
export async function completeRedirectSignIn() {
  if (!firebaseAuthConfigured()) return false;
  const { getAuth, getRedirectResult } = await import("firebase/auth");
  const auth = getAuth(await firebaseApp());
  const result = await getRedirectResult(auth);
  await auth.authStateReady();
  const user = result?.user ?? auth.currentUser;
  if (!user) return false;
  await createSession(await user.getIdToken());
  return true;
}

/** Sign in with Google through Firebase and exchange the short-lived token for an HTTP-only session. */
export async function signInWithGoogle() {
  if (!firebaseAuthConfigured()) throw new Error("Firebase Authentication is not configured yet.");
  const { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import("firebase/auth");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const auth = getAuth(await firebaseApp());
  try {
    const result = await signInWithPopup(auth, provider);
    await createSession(await result.user.getIdToken());
    return "popup" as const;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "auth/popup-blocked" && code !== "auth/operation-not-supported-in-this-environment") {
      throw error;
    }
  }

  await signInWithRedirect(auth, provider);
  return "redirect" as const;
}

export async function signOutFromFirebase() {
  const response = await fetch("/api/auth/session", { method: "DELETE" });
  if (!response.ok) throw new Error("Could not sign out.");
  if (firebaseAuthConfigured()) {
    const { getAuth, signOut } = await import("firebase/auth");
    await signOut(getAuth(await firebaseApp()));
  }
}
