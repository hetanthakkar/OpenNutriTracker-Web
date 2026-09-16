"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, Pencil, Trash2, X } from "lucide-react";
import { Card, ProgressBar, SectionTitle } from "./ui";
import { positivePortionAmount, type PortionOption } from "@/lib/food-portions";
import { dateFromKey, diaryDateKey, energyValue, formatEnergy, type EnergyUnit } from "@/lib/user-preferences";

export type DemoMealSection = "Breakfast" | "Lunch" | "Dinner" | "Snack";

export type DemoDiaryMeal = {
  id: string | number;
  section: DemoMealSection;
  name: string;
  detail: string;
  kcal: number;
};

type SavedDiaryMeal = DemoDiaryMeal & {
  loggedAt: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  quantity: number;
  grams: number | null;
  portionId: string | null;
  unit: string;
  portions: PortionOption[];
  macros: DiaryApiEntry["macros"];
};

type CalendarDay = {
  key: string;
  date: Date;
  label: number;
  outside: boolean;
  status: "met" | "missed" | "logged" | "none" | "future";
};

type CalendarStatus = "met" | "missed" | "logged";

type DiaryCalendarCacheEntry = {
  refreshVersion: number;
  reloadVersion: number;
  statuses: Map<string, CalendarStatus>;
};

const diaryCalendarCache = new Map<string, DiaryCalendarCacheEntry>();

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function buildCalendar(month: Date, today: Date, statuses: Map<string, CalendarStatus>): CalendarDay[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const first = new Date(year, monthIndex, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, monthIndex, 1 - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    const outside = date.getMonth() !== monthIndex;
    const inFuture = startOfDay(date).getTime() > today.getTime();
    const key = localDateKey(date);
    return {
      key,
      date,
      label: date.getDate(),
      outside,
      status: inFuture ? "future" : outside ? "none" : statuses.get(key) ?? "none",
    };
  });
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric" }).format(date);
}

function formatTime(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatMonth(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function calendarStatusLabel(status: CalendarDay["status"]) {
  if (status === "met") return "goal met";
  if (status === "missed") return "outside calorie goal";
  if (status === "logged") return "food logged; no calorie goal";
  return status === "future" ? "future date" : "no food logged";
}

type DiaryApiEntry = {
  id: string;
  loggedAt: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  brand: string | null;
  quantity: number;
  grams: number | null;
  portionId: string | null;
  portionLabel: string | null;
  unit: string;
  portions: PortionOption[];
  macros: {
    energyKcal: number | null;
    proteinG: number | null;
    carbohydrateG: number | null;
    totalFatG: number | null;
    dietaryFiberG?: number | null;
    totalSugarsG?: number | null;
    sodiumMg?: number | null;
  };
};

export function DiaryView({
  refreshVersion,
  cacheScope,
  energyUnit,
  locale,
  showMacros,
  dayStart,
}: {
  refreshVersion: number;
  cacheScope: string;
  energyUnit: EnergyUnit;
  locale: string;
  showMacros: boolean;
  dayStart: string;
}) {
  const currentDiaryDate = useMemo(() => dateFromKey(diaryDateKey(new Date(), dayStart)), [dayStart]);
  const [month, setMonth] = useState(() => new Date(currentDiaryDate.getFullYear(), currentDiaryDate.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(currentDiaryDate));
  const [savedMeals, setSavedMeals] = useState<SavedDiaryMeal[]>([]);
  const [calorieGoalKcal, setCalorieGoalKcal] = useState<number | null>(null);
  const [dayCompleted, setDayCompleted] = useState(false);
  const [completionSaving, setCompletionSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [editingMeal, setEditingMeal] = useState<SavedDiaryMeal | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [calendarStatuses, setCalendarStatuses] = useState<Map<string, CalendarStatus>>(() => new Map());
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const calendarDays = useMemo(() => buildCalendar(month, currentDiaryDate, calendarStatuses), [calendarStatuses, currentDiaryDate, month]);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `${cacheScope}:${monthKey(month)}`;
    const cached = diaryCalendarCache.get(cacheKey);
    if (cached?.refreshVersion === refreshVersion && cached.reloadVersion === reloadVersion) {
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setCalendarStatuses(new Map(cached.statuses));
        setLoadError("");
      });
      return () => { cancelled = true; };
    }
    const load = async () => {
      try {
        const response = await fetch(`/api/diary/calendar?month=${monthKey(month)}`);
        const data = await response.json() as { days?: Array<{ date: string; status: CalendarStatus }>; message?: string };
        if (!response.ok) throw new Error(data.message ?? "Could not load calendar activity.");
        const statuses = new Map((data.days ?? []).map((day) => [day.date, day.status]));
        diaryCalendarCache.set(cacheKey, { refreshVersion, reloadVersion, statuses });
        if (!cancelled) {
          setCalendarStatuses(new Map(statuses));
          setLoadError("");
        }
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load calendar activity.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [cacheScope, month, refreshVersion, reloadVersion]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/diary?date=${localDateKey(selectedDate)}`);
        const data = await response.json() as { entries?: DiaryApiEntry[]; plan?: { calorieGoalKcal: number | null }; completion?: { completed?: boolean }; message?: string };
        if (!response.ok) throw new Error(data.message ?? "Could not load this diary day.");
        if (cancelled) return;
        const meals = (data.entries ?? []).map((entry): SavedDiaryMeal => ({
          id: entry.id,
          loggedAt: entry.loggedAt,
          section: `${entry.mealType.slice(0, 1).toUpperCase()}${entry.mealType.slice(1)}` as DemoMealSection,
          mealType: entry.mealType,
          name: entry.name,
          detail: `${entry.brand ?? "Catalog food"} · ${entry.quantity} ${entry.unit}${entry.grams === null ? "" : ` · ${entry.grams.toFixed(0)} g`}`,
          kcal: Math.round(entry.macros.energyKcal ?? 0),
          quantity: entry.quantity,
          grams: entry.grams,
          portionId: entry.portionId,
          unit: entry.unit,
          portions: entry.portions,
          macros: entry.macros,
        }));
        setSavedMeals(meals);
        setCalorieGoalKcal(data.plan?.calorieGoalKcal ?? null);
        setDayCompleted(data.completion?.completed === true);
        setLoadError("");
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load this diary day.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [refreshVersion, reloadVersion, selectedDate]);

  const shiftMonth = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    setSelectedDate(next);
  };

  const selectCalendarDay = (day: CalendarDay) => {
    setSelectedDate(day.date);
    if (day.outside) setMonth(new Date(day.date.getFullYear(), day.date.getMonth(), 1));
  };

  const shiftDay = (delta: number) => {
    const next = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + delta);
    setSelectedDate(next);
    if (next.getMonth() !== month.getMonth() || next.getFullYear() !== month.getFullYear()) {
      setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    }
  };

  const selectedDateKey = localDateKey(selectedDate);
  const selectedDateIsFuture = startOfDay(selectedDate).getTime() > startOfDay(currentDiaryDate).getTime();
  const totalKcal = savedMeals.reduce((sum, meal) => sum + meal.kcal, 0);
  const timelineMeals = [...savedMeals].sort((a, b) => {
    const first = new Date(a.loggedAt).getTime();
    const second = new Date(b.loggedAt).getTime();
    return (Number.isNaN(first) ? Number.POSITIVE_INFINITY : first) - (Number.isNaN(second) ? Number.POSITIVE_INFINITY : second);
  });
  const macroTotals = savedMeals.reduce((totals, meal) => ({
    carbs: totals.carbs + (meal.macros.carbohydrateG ?? 0),
    fat: totals.fat + (meal.macros.totalFatG ?? 0),
    protein: totals.protein + (meal.macros.proteinG ?? 0),
  }), { carbs: 0, fat: 0, protein: 0 });

  const updateEntry = async (id: string, update: { mealType: SavedDiaryMeal["mealType"]; amount: number; portionId?: string }) => {
    setMutatingId(id);
    setLoadError("");
    try {
      const response = await fetch(`/api/diary/entries/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const data = await response.json() as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Could not update this diary entry.");
      setEditingMeal(null);
      setReloadVersion((version) => version + 1);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not update this diary entry.");
    } finally {
      setMutatingId(null);
    }
  };

  const deleteEntry = async (meal: SavedDiaryMeal) => {
    if (!window.confirm(`Delete ${meal.name} from your diary?`)) return;
    const id = String(meal.id);
    setMutatingId(id);
    setLoadError("");
    try {
      const response = await fetch(`/api/diary/entries/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json() as { message?: string };
        throw new Error(data.message ?? "Could not delete this diary entry.");
      }
      setReloadVersion((version) => version + 1);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not delete this diary entry.");
    } finally {
      setMutatingId(null);
    }
  };

  const toggleDayCompletion = async () => {
    setCompletionSaving(true);
    setLoadError("");
    try {
      const response = await fetch("/api/diary", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDateKey, completed: !dayCompleted }),
      });
      const data = await response.json() as { completed?: boolean; message?: string };
      if (!response.ok) throw new Error(data.message ?? "Could not update day completion.");
      setDayCompleted(data.completed === true);
      setReloadVersion((version) => version + 1);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not update day completion.");
    } finally {
      setCompletionSaving(false);
    }
  };

  return (
    <div className="diary-layout">
      <Card className="calendar-card">
        <div className="calendar-head">
          <button aria-label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft /></button>
          <h2>{formatMonth(month, locale)}</h2>
          <button aria-label="Next month" onClick={() => shiftMonth(1)}><ChevronRight /></button>
        </div>
        <div className="weekdays">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">
          {calendarDays.map((day) => (
            <button key={day.key} className={`${day.outside ? "outside" : ""} ${sameDay(selectedDate, day.date) ? "selected" : ""}`} onClick={() => selectCalendarDay(day)} aria-label={`${formatDate(day.date, locale)}: ${calendarStatusLabel(day.status)}`}>
              <span>{day.label}</span>{day.status !== "none" && day.status !== "future" ? <i className={day.status} /> : null}
            </button>
          ))}
        </div>
        <div className="calendar-legend"><span><i className="met" /> Goal met</span><span><i className="missed" /> Outside goal</span><span><i className="logged" /> Logged</span></div>
      </Card>

      <div className="diary-day">
        <div className="diary-date">
          <div><span className="eyebrow">Your daily summary</span><h2>{formatDate(selectedDate, locale)}</h2></div>
          <button className="date-step" aria-label="Previous day" onClick={() => shiftDay(-1)}><ChevronLeft size={18} /></button>
          <button className="date-step" aria-label="Next day" onClick={() => shiftDay(1)}><ChevronRight size={18} /></button>
        </div>
        <Card className="diary-summary">
          <div><span>Energy</span><strong>{energyValue(totalKcal, energyUnit).toLocaleString(locale, { maximumFractionDigits: 0 })} <small>{calorieGoalKcal === null ? `/ Set up an energy goal` : `/ ${formatEnergy(calorieGoalKcal, energyUnit, locale)}`}</small></strong><ProgressBar value={calorieGoalKcal && calorieGoalKcal > 0 ? (totalKcal / calorieGoalKcal) * 100 : 0} /></div>
          {showMacros && <div className="diary-macros">
            <p><i className="dot carbs" /><span>Carbs<strong>{macroTotals.carbs.toFixed(1)} g</strong></span></p>
            <p><i className="dot fat" /><span>Fat<strong>{macroTotals.fat.toFixed(1)} g</strong></span></p>
            <p><i className="dot protein" /><span>Protein<strong>{macroTotals.protein.toFixed(1)} g</strong></span></p>
          </div>}
        </Card>
        {!selectedDateIsFuture && <div className={`diary-completion ${dayCompleted ? "complete" : ""}`}>
          <div><strong>{dayCompleted ? "Day complete" : "Finish your day"}</strong><small>{dayCompleted ? "This day can inform your adaptive TDEE. Editing food will reopen it automatically." : "Mark this only after all food for the day is logged. Completed days inform your adaptive TDEE."}</small></div>
          <button type="button" aria-pressed={dayCompleted} className={dayCompleted ? "secondary-button" : "primary-button"} disabled={completionSaving || (!dayCompleted && savedMeals.length === 0)} onClick={() => void toggleDayCompletion()}>{completionSaving ? "Saving…" : dayCompleted ? "Reopen day" : "Mark complete"}</button>
        </div>}

        {loadError && <p className="food-picker-error" role="alert">{loadError}</p>}
        <div className="diary-timeline">
          <div className="diary-timeline-head">
            <SectionTitle title="Timeline" />
          </div>
          {timelineMeals.length === 0 ? <p className="diary-timeline-empty">No food logged for this day.</p> : <div className="diary-timeline-list">
            {timelineMeals.map((meal) => <div className="diary-timeline-item" key={meal.id}>
              <time className="diary-timeline-time" dateTime={meal.loggedAt}>{formatTime(meal.loggedAt, locale)}</time>
              <span className="diary-timeline-marker" aria-hidden="true"><i className="diary-timeline-dot" /></span>
              <Card className="diary-timeline-card"><DiaryMeal meal={meal} busy={mutatingId === String(meal.id)} energyUnit={energyUnit} locale={locale} onEdit={() => setEditingMeal(meal)} onDelete={() => void deleteEntry(meal)} /></Card>
            </div>)}
          </div>}
        </div>
      </div>
      {editingMeal && <DiaryEntryEditor meal={editingMeal} busy={mutatingId === String(editingMeal.id)} onClose={() => setEditingMeal(null)} onSave={(update) => void updateEntry(String(editingMeal.id), update)} />}
    </div>
  );
}

function DiaryMeal({ meal, busy, energyUnit, locale, onEdit, onDelete }: { meal: SavedDiaryMeal; busy: boolean; energyUnit: EnergyUnit; locale: string; onEdit: () => void; onDelete: () => void }) {
  return <div className="diary-meal"><span className="food-result-mark diary-meal-mark" aria-hidden="true">{meal.name.trim().slice(0, 1).toUpperCase() || "F"}</span><div><strong>{meal.name}</strong><span>{meal.detail}</span></div><b>{formatEnergy(meal.kcal, energyUnit, locale)}</b><div className="diary-meal-actions"><button aria-label={`Edit ${meal.name}`} disabled={busy} onClick={onEdit}><Pencil size={16} /></button><button aria-label={`Delete ${meal.name}`} disabled={busy} onClick={onDelete}>{busy ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}</button></div></div>;
}

function DiaryEntryEditor({ meal, busy, onClose, onSave }: { meal: SavedDiaryMeal; busy: boolean; onClose: () => void; onSave: (update: { mealType: SavedDiaryMeal["mealType"]; amount: number; portionId?: string }) => void }) {
  const [mealType, setMealType] = useState<SavedDiaryMeal["mealType"]>(meal.mealType);
  const [amountInput, setAmountInput] = useState(String(meal.quantity));
  const [portionId, setPortionId] = useState(meal.portionId ?? meal.portions[0]?.id ?? "");
  const amount = positivePortionAmount(amountInput);
  return <div className="modal-backdrop diary-editor-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="diary-editor-sheet" role="dialog" aria-modal="true" aria-labelledby="diary-editor-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="sheet-handle" />
      <header className="diary-editor-head"><div><span className="eyebrow">Diary entry</span><h2 id="diary-editor-title">Edit {meal.name}</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={20} /></button></header>
      <p>{meal.detail}</p>
      <label>Meal<select value={mealType} onChange={(event) => setMealType(event.target.value as SavedDiaryMeal["mealType"])}><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option><option value="snack">Snack</option></select></label>
      <label>Amount<input type="number" inputMode="decimal" min="0.01" max="100000" step="0.01" value={amountInput} aria-invalid={amount <= 0} onChange={(event) => setAmountInput(event.target.value)} onBlur={() => { if (amount <= 0) setAmountInput(String(meal.quantity)); }} /></label>
      {meal.portions.length > 0 && <label>Unit<select value={portionId} onChange={(event) => { const next=meal.portions.find((portion)=>portion.id===event.target.value); setPortionId(event.target.value); if (next) setAmountInput(String(next.amount)); }}>{meal.portions.map((portion)=><option key={portion.id} value={portion.id}>{portion.label}</option>)}</select></label>}
      <button className="primary-button" disabled={busy || amount <= 0} onClick={() => onSave({ mealType, amount, ...(portionId ? {portionId} : {}) })}>{busy ? "Saving…" : "Save changes"}</button>
    </section>
  </div>;
}
