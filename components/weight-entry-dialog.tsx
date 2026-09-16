"use client";

import { useState } from "react";
import { Scale, X } from "lucide-react";
import { type WeightUnit, weightAmountToKg, weightDisplayValue, weightUnitLabel } from "@/lib/user-preferences";

export function WeightEntryDialog({ initialWeightKg, weightUnit, onClose, onSave }: { initialWeightKg: number | null; weightUnit: WeightUnit; onClose: () => void; onSave: (weightKg: number) => Promise<void> }) {
  const [weightInput, setWeightInput] = useState(() => String(Number(weightDisplayValue(initialWeightKg ?? 70, weightUnit).toFixed(1))));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    const displayedWeight = Number(weightInput);
    const weightKg = weightAmountToKg(displayedWeight, weightUnit);
    if (!weightInput.trim() || !Number.isFinite(weightKg) || weightKg < 20 || weightKg > 500) {
      setError("Enter a valid body weight.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(weightKg);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save weight.");
      setSaving(false);
    }
  };

  return <div className="modal-backdrop weight-entry-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="weight-entry-sheet" role="dialog" aria-modal="true" aria-labelledby="weight-entry-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="sheet-handle" />
      <header><span className="round-icon coral"><Scale size={19} /></span><div><span className="eyebrow">Check-in</span><h2 id="weight-entry-title">Record your weight</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={20} /></button></header>
      <label>Weight<div><input autoFocus type="number" inputMode="decimal" min={weightUnit === "kg" ? 20 : weightUnit === "lb" ? 44 : 3} max={weightUnit === "kg" ? 500 : weightUnit === "lb" ? 1100 : 79} step="0.1" value={weightInput} onChange={(event) => setWeightInput(event.target.value)} /><span>{weightUnitLabel(weightUnit)}</span></div></label>
      {error && <p className="food-picker-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save weight"}</button>
    </section>
  </div>;
}
