"use client";

import { Activity, Database, Footprints, Gauge, Info, Scale, Sparkles } from "lucide-react";
import { LineChart } from "./charts";
import { Card } from "./ui";
import type { HealthTrendPeriod } from "@/lib/apple-health";
import type { ExpenditureEstimate } from "@/lib/expenditure";

export type ExpenditureTrendData =
  | { available: false; missingProfileFields: string[] }
  | {
      available: true;
      currentTdeeKcal: number;
      isAdaptive: boolean;
      confidence: number;
      status: ExpenditureEstimate["status"];
      pauseReason: ExpenditureEstimate["pauseReason"];
      loggedIntakeDays: number;
      weighedDays: number;
      totalDays: number;
      recentLoggedIntakeDays: number;
      recentWeighedDays: number;
      requiredLoggedIntakeDays: number;
      requiredWeighedDays: number;
      history: Array<{ date: string; estimatedTdeeKcal: number; trendWeightKg: number }>;
    };

const PERIOD_DAYS: Record<HealthTrendPeriod, number> = {
  "7 days": 7,
  "30 days": 30,
  "90 days": 90,
  All: 120,
};

export function ExpenditureCard({ period, data, activeMinutes }: { period: HealthTrendPeriod; data: ExpenditureTrendData | null; activeMinutes: number }) {
  if (!data) {
    return <Card className="expenditure-card"><div className="expenditure-head"><div><span className="eyebrow">Adaptive expenditure</span><h2>Estimated daily expenditure</h2><p>Loading your saved nutrition and weight history…</p></div></div></Card>;
  }

  if (!data.available) {
    return <Card className="expenditure-card">
      <div className="expenditure-head"><div><span className="eyebrow">Adaptive expenditure</span><h2>Complete your expenditure setup</h2><p>Add {formatMissing(data.missingProfileFields)} in your profile so expenditure can be calculated from your real data.</p></div><span className="expenditure-confidence"><i /> Setup needed</span></div>
      <div className="expenditure-footnote"><Info size={15} /><span>No demo estimate is shown. Once setup is complete, logged calories and weight measurements will build your personal trend.</span></div>
    </Card>;
  }

  const visibleHistory = data.history.slice(-PERIOD_DAYS[period]);
  const labels = makeSparseLabels(visibleHistory.map((item) => item.date));
  const latest = visibleHistory.at(-1);
  const earliest = visibleHistory[0];
  const tdeeDelta = latest && earliest ? latest.estimatedTdeeKcal - earliest.estimatedTdeeKcal : 0;
  const confidencePct = Math.round(data.confidence * 100);
  const confidenceLabel = confidencePct >= 80 ? "High" : confidencePct >= 55 ? "Building" : "Low";
  const paused = data.status === "paused";
  const pauseMessage = data.pauseReason === "missing_intake"
    ? "Updates paused: more than three of the last seven food days are incomplete."
    : data.pauseReason === "stale_weight"
      ? "Updates paused: no weight measurement in the last three days."
      : "Updates paused: recent food and weight records are insufficient.";
  const intakeDaysRemaining = Math.max(0, data.requiredLoggedIntakeDays - data.recentLoggedIntakeDays);
  const weighInsRemaining = Math.max(0, data.requiredWeighedDays - data.recentWeighedDays);
  const evidenceNeeded = [
    intakeDaysRemaining > 0 ? `${intakeDaysRemaining} more complete food-log day${intakeDaysRemaining === 1 ? "" : "s"}` : null,
    weighInsRemaining > 0 ? `${weighInsRemaining} more weigh-in${weighInsRemaining === 1 ? "" : "s"}` : null,
  ].filter((item): item is string => item !== null).join(" and ");

  return (
    <Card className="expenditure-card">
      <div className="expenditure-head">
        <div><span className="eyebrow">Adaptive expenditure</span><h2>{data.isAdaptive ? "Estimated daily expenditure" : "Starting daily expenditure"}</h2><p>{paused ? pauseMessage : data.isAdaptive ? "Calculated from your saved calorie intake and weight trend." : `This formula estimate will start adapting after ${evidenceNeeded || "at least 14 days of tracking"}.`}</p></div>
        <span className={`expenditure-confidence ${!paused && data.isAdaptive && confidencePct >= 80 ? "high" : ""}`}><i /> {paused ? "Updates paused" : data.isAdaptive ? `${confidenceLabel} evidence · ${confidencePct}%` : "Building evidence"}</span>
      </div>
      <div className="expenditure-summary">
        <div className="expenditure-primary"><span className="round-icon green"><Gauge size={21} /></span><div><span>{paused ? "Last learned expenditure" : data.isAdaptive ? "Current expenditure" : "Starting expenditure"}</span><strong>{data.currentTdeeKcal.toLocaleString()} <small>cal/day</small></strong><em className={tdeeDelta >= 0 ? "up" : "down"}>{data.isAdaptive ? `${tdeeDelta >= 0 ? "+" : ""}${tdeeDelta} cal over ${period.toLowerCase()}` : "Profile-based estimate"}</em></div></div>
        <div className="expenditure-mini-metrics">
          <Metric icon={Scale} label="Trend weight" value={latest ? `${latest.trendWeightKg.toFixed(1)} kg` : "No data"} />
          <Metric icon={Database} label="Food logging" value={`${data.loggedIntakeDays}/${data.totalDays} days`} />
          <Metric icon={Activity} label="Logged activity" value={`${activeMinutes} min`} />
        </div>
      </div>
      <div className="expenditure-chart-title"><div><span>{data.isAdaptive ? "Expenditure trend" : "Starting estimate"}</span><strong>{data.currentTdeeKcal.toLocaleString()} <small>cal/day</small></strong></div><span>{period}</span></div>
      <LineChart values={visibleHistory.length ? visibleHistory.map((item) => item.estimatedTdeeKcal) : [data.currentTdeeKcal]} labels={labels.length ? labels : ["Today"]} height={190} />
      <div className="expenditure-method">
        <div><Sparkles size={17} /><p><strong>{data.isAdaptive ? "Learned estimate:" : "Cold start:"}</strong> {paused ? "held at its last value while recent evidence is incomplete." : data.isAdaptive ? "complete food logs and weight trend now progressively guide this estimate." : "your profile provides the initial estimate until there is enough real tracking data."}</p></div>
        <div><Scale size={17} /><p><strong>Weight evidence:</strong> {data.weighedDays} saved measurement{data.weighedDays === 1 ? "" : "s"} contribute to this estimate.</p></div>
        <div><Footprints size={17} /><p><strong>Activity:</strong> manually logged activity is reported separately and is not double-counted as extra calories.</p></div>
      </div>
      <div className="expenditure-footnote"><Info size={15} /><span>This estimate now uses your profile and saved tracking records; it no longer uses deterministic demo logs.</span></div>
    </Card>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Scale; label: string; value: string }) {
  return <div className="expenditure-metric"><span className="round-icon green"><Icon size={17} /></span><div><span>{label}</span><strong>{value}</strong></div></div>;
}

function formatMissing(fields: string[]) {
  if (fields.length <= 1) return fields[0] ?? "your profile details";
  return `${fields.slice(0, -1).join(", ")} and ${fields.at(-1)}`;
}

function makeSparseLabels(dates: string[]) {
  if (dates.length === 0) return [];
  const step = Math.max(1, Math.ceil(dates.length / 7));
  return dates.map((date, index) => {
    if (index !== dates.length - 1 && index % step !== 0) return "";
    return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  });
}
