import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { auth as authApi, tokens, ApiError, type AuthResult, type Me } from "./api";
import { clearCache } from "./query";
import { consumeGoogleRedirect, signInWithGoogle } from "./firebase";

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, display_name: string) => Promise<void>;
  /** Email a 6-digit login code. Resolves with the seconds until a resend is allowed. */
  requestCode: (email: string) => Promise<number>;
  /** Exchange the code for a session. Resolves true if we still need a display name. */
  verifyCode: (email: string, code: string) => Promise<boolean>;
  /** Google popup (or redirect). Resolves true if we still need a display name. */
  loginWithGoogle: () => Promise<boolean>;
  /** Enter the shared demo couple — explore the whole app without an account. */
  loginAsGuest: () => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokens.access) {
      setMe(null);
      return;
    }
    try {
      setMe(await authApi.me());
    } catch (e) {
      // Only a real auth rejection means the session is actually invalid — clear
      // it and drop to login. A network error or server hiccup (the free-tier
      // backend cold-starts after ~15 min idle) must NOT wipe valid tokens, or
      // every slow/offline launch silently logs the user out.
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        tokens.clear();
        clearCache();
        setMe(null);
      }
      // Otherwise keep the tokens and any existing `me`; the next refresh retries.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Retry the initial identity fetch with backoff so a cold-starting backend
      // (Render free tier can take 30–60s to wake) restores the session instead
      // of flashing the login screen. Stop early on success or a real 401/403.
      if (tokens.access) {
        for (let attempt = 0; attempt < 6 && !cancelled; attempt++) {
          try {
            const m = await authApi.me();
            if (!cancelled) setMe(m);
            break;
          } catch (e) {
            if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
              tokens.clear();
              break;
            }
            // Transient (network / waking backend): wait, then try again.
            await new Promise((r) => setTimeout(r, Math.min(1500 * 2 ** attempt, 8000)));
          }
        }
      } else {
        // No session — but we may have just come back from a Google redirect
        // (the popup-less path used by the installed iOS PWA). Finish that login
        // before we decide to show the sign-in screen. A failure here is not
        // fatal: it just means an ordinary cold load with nothing pending.
        try {
          const idToken = await consumeGoogleRedirect();
          if (idToken && !cancelled) {
            const r = await authApi.google(idToken);
            tokens.set(r.tokens);
            setMe(r.user);
          }
        } catch {
          /* fall through to the sign-in screen */
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // While logged in but not yet paired, poll so that the moment the partner
  // accepts the code, this side flips to the paired view without a manual reload.
  useEffect(() => {
    if (!me || me.paired) return;
    const tick = () => document.visibilityState === "visible" && refresh();
    const id = window.setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [me, refresh]);

  const login = async (username: string, password: string) => {
    const t = await authApi.login({ username, password });
    tokens.set(t);
    await refresh();
  };

  const register = async (username: string, password: string, display_name: string) => {
    const r = await authApi.register({ username, password, display_name });
    tokens.set(r.tokens);
    setMe(r.user);
  };

  const requestCode = async (email: string) => {
    const r = await authApi.requestOtp(email);
    return r.resend_in;
  };

  /** Store the session, but hold `me` back while a new account still needs a
   *  display name — App swaps AuthScreen out the moment `me` lands, and the
   *  sign-up flow has one more question to ask. `setDisplayName` commits it. */
  const commit = (r: AuthResult): boolean => {
    tokens.set(r.tokens);
    const needsName = !r.user.display_name;
    if (!needsName) setMe(r.user);
    return needsName;
  };

  const verifyCode = async (email: string, code: string) =>
    commit(await authApi.verifyOtp({ email, code }));

  const loginWithGoogle = async () => commit(await authApi.google(await signInWithGoogle()));

  const loginAsGuest = async () => {
    // A stale cache from a previous session isn't this account's — start clean.
    clearCache();
    const r = await authApi.guest();
    tokens.set(r.tokens);
    setMe(r.user);
  };

  const setDisplayName = async (name: string) => {
    setMe(await authApi.updateName(name));
  };

  const logout = () => {
    tokens.clear();
    // Cached notes, facts and answers belong to the account that just left.
    clearCache();
    setMe(null);
  };

  return (
    <Ctx.Provider
      value={{ me, loading, refresh, login, register, requestCode, verifyCode, loginWithGoogle, loginAsGuest, setDisplayName, logout }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
