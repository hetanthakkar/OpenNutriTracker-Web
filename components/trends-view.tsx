"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownRight, Droplets, Flame, HeartPulse, Scale, TrendingDown } from "lucide-react";
import { LineChart } from "./charts";
import { ExpenditureCard, type ExpenditureTrendData } from "./expenditure-card";
import { Card, ProgressBar } from "./ui";
import { type WaterUnit, formatWaterAmount, waterDisplayValue } from "@/lib/water-units";
import { energyValue, formatEnergy, formatWeight, type EnergyUnit, type WeightUnit } from "@/lib/user-preferences";
import { TrackingManager } from "./tracking-manager";
import { showWaterTracking } from "@/lib/ui-features";

const periods = ["7d", "30d", "90d", "all"] as const;
type Period = (typeof periods)[number];
type TrendDay = { date: string; calories: number; carbs: number; fat: number; protein: number; waterMl: number; activeMinutes: number; activityKcal: number; weightKg: number | null; steps: number; sleepHours: number; restingHeartRate: number | null };
type TrendData = {
  days: TrendDay[];
  targets: { calorieKcal: number | null; carbsG: number | null; fatG: number | null; proteinG: number | null; waterMl: number };
  expenditure: ExpenditureTrendData;
  summary: {
    averages: { calories: number; carbs: number; fat: number; protein: number; waterMl: number };
    activeMinutes: number;
    activityKcal: number;
    health: { loggedDays: number; averageSteps: number | null; averageSleepHours: number | null; averageRestingHeartRate: number | null };
    streakDays: number;
    weightChangeKg: number | null;
  };
};
type TrendCacheEntry = { data: TrendData; refreshVersion: number };

const trendsCache = new Map<string, TrendCacheEntry>();
const trendsRequests = new Map<string, Promise<TrendData>>();

function periodLabel(period: Period) {
  return period === "all" ? "All" : period.replace("d", " days");
}

function healthPeriod(period: Period): "7 days" | "30 days" | "90 days" | "All" {
  if (period === "all") return "All";
  return `${period.replace("d", "")} days` as "7 days" | "30 days" | "90 days";
}

function dayLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${date}T00:00:00Z`));
}

function chartData(days: TrendDay[], value: (day: TrendDay) => number) {
  const step = Math.max(1, Math.ceil(days.length / 7));
  const points = days.filter((_, index) => index % step === 0 || index === days.length - 1);
  return { values: points.map(value), labels: points.map((day) => dayLabel(day.date)) };
}

function weightChartData(days: TrendDay[]) {
  return chartData(days.filter((day) => day.weightKg !== null), (day) => day.weightKg ?? 0);
}

function requestTrends(url: string, requestKey: string) {
  const pending = trendsRequests.get(requestKey);
  if (pending) return pending;
  const request = fetch(url)
    .then(async (response) => {
      const body = await response.json() as TrendData & { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Could not load trends.");
      return body;
    })
    .finally(() => trendsRequests.delete(requestKey));
  trendsRequests.set(requestKey, request);
  return request;
}

export function TrendsView({ waterUnit, energyUnit, weightUnit, locale, dayStart, showActivity, cacheScope, refreshVersion }: { waterUnit: WaterUnit; energyUnit: EnergyUnit; weightUnit: WeightUnit; locale: string; dayStart: string; showActivity: boolean; cacheScope: string; refreshVersion: number }) {
  const [period, setPeriod] = useState<Period>("7d");
  const [data, setData] = useState<TrendData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `${cacheScope}:${period}`;
    const cached = trendsCache.get(cacheKey);
    const apply = (nextData: TrendData) => {
      if (cancelled) return;
      setData(nextData);
      setError("");
    };
    if (cached?.refreshVersion === refreshVersion) {
      void Promise.resolve(cached.data).then(apply);
      return () => { cancelled = true; };
    }
    if (cached) void Promise.resolve(cached.data).then(apply);
    void requestTrends(`/api/trends?range=${period}`, `${cacheKey}:${refreshVersion}`).then((nextData) => {
      trendsCache.set(cacheKey, { data: nextData, refreshVersion });
      apply(nextData);
    }).catch((requestError: unknown) => {
      if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Could not load trends.");
    });
    return () => { cancelled = true; };
  }, [cacheScope, period, refreshVersion]);

  const calories = useMemo(() => chartData(data?.days ?? [], (day) => day.calories), [data]);
  const water = useMemo(() => chartData(data?.days ?? [], (day) => waterDisplayValue(day.waterMl, waterUnit)), [data, waterUnit]);
  const weight = useMemo(() => weightChartData(data?.days ?? []), [data]);
  const averages = data?.summary.averages ?? { calories: 0, carbs: 0, fat: 0, protein: 0, waterMl: 0 };
  const weightChange = data?.summary.weightChangeKg;
  const latestWeight = weight.values.at(-1);
  const health = data?.summary.health;

  return (
    <div className="trends-page">
      <div className="trends-head">
        <div><span className="eyebrow">Your progress</span><h2>Small steps, visible progress</h2><p>Daily averages and habits based on your saved entries.</p></div>
        <div className="segmented">{periods.map((item) => <button key={item} className={period === item ? "active" : ""} onClick={() => setPeriod(item)}>{periodLabel(item)}</button>)}</div>
      </div>

      {showActivity && <ExpenditureCard period={healthPeriod(period)} data={data?.expenditure ?? null} activeMinutes={data?.summary.activeMinutes ?? 0} />}

      <div className="trend-kpis">
        <Card><span className="round-icon green"><Flame size={20} /></span><div><span>Current streak</span><strong>{data?.summary.streakDays ?? 0} <small>days</small></strong></div><em>Food logging</em></Card>
        <Card><span className="round-icon teal"><Scale size={20} /></span><div><span>Weight change</span><strong>{weightChange === null || weightChange === undefined ? "—" : `${weightChange < 0 ? "−" : "+"}${formatWeight(Math.abs(weightChange), weightUnit, locale)}`}</strong></div><em className={weightChange !== null && weightChange !== undefined && weightChange < 0 ? "positive" : ""}>{weightChange !== null && weightChange !== undefined && weightChange < 0 && <ArrowDownRight size={15} />} {latestWeight === undefined ? "No entries" : "Saved data"}</em></Card>
        {showActivity && <Card><span className="round-icon amber"><Activity size={20} /></span><div><span>Active time</span><strong>{data?.summary.activeMinutes ?? 0} <small>min</small></strong></div><em>{formatEnergy(data?.summary.activityKcal ?? 0, energyUnit, locale)} burned</em></Card>}
        {showActivity && health?.loggedDays ? <Card><span className="round-icon green"><HeartPulse size={20} /></span><div><span>Apple Health</span><strong>{Math.round(health.averageSteps ?? 0).toLocaleString(locale)} <small>steps/day</small></strong></div><em>{health.averageSleepHours ? `${health.averageSleepHours.toFixed(1)} h sleep average` : "Health data synced"}</em></Card> : null}
      </div>
      {error && <p className="food-picker-error" role="alert">{error}</p>}
      <div className="trend-grid">
        <Card className="chart-card calories-chart">
          <div className="chart-title"><div><span>Energy</span><strong>{energyValue(averages.calories, energyUnit).toLocaleString(locale, { maximumFractionDigits: 0 })} <small>{energyUnit} daily average</small></strong></div><span className="chart-pill"><TrendingDown size={15} /> {periodLabel(period)}</span></div>
          <LineChart values={calories.values.length ? calories.values : [0]} labels={calories.labels.length ? calories.labels : ["No entries"]} />
        </Card>
        <Card className="chart-card">
          <div className="chart-title"><div><span>Weight</span><strong>{latestWeight === undefined ? "—" : formatWeight(latestWeight, weightUnit, locale)} <small>{latestWeight === undefined ? "no saved weights" : "latest"}</small></strong></div><span className="chart-pill"><TrendingDown size={15} /> Saved</span></div>
          <LineChart values={weight.values.length ? weight.values : [0]} color="var(--protein)" labels={weight.labels.length ? weight.labels : ["No entries"]} />
        </Card>
        <Card className="average-card">
          <div className="chart-title"><div><span>Daily average</span><strong>Nutrition</strong></div></div>
          <div className="average-list">
            <MacroAverage label="Carbs" average={averages.carbs} target={data?.targets.carbsG ?? null} color="var(--carbs)" />
            <MacroAverage label="Fat" average={averages.fat} target={data?.targets.fatG ?? null} color="var(--fat)" />
            <MacroAverage label="Protein" average={averages.protein} target={data?.targets.proteinG ?? null} color="var(--protein)" />
          </div>
        </Card>
        {showWaterTracking ? <Card className="chart-card water-chart">
          <div className="chart-title"><div><span>Hydration</span><strong>{formatWaterAmount(averages.waterMl, waterUnit)} <small>daily average</small></strong></div><span className="round-icon green"><Droplets size={19} /></span></div>
          <LineChart values={water.values.length ? water.values : [0]} color="var(--accent)" labels={water.labels.length ? water.labels : ["No entries"]} />
        </Card> : null}
      </div>
      <TrackingManager waterUnit={waterUnit} energyUnit={energyUnit} weightUnit={weightUnit} locale={locale} dayStart={dayStart} showActivity={showActivity} />
    </div>
  );
}

function MacroAverage({ label, average, target, color }: { label: string; average: number; target: number | null; color: string }) {
  return <div><p><span>{label}</span><strong>{Math.round(average)}{target === null ? " g average" : ` / ${Math.round(target)} g`}</strong></p>{target !== null && <ProgressBar value={(average / target) * 100} color={color} />}</div>;
}
