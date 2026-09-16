"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, HeartPulse, Link2, ShieldCheck, Watch, X } from "lucide-react";
import { Card } from "./ui";
import { conduitCategories } from "@/lib/apple-health";

type HealthStatus = {
  configured: boolean;
  connected: boolean;
  latest: {
    receivedAt: string;
    processedAt: string | null;
    status: "received" | "processed" | "failed";
    summary: { measurements: number; weights: number; workouts: number };
    error: string | null;
  } | null;
};

const HEALTH_EVENT = "ont:health-connection-changed";

export function AppleHealthSection() {
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [ingestToken, setIngestToken] = useState("");
  const [copied, setCopied] = useState<"webhook" | "token" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/health/conduit", { cache: "no-store" });
      const data = await response.json() as HealthStatus & { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Could not load Apple Health status.");
      setStatus(data);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Apple Health status.");
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void refreshStatus(); });
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshStatus();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshStatus]);

  useEffect(() => {
    if (!status?.configured || status.connected) return;
    const interval = window.setInterval(() => { void refreshStatus(); }, 10_000);
    return () => window.clearInterval(interval);
  }, [refreshStatus, status?.configured, status?.connected]);

  const webhookUrl = useMemo(() => {
    if (typeof window === "undefined") return "/api/health/conduit";
    return `${window.location.origin}/api/health/conduit`;
  }, []);

  const copy = async (value: string, kind: "webhook" | "token") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch { setCopied(null); }
  };

  const createToken = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/me/health-ingest", { method: "POST" });
      const data = await response.json() as { token?: string; message?: string };
      if (!response.ok || !data.token) throw new Error(data.message ?? "Could not create an ingest token.");
      setIngestToken(data.token);
      setStatus((current) => ({ configured: true, connected: current?.connected ?? false, latest: current?.latest ?? null }));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create an ingest token.");
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/me/health-ingest", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not disconnect Apple Health.");
      setIngestToken("");
      setStatus({ configured: false, connected: false, latest: null });
      window.dispatchEvent(new Event(HEALTH_EVENT));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect Apple Health.");
    } finally { setBusy(false); }
  };

  const latestAt = status?.latest?.receivedAt
    ? new Date(status.latest.receivedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;
  const importedCount = status?.latest
    ? status.latest.summary.measurements + status.latest.summary.weights + status.latest.summary.workouts
    : 0;

  if (status?.connected) {
    return (
      <section className="apple-health-section">
        <div className="health-section-head">
          <div><span className="eyebrow">Apple Health</span><h2>Health & activity</h2><p>Conduit is sending health data to this profile.</p></div>
          <div className="health-source-actions"><span className="health-live"><i /> Receiving data</span><button disabled={busy} onClick={() => void disconnect()}>Disconnect</button></div>
        </div>
        <Card className="health-details-card health-sync-status-card">
          <div className="health-details-head">
            <div><span>Connection active</span><strong>Latest Conduit delivery</strong></div>
            <span className="health-live"><i /> {latestAt ?? "Received"}</span>
          </div>
          <div className="health-sync-status-message">
            {status.latest?.status === "failed" ? <p role="alert">The latest delivery was saved but could not be imported: {status.latest.error ?? "Unknown error"}</p> : <p>{importedCount > 0 ? `${importedCount} health record${importedCount === 1 ? "" : "s"} imported: ${status.latest?.summary.weights ?? 0} weight, ${status.latest?.summary.workouts ?? 0} workout, and ${status.latest?.summary.measurements ?? 0} other measurement${(status.latest?.summary.measurements ?? 0) === 1 ? "" : "s"}.` : "The connection was confirmed. New Apple Health readings will appear here after Conduit sends them."}</p>}
            <button className="secondary-button" disabled={busy} onClick={() => void refreshStatus()}>Refresh</button>
          </div>
        </Card>
        {error && <p className="food-picker-error" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section className="apple-health-section">
      <Card className="health-connect-card">
        <div className="health-connect-copy"><span className="health-logo"><HeartPulse size={22} /></span><div><div className="health-title-row"><strong>Apple Health</strong><span>Optional</span></div><p>Bring activity, sleep, heart, workout and body data into your trends with Conduit Health Sync.</p><small>Skip this and the rest of MyFitnessTracker works exactly the same.</small></div></div>
        <button className="secondary-button health-connect-button" onClick={() => setSetupOpen(true)}><Link2 size={17} /> {status?.configured ? "Finish setup" : "Connect"}</button>
      </Card>
      {status?.configured && <div className="health-pending-status"><span><Watch size={16} /> Webhook ready — checking for the first Conduit delivery.</span><button className="text-button" disabled={busy} onClick={() => void refreshStatus()}>Check now</button></div>}
      {error && <p className="food-picker-error" role="alert">{error}</p>}
      {setupOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setSetupOpen(false)}><section className="health-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="health-setup-title" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="health-setup-head"><div><span className="eyebrow">Optional integration</span><h2 id="health-setup-title">Connect Apple Health with Conduit</h2><p>Conduit reads only the Apple Health categories you allow and forwards them to your secure webhook.</p></div><button className="icon-button" aria-label="Close" onClick={() => setSetupOpen(false)}><X size={20} /></button></div><div className="health-setup-steps"><div className="health-step"><span>1</span><div><strong>Install Conduit Health Sync</strong><p>The App Store listing is free and requires iOS 17 or later.</p><a href="https://apps.apple.com/us/app/conduit-health-sync/id6786544769" target="_blank" rel="noreferrer">Open App Store <ExternalLink size={15} /></a></div></div><div className="health-step"><span>2</span><div><strong>Choose what you want to share</strong><p>Enable only the Health categories you want MyFitnessTracker to receive.</p><div className="health-category-chips">{conduitCategories.map((category) => <span key={category}>{category}</span>)}</div></div></div><div className="health-step"><span>3</span><div><strong>Add your webhook and bearer token</strong><p>Generate a token, then use this URL and token in Conduit. The token is shown only once.</p><div className="health-webhook"><code>{webhookUrl}</code><button onClick={() => void copy(webhookUrl, "webhook")} aria-label="Copy webhook URL">{copied === "webhook" ? <Check size={16} /> : <Copy size={16} />}</button></div>{ingestToken && <div className="health-webhook health-token"><code>{ingestToken}</code><button onClick={() => void copy(ingestToken, "token")} aria-label="Copy bearer token">{copied === "token" ? <Check size={16} /> : <Copy size={16} />}</button></div>}</div></div></div><div className="health-preview-note"><ShieldCheck size={18} /><p><strong>Secure connection:</strong> your token is stored as a hash and can be revoked here at any time. Health readings will appear only after Conduit delivers data.</p></div><div className="health-setup-actions"><button className="dialog-cancel" onClick={() => setSetupOpen(false)}>Not now</button><button className="primary-button" disabled={busy} onClick={() => void createToken()}>{ingestToken ? "Generate replacement token" : "Generate secure token"}</button></div></section></div>}
    </section>
  );
}
