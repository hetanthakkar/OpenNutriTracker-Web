"use client";

import { FormEvent, useState } from "react";
import { Activity, X } from "lucide-react";
import { energyAmountToKcal, energyUnitLabel, type EnergyUnit } from "@/lib/user-preferences";

export type ActivityEntryInput = {
  name: string;
  durationMinutes: number;
  energyKcal: number;
  loggedAt: string;
};

function localDateTimeValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function ActivityEntryDialog({
  onClose,
  onSave,
  energyUnit,
}: {
  onClose: () => void;
  onSave: (entry: ActivityEntryInput) => Promise<void>;
  energyUnit: EnergyUnit;
}) {
  const [name, setName] = useState("");
  const [durationInput, setDurationInput] = useState("30");
  const [energyInput, setEnergyInput] = useState("0");
  const [loggedAt, setLoggedAt] = useState(() => localDateTimeValue(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const activityName = name.trim();
    const durationMinutes = Number(durationInput);
    const energyKcal = energyAmountToKcal(Number(energyInput), energyUnit);
    const timestamp = new Date(loggedAt);
    if (!activityName || activityName.length > 100) {
      setError("Enter an activity name.");
      return;
    }
    if (!durationInput.trim() || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
      setError("Enter a duration from 1 to 1,440 minutes.");
      return;
    }
    if (!energyInput.trim() || !Number.isFinite(energyKcal) || energyKcal < 0 || energyKcal > 20000) {
      setError("Enter calories burned from 0 to 20,000 cal.");
      return;
    }
    if (Number.isNaN(timestamp.getTime())) {
      setError("Choose a valid date and time.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({
        name: activityName,
        durationMinutes,
        energyKcal,
        loggedAt: timestamp.toISOString(),
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save activity.");
      setSaving(false);
    }
  };

  return <div className="modal-backdrop activity-entry-backdrop" role="presentation" onMouseDown={saving ? undefined : onClose}>
    <section className="activity-entry-sheet" role="dialog" aria-modal="true" aria-labelledby="activity-entry-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="sheet-handle" />
      <header><span className="round-icon amber"><Activity size={19} /></span><div><span className="eyebrow">Activity</span><h2 id="activity-entry-title">Log an activity</h2></div><button className="icon-button" aria-label="Close" disabled={saving} onClick={onClose}><X size={20} /></button></header>
      <form onSubmit={save}>
        <label>Activity name<input autoFocus list="activity-name-options" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Walking" /></label>
        <datalist id="activity-name-options"><option value="Walking" /><option value="Running" /><option value="Cycling" /><option value="Strength training" /><option value="Swimming" /><option value="Yoga" /></datalist>
        <div className="activity-entry-grid">
          <label>Duration<div><input type="number" inputMode="numeric" min="1" max="1440" step="1" value={durationInput} onChange={(event) => setDurationInput(event.target.value)} /><span>min</span></div></label>
          <label>Calories burned<div><input type="number" inputMode="decimal" min="0" max={energyUnit === "kJ" ? 83680 : 20000} step="1" value={energyInput} onChange={(event) => setEnergyInput(event.target.value)} /><span>{energyUnitLabel(energyUnit)}</span></div></label>
        </div>
        <label>Date and time<input type="datetime-local" value={loggedAt} onChange={(event) => setLoggedAt(event.target.value)} /></label>
        {error && <p className="food-picker-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save activity"}</button>
      </form>
    </section>
  </div>;
}
