"use client";

import { useEffect, useState } from "react";
import { LogIn, LogOut, ShieldCheck } from "lucide-react";
import { firebaseAuthConfigured, signInWithGoogle, signOutFromFirebase } from "@/lib/firebase-auth";
import { Card } from "./ui";

type SessionStatus = { user: { email: string | null; name: string | null } | null; configured: boolean };

export function FirebaseAccount({ onToast }: { onToast: (message: string) => void }) {
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Could not load sign-in status.");
      return response.json() as Promise<SessionStatus>;
    }).then((status) => { if (!cancelled) setSession(status); }).catch(() => { if (!cancelled) setSession({ user: null, configured: false }); });
    return () => { cancelled = true; };
  }, []);

  const signIn = async () => {
    setBusy(true);
    try {
      const method = await signInWithGoogle();
      if (method === "popup") window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not sign in with Google.";
      if (!/popup-closed-by-user|cancelled-popup-request/.test(message)) onToast(message);
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await signOutFromFirebase();
      window.location.reload();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Could not sign out.");
      setBusy(false);
    }
  };

  if (!firebaseAuthConfigured() || !session?.configured) {
    return <section className="settings-section auth-account-section"><h2>Sign-in &amp; sync</h2><Card className="auth-account-card"><span className="round-icon green"><ShieldCheck size={18} /></span><div><strong>Local profile</strong><small>Add Firebase configuration to enable secure account sign-in and sync.</small></div></Card></section>;
  }

  return <section className="settings-section auth-account-section"><h2>Sign-in &amp; sync</h2><Card className="auth-account-card"><span className="round-icon green"><ShieldCheck size={18} /></span><div><strong>{session.user?.name ?? "Sign in to sync"}</strong><small>{session.user?.email ?? "Securely save this profile across devices."}</small></div>{session.user ? <button disabled={busy} onClick={() => void signOut()}>{busy ? "Signing out…" : <><LogOut size={16} /> Sign out</>}</button> : <button disabled={busy} onClick={() => void signIn()}>{busy ? "Signing in…" : <><LogIn size={16} /> Continue with Google</>}</button>}</Card></section>;
}

/** Full-page entry point used when Firebase auth is configured for the deployment. */
export function FirebaseAuthGate() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signIn = async () => {
    setBusy(true);
    setError("");
    try {
      const method = await signInWithGoogle();
      if (method === "popup") window.location.reload();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not sign in with Google.";
      if (!/popup-closed-by-user|cancelled-popup-request/.test(message)) setError(message);
      setBusy(false);
    }
  };

  return (
    <main className="auth-gate-shell">
      <section className="auth-gate-card" aria-labelledby="auth-gate-title">
        <span className="auth-gate-icon"><ShieldCheck size={26} /></span>
        <span className="eyebrow">MyFitnessTracker</span>
        <h1 id="auth-gate-title">Your nutrition plan, wherever you are</h1>
        <p>Sign in or create your account with Google to securely save your diary, goals, and progress across devices.</p>
        <button className="primary-button auth-gate-button" disabled={busy} onClick={() => void signIn()}>
          <LogIn size={18} /> {busy ? "Opening Google…" : "Continue with Google"}
        </button>
        {error && <p className="auth-gate-error" role="alert">{error}</p>}
        <small className="auth-gate-note">You can skip profile details after signing in and complete them later.</small>
      </section>
    </main>
  );
}
