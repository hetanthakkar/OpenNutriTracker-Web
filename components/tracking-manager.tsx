"use client";

import { useEffect, useState } from "react";
import { Activity, Droplets, Pencil, Scale, Trash2, X } from "lucide-react";
import { Card } from "./ui";
import { formatWaterAmount, type WaterUnit, waterAmountToMl, waterDisplayValue, waterUnitLabel } from "@/lib/water-units";
import { diaryDateKey, energyAmountToKcal, energyDisplayValue, formatEnergy, formatWeight, type EnergyUnit, type WeightUnit, weightAmountToKg, weightDisplayValue, weightUnitLabel } from "@/lib/user-preferences";
import { showWaterTracking } from "@/lib/ui-features";

type WaterEntry = { id: string; amountMl: number; loggedAt: string };
type ActivityEntry = { id: string; name: string; durationMinutes: number; energyKcal: number; loggedAt: string };
type WeightEntry = { id: string; weightKg: number; recordedAt: string };

function localDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function localDateTime(value: string) {
  const date = new Date(value);
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

function time(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

/** Edit and remove tracking entries without leaving Trends. */
export function TrackingManager({ waterUnit, energyUnit, weightUnit, locale, dayStart, showActivity }: { waterUnit: WaterUnit; energyUnit: EnergyUnit; weightUnit: WeightUnit; locale: string; dayStart: string; showActivity: boolean }) {
  const [date, setDate] = useState(() => diaryDateKey(new Date(), dayStart));
  const [waterEntries, setWaterEntries] = useState<WaterEntry[]>([]);
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([]);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);
  const [editingWater, setEditingWater] = useState<WaterEntry | null>(null);
  const [editingActivity, setEditingActivity] = useState<ActivityEntry | null>(null);
  const [editingWeight, setEditingWeight] = useState<WeightEntry | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [waterResponse, activityResponse, weightResponse] = await Promise.all([
          fetch(`/api/water?date=${date}`),
          fetch(`/api/activities?date=${date}`),
          fetch("/api/weights?limit=50"),
        ]);
        const water = await waterResponse.json() as { entries?: WaterEntry[]; message?: string };
        const activities = await activityResponse.json() as { entries?: ActivityEntry[]; message?: string };
        const weights = await weightResponse.json() as { entries?: WeightEntry[]; message?: string };
        if (!waterResponse.ok) throw new Error(water.message ?? "Could not load water history.");
        if (!activityResponse.ok) throw new Error(activities.message ?? "Could not load activity history.");
        if (!weightResponse.ok) throw new Error(weights.message ?? "Could not load weight history.");
        if (!cancelled) { setWaterEntries(water.entries ?? []); setActivityEntries(activities.entries ?? []); setWeightEntries(weights.entries ?? []); setError(""); }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load tracking history.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [date, refresh]);

  const complete = () => {
    setEditingWater(null); setEditingActivity(null); setEditingWeight(null);
    setRefresh((current) => current + 1);
    window.dispatchEvent(new Event("ont-tracking-updated"));
  };

  const remove = async (kind: "water" | "activities" | "weights", id: string) => {
    if (!window.confirm("Delete this tracking entry?")) return;
    setBusy(`${kind}:${id}`); setError("");
    try {
      const response = await fetch(`/api/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) { const data = await response.json() as { message?: string }; throw new Error(data.message ?? "Could not delete entry."); }
      complete();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete entry."); }
    finally { setBusy(""); }
  };

  const saveWater = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingWater) return;
    const form = new FormData(event.currentTarget);
    const amountMl = waterAmountToMl(Number(form.get("amount")), waterUnit);
    const loggedAt = String(form.get("loggedAt"));
    setBusy(`water:${editingWater.id}`); setError("");
    try {
      const response = await fetch(`/api/water/${editingWater.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountMl, loggedAt: new Date(loggedAt).toISOString(), diaryDate: diaryDateKey(new Date(loggedAt), dayStart) }) });
      if (!response.ok) { const data = await response.json() as { message?: string }; throw new Error(data.message ?? "Could not update water."); }
      complete();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update water."); }
    finally { setBusy(""); }
  };

  const saveActivity = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingActivity) return;
    const form = new FormData(event.currentTarget);
    const loggedAt = String(form.get("loggedAt"));
    setBusy(`activities:${editingActivity.id}`); setError("");
    try {
      const response = await fetch(`/api/activities/${editingActivity.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), durationMinutes: Number(form.get("durationMinutes")), energyKcal: energyAmountToKcal(Number(form.get("energy")), energyUnit), loggedAt: new Date(loggedAt).toISOString(), diaryDate: diaryDateKey(new Date(loggedAt), dayStart) }) });
      if (!response.ok) { const data = await response.json() as { message?: string }; throw new Error(data.message ?? "Could not update activity."); }
      complete();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update activity."); }
    finally { setBusy(""); }
  };

  const saveWeight = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingWeight) return;
    const form = new FormData(event.currentTarget);
    setBusy(`weights:${editingWeight.id}`); setError("");
    try {
      const response = await fetch(`/api/weights/${editingWeight.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weightKg: weightAmountToKg(Number(form.get("weight")), weightUnit), recordedAt: new Date(String(form.get("recordedAt"))).toISOString() }) });
      if (!response.ok) { const data = await response.json() as { message?: string }; throw new Error(data.message ?? "Could not update weight."); }
      complete();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update weight."); }
    finally { setBusy(""); }
  };

  return <section className="tracking-manager">
    <div className="tracking-manager-head"><div><span className="eyebrow">Your records</span><h2>Manage tracking</h2><p>Review, correct, or remove individual entries.</p></div><label>Date<input type="date" value={date} max={localDate(new Date())} onChange={(event) => setDate(event.target.value)} /></label></div>
    {error && <p className="food-picker-error" role="alert">{error}</p>}
    <div className="tracking-grid">
      {showWaterTracking ? <TrackingCard icon={<Droplets size={19} />} title="Water" empty="No water entries for this diary day.">{waterEntries.map((entry) => <TrackingRow key={entry.id} detail={`${time(entry.loggedAt, locale)} · ${formatWaterAmount(entry.amountMl, waterUnit)}`} busy={busy === `water:${entry.id}`} onEdit={() => setEditingWater(entry)} onDelete={() => void remove("water", entry.id)} />)}</TrackingCard> : null}
      {showActivity && <TrackingCard icon={<Activity size={19} />} title="Activity" empty="No activity entries for this diary day.">{activityEntries.map((entry) => <TrackingRow key={entry.id} name={entry.name} detail={`${time(entry.loggedAt, locale)} · ${entry.durationMinutes} min · ${formatEnergy(entry.energyKcal, energyUnit, locale)} burned`} busy={busy === `activities:${entry.id}`} onEdit={() => setEditingActivity(entry)} onDelete={() => void remove("activities", entry.id)} />)}</TrackingCard>}
      <TrackingCard icon={<Scale size={19} />} title="Weight history" empty="No saved weight entries.">{weightEntries.map((entry) => <TrackingRow key={entry.id} name={formatWeight(entry.weightKg, weightUnit, locale)} detail={new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.recordedAt))} busy={busy === `weights:${entry.id}`} onEdit={() => setEditingWeight(entry)} onDelete={() => void remove("weights", entry.id)} />)}</TrackingCard>
    </div>
    {showWaterTracking && editingWater ? <EditSheet title="Edit water" onClose={() => setEditingWater(null)}><form onSubmit={saveWater}><label>Amount ({waterUnitLabel(waterUnit)})<input name="amount" type="number" min={waterUnit === "fl_oz" ? 0.1 : 1} step={waterUnit === "fl_oz" ? 0.1 : 1} defaultValue={waterDisplayValue(editingWater.amountMl, waterUnit)} /></label><label>Date and time<input name="loggedAt" type="datetime-local" defaultValue={localDateTime(editingWater.loggedAt)} /></label><button className="primary-button" disabled={Boolean(busy)}>{busy ? "Saving…" : "Save water"}</button></form></EditSheet> : null}
    {editingActivity && <EditSheet title="Edit activity" onClose={() => setEditingActivity(null)}><form onSubmit={saveActivity}><label>Name<input name="name" maxLength={100} defaultValue={editingActivity.name} /></label><div className="form-row"><label>Minutes<input name="durationMinutes" type="number" min="1" max="1440" defaultValue={editingActivity.durationMinutes} /></label><label>Energy ({energyUnit})<input name="energy" type="number" min="0" max={energyUnit === "kJ" ? 83680 : 20000} defaultValue={Number(energyDisplayValue(editingActivity.energyKcal, energyUnit).toFixed(0))} /></label></div><label>Date and time<input name="loggedAt" type="datetime-local" defaultValue={localDateTime(editingActivity.loggedAt)} /></label><button className="primary-button" disabled={Boolean(busy)}>{busy ? "Saving…" : "Save activity"}</button></form></EditSheet>}
    {editingWeight && <EditSheet title="Edit weight" onClose={() => setEditingWeight(null)}><form onSubmit={saveWeight}><label>Weight ({weightUnitLabel(weightUnit)})<input name="weight" type="number" min={weightUnit === "kg" ? 20 : weightUnit === "lb" ? 44 : 3} max={weightUnit === "kg" ? 500 : weightUnit === "lb" ? 1100 : 79} step="0.1" defaultValue={Number(weightDisplayValue(editingWeight.weightKg, weightUnit).toFixed(1))} /></label><label>Date and time<input name="recordedAt" type="datetime-local" defaultValue={localDateTime(editingWeight.recordedAt)} /></label><button className="primary-button" disabled={Boolean(busy)}>{busy ? "Saving…" : "Save weight"}</button></form></EditSheet>}
  </section>;
}

function TrackingCard({ icon, title, empty, children }: { icon: React.ReactNode; title: string; empty: string; children: React.ReactNode }) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : [children].filter(Boolean);
  return <Card className="tracking-card"><h3><span className="round-icon green">{icon}</span>{title}</h3>{rows.length ? <div>{children}</div> : <p>{empty}</p>}</Card>;
}

function TrackingRow({ name, detail, busy, onEdit, onDelete }: { name?: string; detail: string; busy: boolean; onEdit: () => void; onDelete: () => void }) {
  return <div className="tracking-row"><p>{name && <strong>{name}</strong>}<small>{detail}</small></p><div><button aria-label="Edit entry" disabled={busy} onClick={onEdit}><Pencil size={15} /></button><button aria-label="Delete entry" disabled={busy} onClick={onDelete}><Trash2 size={15} /></button></div></div>;
}

function EditSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="tracking-edit-sheet" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><header><h2>{title}</h2><button className="icon-button" aria-label="Close" onClick={onClose}><X size={20} /></button></header>{children}</section></div>;
}
