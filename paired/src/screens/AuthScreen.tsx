import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { useAuth } from "../auth";
import { ApiError } from "../api";
import { GOOGLE_CANCELLED, googleAuthConfigured } from "../firebase";
import { Button, GhostButton, Input, TMark } from "../ui";

/** "choose" is the front door; the rest are steps reached from it. */
type Step = "choose" | "code" | "name" | "password";

const CODE_LENGTH = 6;

export default function AuthScreen() {
  const { login, register, requestCode, verifyCode, loginWithGoogle, loginAsGuest, setDisplayName } = useAuth();

  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [resendIn, setResendIn] = useState(0);

  // Password fallback, kept for accounts that predate passwordless sign-in.
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  // Tick the resend cooldown down to zero.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [resendIn]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  /** Run an async action with the shared busy/error handling. */
  const run = async (fn: () => Promise<void>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      if (e instanceof Error && e.message === GOOGLE_CANCELLED) return; // user closed the popup
      setErr(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      setResendIn(await requestCode(email.trim().toLowerCase()));
      setCode("");
      setStep("code");
    });

  const submitCode = (value: string) =>
    run(async () => {
      const created = await verifyCode(email.trim().toLowerCase(), value);
      // A brand-new account has no name yet, and the partner will see it. Ask
      // now; an existing account drops straight into the app.
      if (created) setStep("name");
    });

  const onCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    setErr(null);
    if (digits.length === CODE_LENGTH && !busy) submitCode(digits);
  };

  const google = () =>
    run(async () => {
      if (await loginWithGoogle()) setStep("name");
    });

  // Explore the whole app as a pre-paired demo couple — no account needed.
  const explore = () => run(() => loginAsGuest());

  const saveName = () =>
    run(async () => {
      if (name.trim()) await setDisplayName(name.trim());
      // Either way we're signed in; App swaps this screen out once `me` is set
      // and the name is saved, so there's nothing left to do here.
    });

  const submitPassword = () =>
    run(async () => {
      if (mode === "login") await login(username.trim(), password);
      else await register(username.trim(), password, name.trim() || username.trim());
    });

  const back = (to: Step) => {
    setErr(null);
    setStep(to);
  };

  if (step === "code") {
    return (
      <Shell>
        <BackButton onClick={() => back("choose")} />
        <Header
          title="Check your email"
          subtitle={
            <>
              We sent a {CODE_LENGTH}-digit code to <span className="font-medium text-neutral-200">{email}</span>
            </>
          }
        />
        <div className="space-y-3">
          <input
            ref={codeRef}
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            // `pattern` keeps the numeric keypad honest on Android.
            pattern="[0-9]*"
            maxLength={CODE_LENGTH}
            placeholder="······"
            aria-label="Login code"
            disabled={busy}
            className="w-full rounded-2xl border border-stone-200 bg-surface py-4 text-center text-3xl font-semibold tracking-[0.5em] indent-[0.5em] text-stone-800 outline-none focus:border-rose-400 disabled:opacity-60"
          />
          <ErrorText>{err}</ErrorText>
          <Button onClick={() => submitCode(code)} disabled={busy || code.length < CODE_LENGTH}>
            {busy ? "Verifying…" : "Continue"}
          </Button>
          <GhostButton onClick={sendCode} disabled={busy || resendIn > 0}>
            {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
          </GhostButton>
        </div>
      </Shell>
    );
  }

  if (step === "name") {
    return (
      <Shell>
        <Header title="What should we call you?" subtitle="This is the name your partner will see." />
        <div className="space-y-3">
          <Input
            placeholder="Your name"
            value={name}
            autoFocus
            autoComplete="given-name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && saveName()}
          />
          <ErrorText>{err}</ErrorText>
          <Button onClick={saveName} disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Start"}
          </Button>
        </div>
      </Shell>
    );
  }

  if (step === "password") {
    return (
      <Shell>
        <BackButton onClick={() => back("choose")} />
        <Header
          title={mode === "login" ? "Log in with a password" : "Create an account"}
          subtitle={mode === "login" ? "For accounts made before email sign-in." : undefined}
        />
        <div className="space-y-3">
          <Input
            placeholder="Username"
            autoCapitalize="none"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          {mode === "register" && (
            <Input
              placeholder="Your name (shown to partner)"
              autoComplete="given-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <Input
            placeholder="Password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && username && password && submitPassword()}
          />
          <ErrorText>{err}</ErrorText>
          <Button onClick={submitPassword} disabled={busy || !username || !password}>
            {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </Button>
          <GhostButton
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setErr(null);
            }}
          >
            {mode === "login" ? "New here? Sign up" : "I already have an account"}
          </GhostButton>
        </div>
      </Shell>
    );
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  return (
    <Shell>
      <div className="text-center mb-8">
        <TMark box="h-16 w-16 rounded-[1.3rem] mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-white">Together</h1>
        <p className="text-neutral-400 mt-1">Grow closer, one question a day.</p>
      </div>

      <div className="space-y-3">
        {googleAuthConfigured && (
          <>
            <button
              onClick={google}
              disabled={busy}
              className="w-full flex items-center justify-center gap-3 rounded-2xl bg-surface border border-stone-200 text-stone-700 font-semibold py-3.5 active:scale-[0.98] transition disabled:opacity-50"
            >
              <GoogleMark />
              Continue with Google
            </button>
            <Divider />
          </>
        )}

        <Input
          placeholder="you@example.com"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && emailValid && sendCode()}
        />
        <ErrorText>{err}</ErrorText>

        <Button onClick={sendCode} disabled={busy || !emailValid}>
          {busy ? "Sending…" : (
            <span className="inline-flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email me a login code
            </span>
          )}
        </Button>
        <p className="text-center text-xs text-neutral-500 px-4 pt-1">
          No password needed. We'll email you a {CODE_LENGTH}-digit code.
        </p>

        <button
          onClick={() => back("password")}
          className="w-full text-center text-sm text-neutral-400 underline underline-offset-4 pt-2"
        >
          Use a password instead
        </button>

        <Divider />

        {/* Drops into a pre-paired demo couple so the whole app can be explored
            without an account — the front door for a walkthrough or a demo. */}
        <button
          onClick={explore}
          disabled={busy}
          className="w-full rounded-2xl border border-white/20 text-white font-semibold py-3.5 active:scale-[0.98] transition disabled:opacity-50"
        >
          Explore as guest
        </button>
        <p className="text-center text-xs text-neutral-500 px-4">
          Take a look around first — no sign-up needed.
        </p>
      </div>
    </Shell>
  );
}

/** The black brand page the whole flow lives inside. Its text colors are fixed
 *  (white/neutral) rather than themed — this screen shows before any theme
 *  choice matters, and must stay readable whatever theme is saved.
 *
 *  Height comes from --app-height (set in index.html for the installed PWA,
 *  where the launch viewport height is unreliable); browsers fall back to
 *  100dvh. Without this the background stops short on a cold iOS launch and
 *  the white body background shows through above the home indicator.
 */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed inset-x-0 top-0 bg-black flex flex-col justify-center overflow-y-auto px-6"
      style={{
        height: "var(--app-height, 100dvh)",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="max-w-sm w-full mx-auto">{children}</div>
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="text-center mb-8">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      {subtitle && <p className="text-neutral-400 mt-2 text-sm leading-relaxed">{subtitle}</p>}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Back" className="mb-4 -ml-1 p-2 text-neutral-500 active:scale-95 transition">
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-rose-400 px-1">
      {children}
    </p>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-white/15" />
      <span className="text-xs text-neutral-500">or</span>
      <span className="h-px flex-1 bg-white/15" />
    </div>
  );
}

/** Google's four-colour "G", inlined — the CSP and offline PWA both forbid a remote asset. */
function GoogleMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
