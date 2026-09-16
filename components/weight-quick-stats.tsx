import { Scale, TrendingUp } from "lucide-react";
import type { WeightProgress } from "@/lib/weight-progress";
import { formatWeight, weightDisplayValue, weightUnitLabel, type WeightUnit } from "@/lib/user-preferences";

export function WeightQuickStats({ weightKg, recordedAt, progress, loading, weightUnit, locale, date }: {
  weightKg: number | null;
  recordedAt?: string;
  progress?: WeightProgress;
  loading: boolean;
  weightUnit: WeightUnit;
  locale: string;
  date: string;
}) {
  const rate = (kg: number) => {
    const precision = weightUnit === "st" ? 2 : 1;
    const factor = 10 ** precision;
    const value = Math.round(weightDisplayValue(kg, weightUnit) * factor) / factor;
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: precision, signDisplay: "exceptZero" }).format(value === 0 ? 0 : value)} ${weightUnitLabel(weightUnit)}/week`;
  };
  const history = progress?.history ?? [];
  const values = history.map((item) => item.weightKg);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const end = Date.parse(`${date}T00:00:00Z`);
  const points = history.map((item) => {
    const x = 3 + (Date.parse(`${item.date}T00:00:00Z`) - (end - 13 * 86_400_000)) / (13 * 86_400_000) * 134;
    const y = high === low ? 17 : 29 - (item.weightKg - low) / (high - low) * 24;
    return `${x},${y}`;
  }).join(" ");
  const recordedDay = recordedAt ? new Date(recordedAt).toISOString().slice(0, 10) : null;
  const dateLabel = recordedDay === date ? "Today" : recordedDay ? new Date(`${recordedDay}T12:00:00Z`).toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" }) : null;
  const change = progress?.weeklyChangeKg;
  return <>
    <article className="weight-stat">
      <header><Scale size={16} /><span>Weight</span></header>
      <strong>{weightKg === null ? "—" : formatWeight(weightKg, weightUnit, locale)}</strong>
      <small>{weightKg === null ? "No weigh-ins yet" : `Latest weigh-in${dateLabel ? ` · ${dateLabel}` : ""}`}</small>
      {history.length > 1 ? <svg className="weight-stat-sparkline" viewBox="0 0 140 34" role="img" aria-label="Recorded weight over the past 14 days"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : <span className="weight-stat-footnote">Log weight to build your trend</span>}
    </article>
    <article className="weight-stat weekly-weight-stat">
      <header><TrendingUp size={16} /><span>Weekly change</span></header>
      <strong>{change != null ? rate(change) : "—"}</strong>
      <small>{change != null ? "Based on your weight trend" : loading ? "Loading trend…" : progress?.status === "stale" ? "Log a recent weigh-in" : progress ? "Building trend" : "Trend unavailable"}</small>
      <span className="weight-stat-footnote">{progress?.weeklyGoalKg != null ? progress.weeklyGoalKg === 0 ? "Goal: maintain weight" : `Goal: ${rate(progress.weeklyGoalKg)}` : "Set a weekly goal in your profile"}</span>
    </article>
  </>;
}
