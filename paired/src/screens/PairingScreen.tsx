import { useState } from "react";
import { Link2 } from "lucide-react";
import { useAuth } from "../auth";
import { ApiError, pairing } from "../api";
import { clearCache } from "../query";
import { Button, GhostButton, Input, Card, Screen } from "../ui";

export default function PairingScreen() {
  const { me, refresh } = useAuth();
  const [mode, setMode] = useState<"choose" | "invite" | "enter">("choose");
  const [code, setCode] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const makeCode = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await pairing.create();
      setCode(r.code);
      setMode("invite");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not create a code");
    } finally { setBusy(false); }
  };

  const accept = async () => {
    setErr(null); setBusy(true);
    try {
      await pairing.accept(entry.trim().toUpperCase());
      // Everything cached was fetched as a solo user: no daily question, no
      // partner answers, no shared notes. None of it survives pairing.
      clearCache();
      await refresh(); // paired -> App switches to the main tabs
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not pair");
    } finally { setBusy(false); }
  };

  const share = async () => {
    if (!code) return;
    const text = `Join me on Together 💞 Use my code: ${code}`;
    if (navigator.share) { try { await navigator.share({ text }); } catch { /* cancelled */ } }
    else { await navigator.clipboard.writeText(code); alert("Code copied!"); }
  };

  return (
    <Screen>
      <div className="pt-8 text-center mb-6">
        <Link2 className="h-10 w-10 mx-auto mb-2 text-rose-500" />
        <h1 className="text-2xl font-bold text-stone-800">Hi {me?.display_name}!</h1>
        <p className="text-stone-500 mt-1">Pair with your partner to begin.</p>
      </div>

      {mode === "choose" && (
        <div className="space-y-3">
          <Button onClick={makeCode} disabled={busy}>Invite my partner</Button>
          <GhostButton onClick={() => setMode("enter")}>I have a code</GhostButton>
        </div>
      )}

      {mode === "invite" && (
        <Card className="text-center space-y-4">
          <p className="text-stone-500 text-sm">Share this code with your partner. They enter it under “I have a code”.</p>
          <div className="text-4xl font-bold tracking-[0.3em] text-rose-600 bg-rose-50 rounded-2xl py-5">{code}</div>
          <Button onClick={share}>Share code</Button>
          <p className="text-xs text-stone-400">Waiting for your partner… you can browse the Home tab meanwhile — this screen updates automatically once they join.</p>
          <button className="text-sm text-stone-400" onClick={() => setMode("choose")}>Back</button>
        </Card>
      )}

      {mode === "enter" && (
        <div className="space-y-3">
          <Input
            placeholder="Enter code"
            autoCapitalize="characters"
            value={entry}
            onChange={(e) => setEntry(e.target.value.toUpperCase())}
            className="text-center text-2xl tracking-[0.3em] font-bold"
            maxLength={6}
          />
          <Button onClick={accept} disabled={busy || entry.length < 4}>Pair up</Button>
          <button className="w-full text-sm text-stone-400 py-2" onClick={() => setMode("choose")}>Back</button>
        </div>
      )}

      {err && <p className="text-sm text-rose-600 text-center mt-4">{err}</p>}
    </Screen>
  );
}
