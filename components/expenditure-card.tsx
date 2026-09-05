"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Database, Footprints, Gauge, Info, Scale, Sparkles } from "lucide-react";
import { LineChart } from "./charts";
import { Card } from "./ui";
import { estimateAdaptiveExpenditure } from "@/lib/expenditure";
import { createDemoExpenditureObservations, demoExpenditureProfile } from "@/lib/expenditure-demo";
import type { HealthTrendPeriod } from "@/lib/apple-health";

const HEALTH_STORAGE_KEY = "ont:conduit-health-preview";
const HEALTH_EVENT = "ont:health-connection-changed";

const PERIOD_DAYS: Record<HealthTrendPeriod, number> = {
  "7 days": 7,
  "30 days": 30,
  "90 days": 90,
  All: 120,
};

export function ExpenditureCard({ period }: { period: HealthTrendPeriod }) {
  const [healthConnected, setHealthConnected] = useState(false);

  useEffect(() => {
    const sync = () => setHealthConnected(window.localStorage.getItem(HEALTH_STORAGE_KEY) === "connected");
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(HEALTH_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(HEALTH_EVENT, sync);
    };
  }, []);

  const estimate = useMemo(() => {
    const observations = createDemoExpenditureObservations(healthConnected);
    return estimateAdaptiveExpenditure(observations, demoExpenditureProfile);
  }, [healthConnected]);

  const visibleHistory = estimate.history.slice(-PERIOD_DAYS[period]);
  const labels = makeSparseLabels(visibleHistory.map((item) => item.date));
  const latest = estimate.history.at(-1);
  const earliest = visibleHistory[0];
  const tdeeDelta = latest && earliest ? latest.estimatedTdeeKcal - earliest.estimatedTdeeKcal : 0;
  const confidencePct = Math.round(estimate.confidence * 100);
  const confidenceLabel = confidencePct >= 80 ? "High" : confidencePct >= 55 ? "Building" : "Low";
  const recent = estimate.history.slice(-14);
  const loggedRecent = recent.filter((item) => !item.intakeImputed).length;
  const latestWeight = latest?.trendWeightKg ?? demoExpenditureProfile.weightKg;

  return (
    <Card className="expenditure-card">
      <div className="expenditure-head">
        <div>
          <span className="eyebrow">Adaptive expenditure</span>
          <h2>Estimated daily expenditure</h2>
          <p>Learned from calorie intake and trend weight. Activity data only changes responsiveness.</p>
        </div>
        <span className={`expenditure-confidence ${confidencePct >= 80 ? "high" : ""}`}>
          <i /> {confidenceLabel} confidence · {confidencePct}%
        </span>
      </div>

      <div className="expenditure-summary">
        <div className="expenditure-primary">
          <span className="round-icon green"><Gauge size={21} /></span>
          <div>
            <span>Current expenditure</span>
            <strong>{estimate.currentTdeeKcal.toLocaleString()} <small>kcal/day</small></strong>
            <em className={tdeeDelta >= 0 ? "up" : "down"}>{tdeeDelta >= 0 ? "+" : ""}{tdeeDelta} kcal over {period.toLowerCase()}</em>
          </div>
        </div>

        <div className="expenditure-mini-metrics">
          <Metric icon={Scale} label="Trend weight" value={`${latestWeight.toFixed(1)} kg`} />
          <Metric icon={Database} label="Food logging" value={`${loggedRecent}/14 days`} />
          <Metric icon={healthConnected ? Footprints : Activity} label="Activity signal" value={healthConnected ? "Apple Health" : "Not connected"} />
        </div>
      </div>

      <div className="expenditure-chart-title">
        <div><span>Expenditure trend</span><strong>{estimate.currentTdeeKcal.toLocaleString()} <small>kcal/day</small></strong></div>
        <span>{period}</span>
      </div>
      <LineChart values={visibleHistory.map((item) => item.estimatedTdeeKcal)} labels={labels} height={190} />

      <div className="expenditure-method">
        <div><Sparkles size={17} /><p><strong>Cold start:</strong> Mifflin-St Jeor provides the initial estimate, then logged data progressively takes over.</p></div>
        <div><Scale size={17} /><p><strong>Weight change:</strong> Hall/Forbes fat-vs-lean energetics replace a fixed kcal-per-kg assumption.</p></div>
        <div><Footprints size={17} /><p><strong>Apple Health:</strong> steps can speed adaptation when activity changes, but watch-reported calories are not added to TDEE.</p></div>
      </div>

      <div className="expenditure-footnote">
        <Info size={15} />
        <span>Prototype currently runs on deterministic demo logs. The estimator is production-shaped and accepts real daily calorie, weight and optional step records.</span>
      </div>
    </Card>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Scale; label: string; value: string }) {
  return <div className="expenditure-metric"><span className="round-icon green"><Icon size={17} /></span><div><span>{label}</span><strong>{value}</strong></div></div>;
}

function makeSparseLabels(dates: string[]): string[] {
  if (dates.length === 0) return [];
  const maxLabels = 7;
  const step = Math.max(1, Math.ceil(dates.length / maxLabels));
  return dates.map((date, index) => {
    if (index !== dates.length - 1 && index % step !== 0) return "";
    const parsed = new Date(`${date}T12:00:00Z`);
    return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  });
}
