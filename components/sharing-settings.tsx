"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Copy, Droplets, Flame, LoaderCircle, Mail, ShieldCheck, Trash2, Utensils, Weight } from "lucide-react";
import {
  sharePermissionCodes,
  sharePermissionLabels,
  shareRelationshipLabels,
  shareRelationships,
  type SharePermissionCode,
  type ShareRelationship,
} from "@/lib/sharing";
import { showWaterTracking } from "@/lib/ui-features";

type PendingInvitation = {
  id: string;
  inviteeName: string;
  inviteeEmail: string;
  relationship: ShareRelationship;
  lastSentAt: string;
  expiresAt: string;
  sendCount: number;
  permissions: SharePermissionCode[];
};

type OutgoingShare = {
  id: string;
  name: string;
  email: string | null;
  relationship: ShareRelationship;
  connectedAt: string;
  notifyOwnerOnView: boolean;
  lastViewedAt: string | null;
  permissions: SharePermissionCode[];
};

type IncomingShare = {
  id: string;
  name: string;
  relationship: ShareRelationship;
  connectedAt: string;
  permissions: SharePermissionCode[];
};

type SharingData = { invitations: PendingInvitation[]; outgoing: OutgoingShare[]; incoming: IncomingShare[] };

const defaultPermissions: SharePermissionCode[] = ["calorie_total", "macro_totals", "meal_names_portions", "activity", "weight_trend", "goal_progress"];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function percent(value: number, target: number | null) {
  return target && target > 0 ? Math.min(100, Math.max(0, Math.round(value / target * 100))) : 0;
}

function PermissionChecklist({ value, onChange }: { value: SharePermissionCode[]; onChange: (value: SharePermissionCode[]) => void }) {
  return <div className="sharing-permission-list">{sharePermissionCodes.filter((code) => showWaterTracking || code !== "water_intake").map((code) => <label key={code}><input type="checkbox" checked={value.includes(code)} onChange={() => onChange(value.includes(code) ? value.filter((item) => item !== code) : [...value, code])} /><span>{sharePermissionLabels[code]}</span></label>)}</div>;
}

function SharingInfo({ children }: { children: React.ReactNode }) {
  return <div className="info-box"><ShieldCheck size={17} /><p>{children}</p></div>;
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function emailInvitationUrl(name: string, email: string, invitationUrl: string) {
  const subject = "Your private MyFitnessTracker invitation";
  const body = `Hi ${name},\n\nI've shared a private MyFitnessTracker dashboard with you. Use this invitation link to connect:\n${invitationUrl}\n\nThe link expires in 14 days.`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function InvitePartnerPanel({ onToast }: { onToast: (message: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState<ShareRelationship>("partner");
  const [permissions, setPermissions] = useState<SharePermissionCode[]>(defaultPermissions);
  const [invitationUrl, setInvitationUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const createInvitation = async () => {
    setBusy(true); setError(""); setInvitationUrl("");
    try {
      const response = await fetch("/api/sharing/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteeName: name, inviteeEmail: email, relationship, permissions }),
      });
      const data = await response.json() as { invitationUrl?: string; message?: string };
      if (!response.ok || !data.invitationUrl) throw new Error(data.message ?? "Could not create the invitation.");
      setInvitationUrl(data.invitationUrl);
      try { await copyText(data.invitationUrl); onToast("Private invitation link copied."); }
      catch { onToast("Invitation created. Copy the link below."); }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create the invitation.");
    } finally { setBusy(false); }
  };

  return <div className="panel-stack">
    <div className="invite-hero"><span className="icon-badge green"><ShieldCheck /></span><div><strong>Share progress, not passwords</strong><p>The invitation expires after 14 days and exposes only the categories you select.</p></div></div>
    <label className="settings-field"><span>Partner name</span><input value={name} maxLength={80} placeholder="e.g. Jamie" onChange={(event) => setName(event.target.value)} /></label>
    <label className="settings-field"><span>Email address</span><input value={email} type="email" maxLength={254} placeholder="jamie@example.com" onChange={(event) => setEmail(event.target.value)} /></label>
    <label className="settings-field"><span>Relationship</span><select value={relationship} onChange={(event) => setRelationship(event.target.value as ShareRelationship)}>{shareRelationships.map((item) => <option key={item} value={item}>{shareRelationshipLabels[item]}</option>)}</select></label>
    <PermissionChecklist value={permissions} onChange={setPermissions} />
    <button className="secondary-button panel-button" disabled={busy || !name.trim() || !email.trim() || permissions.length === 0} onClick={() => void createInvitation()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Copy size={17} />} {busy ? "Creating…" : "Create invitation link"}</button>
    {invitationUrl && <><label className="settings-field"><span>Private link</span><div className="sharing-link"><input readOnly value={invitationUrl} /><button aria-label="Copy invitation link" onClick={() => void copyText(invitationUrl).then(() => onToast("Invitation link copied."))}><Copy size={16} /></button></div></label><a className="secondary-button panel-button" href={emailInvitationUrl(name.trim(), email.trim(), invitationUrl)}><Mail size={17} /> Send with my email app</a><p className="sharing-empty">Your email app opens with the private link ready to review and send. No paid email service is used.</p></>}
    {error && <p className="food-picker-error" role="alert">{error}</p>}
  </div>;
}

function useSharingData() {
  const [data, setData] = useState<SharingData | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((current) => current + 1), []);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/sharing").then(async (response) => {
      const result = await response.json() as SharingData & { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Could not load partner sharing.");
      if (!cancelled) { setData(result); setError(""); }
    }).catch((requestError: unknown) => {
      if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Could not load partner sharing.");
    });
    return () => { cancelled = true; };
  }, [version]);
  return { data, error, reload };
}

export function ConnectedPartnersPanel({ onToast }: { onToast: (message: string) => void }) {
  const { data, error, reload } = useSharingData();
  const [busyId, setBusyId] = useState("");
  const revoke = async (kind: "invitations" | "shares", id: string) => {
    if (!window.confirm(kind === "shares" ? "Revoke this person’s access?" : "Cancel this invitation?")) return;
    setBusyId(id);
    try {
      const response = await fetch(`/api/sharing/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) { const body = await response.json() as { message?: string }; throw new Error(body.message ?? "Could not revoke access."); }
      onToast(kind === "shares" ? "Partner access revoked." : "Invitation cancelled."); reload();
    } catch (requestError) { onToast(requestError instanceof Error ? requestError.message : "Could not revoke access."); }
    finally { setBusyId(""); }
  };
  const renew = async (id: string) => {
    setBusyId(id);
    try {
      const response = await fetch(`/api/sharing/invitations/${encodeURIComponent(id)}`, { method: "PATCH" });
      const body = await response.json() as { invitationUrl?: string; message?: string };
      if (!response.ok || !body.invitationUrl) throw new Error(body.message ?? "Could not renew the invitation.");
      await copyText(body.invitationUrl); onToast("A renewed invitation link was copied."); reload();
    } catch (requestError) { onToast(requestError instanceof Error ? requestError.message : "Could not renew the invitation."); }
    finally { setBusyId(""); }
  };
  if (!data && !error) return <div className="invitation-loading"><LoaderCircle className="spin" size={20} /> Loading people…</div>;
  return <div className="panel-stack">
    {data && data.outgoing.length === 0 && data.invitations.length === 0 && <SharingInfo>No active connections or pending invitations yet.</SharingInfo>}
    {data?.outgoing.map((item) => <div className="person-card" key={item.id}><span className="person-avatar">{initials(item.name)}</span><div><strong>{item.name}</strong><span>{shareRelationshipLabels[item.relationship]} · Connected {formatDate(item.connectedAt)}</span><small>{item.permissions.length} categories shared{item.lastViewedAt ? ` · Viewed ${formatDate(item.lastViewedAt)}` : ""}</small></div><div className="person-actions"><button disabled={busyId === item.id} onClick={() => void revoke("shares", item.id)}><Trash2 size={15} /> Revoke</button></div></div>)}
    {data?.invitations.map((item) => <div className="person-card pending" key={item.id}><span className="person-avatar">{initials(item.inviteeName)}</span><div><strong>{item.inviteeName}</strong><span>{shareRelationshipLabels[item.relationship]} · {item.inviteeEmail}</span><small>Pending · expires {formatDate(item.expiresAt)}</small></div><div className="person-actions"><button disabled={busyId === item.id} onClick={() => void renew(item.id)}><Copy size={15} /> Renew link</button><button disabled={busyId === item.id} onClick={() => void revoke("invitations", item.id)}><Trash2 size={15} /></button></div></div>)}
    {error && <p className="food-picker-error" role="alert">{error}</p>}
  </div>;
}

function SharePermissionEditor({ share, onToast, onChanged }: { share: OutgoingShare; onToast: (message: string) => void; onChanged: () => void }) {
  const [permissions, setPermissions] = useState(share.permissions);
  const [notify, setNotify] = useState(share.notifyOwnerOnView);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/sharing/shares/${encodeURIComponent(share.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions, notifyOwnerOnView: notify }) });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Could not save permissions.");
      onToast(`Permissions for ${share.name} updated.`); onChanged();
    } catch (requestError) { onToast(requestError instanceof Error ? requestError.message : "Could not save permissions."); }
    finally { setBusy(false); }
  };
  return <section className="share-permission-editor"><div className="partner-heading"><span className="person-avatar">{initials(share.name)}</span><div><strong>{share.name}</strong><span>{shareRelationshipLabels[share.relationship]}</span></div><span className="sharing-live"><i /> Sharing</span></div><PermissionChecklist value={permissions} onChange={setPermissions} /><label className="check-line"><input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} /> Notify me when this dashboard is viewed (at most once every 6 hours)</label><button className="secondary-button panel-button" disabled={busy || permissions.length === 0} onClick={() => void save()}>{busy ? "Saving…" : "Save permissions"}</button></section>;
}

export function SharingPermissionsPanel({ onToast }: { onToast: (message: string) => void }) {
  const { data, error, reload } = useSharingData();
  if (!data && !error) return <div className="invitation-loading"><LoaderCircle className="spin" size={20} /> Loading permissions…</div>;
  return <div className="panel-stack">{data?.outgoing.length ? data.outgoing.map((share) => <SharePermissionEditor key={share.id} share={share} onToast={onToast} onChanged={reload} />) : <SharingInfo>Connect a person before configuring ongoing access.</SharingInfo>}{error && <p className="food-picker-error">{error}</p>}</div>;
}

type SharedDashboard = {
  share: { id: string; ownerName: string; relationship: ShareRelationship; connectedAt: string };
  date: string;
  calories: { consumedKcal: number; targetKcal: number | null } | null;
  macros: { carbohydrateG: number; totalFatG: number; proteinG: number; carbohydrateTargetG: number | null; totalFatTargetG: number | null; proteinTargetG: number | null } | null;
  meals: Array<{ id: string; mealType: string; name: string; brand: string | null; quantity: number; unit: string; grams: number | null; energyKcal: number | null }> | null;
  water: { totalMl: number; targetMl: number | null } | null;
  activity: { totalMinutes: number; energyKcal: number } | null;
  weight: Array<{ recordedAt: string; weightKg: number }> | null;
  goalProgress: { goal: string | null; targetWeightKg: number | null; currentWeightKg: number | null; weeklyRateKg: number | null; calorieTargetKcal: number | null } | null;
};

export function PartnerDashboard() {
  const { data, error } = useSharingData();
  const [selectedId, setSelectedId] = useState("");
  const [loadedDashboard, setLoadedDashboard] = useState<{ shareId: string; data: SharedDashboard } | null>(null);
  const [dashboardError, setDashboardError] = useState("");
  const incoming = data?.incoming ?? [];
  const activeId = selectedId || incoming[0]?.id || "";
  const dashboard = loadedDashboard?.shareId === activeId ? loadedDashboard.data : null;
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    const now = new Date();
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    void fetch(`/api/sharing/shares/${encodeURIComponent(activeId)}/dashboard?date=${dateKey}`).then(async (response) => {
      const result = await response.json() as SharedDashboard & { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Could not load the shared dashboard.");
      if (!cancelled) { setLoadedDashboard({ shareId: activeId, data: result }); setDashboardError(""); }
    }).catch((requestError: unknown) => { if (!cancelled) setDashboardError(requestError instanceof Error ? requestError.message : "Could not load the shared dashboard."); });
    return () => { cancelled = true; };
  }, [activeId]);
  if (!data && !error) return <div className="invitation-loading"><LoaderCircle className="spin" size={20} /> Loading shared dashboards…</div>;
  if (incoming.length === 0) return <div className="panel-stack"><SharingInfo>Dashboards shared with you will appear here after you accept an invitation.</SharingInfo>{error && <p className="food-picker-error">{error}</p>}</div>;
  if (!dashboard) return <div className="panel-stack"><label className="settings-field"><span>Shared profile</span><select value={activeId} onChange={(event) => setSelectedId(event.target.value)}>{incoming.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>{dashboardError ? <p className="food-picker-error">{dashboardError}</p> : <div className="invitation-loading"><LoaderCircle className="spin" size={20} /> Loading dashboard…</div>}</div>;
  const latestWeight = dashboard.weight?.at(-1)?.weightKg ?? null;
  const firstWeight = dashboard.weight?.[0]?.weightKg ?? null;
  return <div className="partner-dashboard">
    <label className="settings-field"><span>Shared profile</span><select value={activeId} onChange={(event) => setSelectedId(event.target.value)}>{incoming.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <div className="partner-heading"><span className="person-avatar">{initials(dashboard.share.ownerName)}</span><div><strong>{dashboard.share.ownerName}</strong><span>{dashboard.date}</span></div><span className="sharing-live"><i /> Sharing</span></div>
    <div className="partner-metrics">
      {dashboard.calories && <Metric label="Calories" value={`${Math.round(dashboard.calories.consumedKcal).toLocaleString()} cal`} detail={dashboard.calories.targetKcal === null ? "No shared target" : `of ${Math.round(dashboard.calories.targetKcal).toLocaleString()} cal`} progress={percent(dashboard.calories.consumedKcal, dashboard.calories.targetKcal)} />}
      {dashboard.macros && <Metric label="Carbohydrates" value={`${Math.round(dashboard.macros.carbohydrateG)} g`} detail={dashboard.macros.carbohydrateTargetG === null ? "No shared target" : `of ${Math.round(dashboard.macros.carbohydrateTargetG)} g`} progress={percent(dashboard.macros.carbohydrateG, dashboard.macros.carbohydrateTargetG)} />}
      {dashboard.macros && <Metric label="Fat" value={`${Math.round(dashboard.macros.totalFatG)} g`} detail={dashboard.macros.totalFatTargetG === null ? "No shared target" : `of ${Math.round(dashboard.macros.totalFatTargetG)} g`} progress={percent(dashboard.macros.totalFatG, dashboard.macros.totalFatTargetG)} />}
      {dashboard.macros && <Metric label="Protein" value={`${Math.round(dashboard.macros.proteinG)} g`} detail={dashboard.macros.proteinTargetG === null ? "No shared target" : `of ${Math.round(dashboard.macros.proteinTargetG)} g`} progress={percent(dashboard.macros.proteinG, dashboard.macros.proteinTargetG)} />}
      {showWaterTracking && dashboard.water ? <Metric label="Water" value={`${(dashboard.water.totalMl / 1000).toFixed(1)} L`} detail={dashboard.water.targetMl === null ? "No shared target" : `of ${(dashboard.water.targetMl / 1000).toFixed(1)} L`} progress={percent(dashboard.water.totalMl, dashboard.water.targetMl)} /> : null}
      {dashboard.activity && <Metric label="Activity" value={`${dashboard.activity.totalMinutes} min`} detail={`${Math.round(dashboard.activity.energyKcal)} cal`} progress={0} />}
      {latestWeight !== null && <Metric label="Latest weight" value={`${latestWeight.toFixed(1)} kg`} detail={firstWeight === null ? "Shared weight" : `${latestWeight - firstWeight >= 0 ? "+" : ""}${(latestWeight - firstWeight).toFixed(1)} kg`} progress={0} />}
      {dashboard.goalProgress?.targetWeightKg != null && <Metric label="Weight goal" value={`${dashboard.goalProgress.targetWeightKg.toFixed(1)} kg`} detail={dashboard.goalProgress.currentWeightKg === null ? "Current weight not shared" : `${Math.abs(dashboard.goalProgress.currentWeightKg - dashboard.goalProgress.targetWeightKg).toFixed(1)} kg remaining`} progress={0} />}
    </div>
    {dashboard.meals && <div className="shared-meals"><h3>Meals shared today</h3>{dashboard.meals.length ? dashboard.meals.map((meal) => <div key={meal.id}><span className="icon-badge green"><Utensils size={17} /></span><p><small>{meal.mealType} · {meal.quantity} {meal.unit}{meal.grams === null ? "" : ` · ${Math.round(meal.grams)} g`}</small><strong>{meal.name}</strong></p><b>{meal.energyKcal === null ? "—" : `${Math.round(meal.energyKcal)} cal`}</b></div>) : <p className="sharing-empty">No meals logged for this day.</p>}</div>}
    <div className="sharing-data-icons">{dashboard.activity && <Activity size={16} />}{showWaterTracking && dashboard.water ? <Droplets size={16} /> : null}{dashboard.weight && <Weight size={16} />}{dashboard.calories && <Flame size={16} />}</div>
    <SharingInfo>Only categories authorized by {dashboard.share.ownerName} are returned by the server. Private notes are never included.</SharingInfo>
  </div>;
}

function Metric({ label, value, detail, progress }: { label: string; value: string; detail: string; progress: number }) {
  return <div><span>{label}</span><strong>{value}</strong><small>{detail}</small>{progress > 0 && <i><b style={{ width: `${progress}%` }} /></i>}</div>;
}
