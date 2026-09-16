"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowDown, Droplets, Flame, Footprints, Plus } from "lucide-react";
import { WeightQuickStats } from "./weight-quick-stats";
import type { WeightProgress } from "@/lib/weight-progress";
import { Donut } from "./charts";
import { Card, ProgressBar, SectionTitle } from "./ui";
import { AllTargets, NutritionScores } from "./nutrition-home";
import { type WaterUnit, formatWaterAmount } from "@/lib/water-units";
import type { NutritionScore } from "@/lib/nutrition-score";
import { energyUnitLabel, energyValue, formatEnergy, type EnergyUnit, type WeightUnit } from "@/lib/user-preferences";
import { showWaterTracking } from "@/lib/ui-features";

type HomeSection = "quickStats" | "energy" | "scores" | "meals" | "streak" | "activity" | "habits" | "targets";

export type HomeVisibility = Record<HomeSection, boolean>;

export const defaultHomeVisibility: HomeVisibility = {
  quickStats: true, energy: true, scores: true, meals: true, streak: true,
  activity: true, habits: true, targets: true,
};

export const homeCustomizeOptions: Array<{ id: HomeSection; title: string; detail: string }> = [
  { id: "quickStats", title: "Quick stats", detail: "Weight history and weekly change" },
  { id: "energy", title: "Calorie budget", detail: "Adaptive expenditure and macro targets" },
  { id: "scores", title: "Nutrition scores", detail: "Daily nutrition quality" },
  { id: "meals", title: "Today's meals", detail: "Logged meals and times" },
  { id: "activity", title: "Activity", detail: "Exercise and calorie burn" },
  { id: "streak", title: "Tracking streak", detail: "Current and best streak" },
  { id: "targets", title: "All nutrition targets", detail: "Complete nutrient data table" },
];

type DemoActivity = { id: string; label: string; detail: string; kcal: number };

type DashboardMeal = {
  id: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  loggedAt: string;
  name: string;
  brand: string | null;
  quantity: number;
  grams: number | null;
  energyKcal: number;
};

type DashboardData = {
  weight: { weightKg: number; recordedAt: string } | null;
  weightProgress: WeightProgress;
  meals: DashboardMeal[];
  nutrition: {
    entryCount: number;
    macros: { energyKcal: number; proteinG: number; carbohydrateG: number; totalFatG: number };
    nutrients: Record<string, number>;
    score: NutritionScore;
  };
  water: { totalMl: number; goalMl: number };
  plan: {
    available: boolean;
    missingProfileFields: string[];
    expenditureKcal: number | null;
    calorieGoalKcal: number | null;
    carbsTargetG: number | null;
    fatTargetG: number | null;
    proteinTargetG: number | null;
  };
  streak: { currentDays: number; bestDays: number };
};

type DashboardCacheEntry = {
  data: DashboardData;
  refreshVersion: number;
  expiresAt: number;
};

const DASHBOARD_CACHE_TTL_MS = 2 * 60 * 1000;
const dashboardCache = new Map<string, DashboardCacheEntry>();
const dashboardRequests = new Map<string, Promise<DashboardData>>();

async function requestDashboard(url: string, requestKey: string) {
  const pending = dashboardRequests.get(requestKey);
  if (pending) return pending;

  const request = fetch(url)
    .then(async (response) => {
      const data = await response.json() as DashboardData & { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Could not load today’s nutrition.");
      return data;
    })
    .finally(() => dashboardRequests.delete(requestKey));
  dashboardRequests.set(requestKey, request);
  return request;
}

function formatMealTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function HomeView({
  visible,
  waterMl,
  waterGoalMl,
  waterUnit,
  waterQuickAddMl,
  weightKg,
  extraActivities,
  diaryRefreshVersion,
  diaryDate,
  dashboardCacheScope,
  energyUnit,
  weightUnit,
  locale,
  showMacros,
  showActivity,
  onLogActivity,
  onAddWater,
}: {
  visible: HomeVisibility;
  waterMl: number;
  waterGoalMl: number | null;
  waterUnit: WaterUnit;
  waterQuickAddMl: number;
  weightKg: number | null;
  extraActivities: DemoActivity[];
  diaryRefreshVersion: number;
  diaryDate: string;
  dashboardCacheScope: string;
  energyUnit: EnergyUnit;
  weightUnit: WeightUnit;
  locale: string;
  showMacros: boolean;
  showActivity: boolean;
  onLogActivity: () => void;
  onAddWater: () => void;
}) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardError, setDashboardError] = useState("");
  const waterGoal = dashboard?.water.goalMl ?? waterGoalMl;
  const waterPercent = waterGoal && waterGoal > 0 ? Math.round((waterMl / waterGoal) * 100) : 0;
  const displayedActivities = extraActivities;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const cacheKey = `${dashboardCacheScope}:${diaryDate}`;
      const cached = dashboardCache.get(cacheKey);
      if (cached?.refreshVersion === diaryRefreshVersion && cached.expiresAt > Date.now()) {
        setDashboard(cached.data);
        setDashboardError("");
        return;
      }
      if (cached) setDashboard(cached.data);
      try {
        const data = await requestDashboard(`/api/dashboard?date=${diaryDate}`, `${cacheKey}:${diaryRefreshVersion}`);
        dashboardCache.set(cacheKey, {
          data,
          refreshVersion: diaryRefreshVersion,
          expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
        });
        if (cancelled) return;
        setDashboard(data);
        setDashboardError("");
      } catch (error) {
        if (!cancelled) setDashboardError(error instanceof Error ? error.message : "Could not load today’s nutrition.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [dashboardCacheScope, diaryDate, diaryRefreshVersion]);

  const suppliedKcal = Math.round(dashboard?.nutrition.macros.energyKcal ?? 0);
  const suppliedCarbs = dashboard?.nutrition.macros.carbohydrateG ?? 0;
  const suppliedFat = dashboard?.nutrition.macros.totalFatG ?? 0;
  const suppliedProtein = dashboard?.nutrition.macros.proteinG ?? 0;
  const calorieGoal = dashboard?.plan.calorieGoalKcal ?? null;
  const expenditureKcal = dashboard?.plan.expenditureKcal ?? null;
  const hasCaloriePlan = calorieGoal !== null && calorieGoal > 0;
  const calorieRemaining = hasCaloriePlan ? calorieGoal - suppliedKcal : null;
  const caloriePercent = hasCaloriePlan ? Math.round((suppliedKcal / calorieGoal) * 100) : 0;
  const carbsTarget = dashboard?.plan.carbsTargetG == null ? null : Math.round(dashboard.plan.carbsTargetG);
  const fatTarget = dashboard?.plan.fatTargetG == null ? null : Math.round(dashboard.plan.fatTargetG);
  const proteinTarget = dashboard?.plan.proteinTargetG == null ? null : Math.round(dashboard.plan.proteinTargetG);
  const currentStreak = dashboard?.streak.currentDays ?? 0;
  const bestStreak = dashboard?.streak.bestDays ?? 0;
  const displayedEnergyUnit = energyUnitLabel(energyUnit);

  const quickStatsStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: showWaterTracking ? "repeat(3, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))",
    gap: 12,
    width: "100%",
  };

  const quickStatItemStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    alignItems: "center",
    columnGap: 12,
    width: "100%",
    minWidth: 0,
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 18,
    background: "var(--surface)",
    color: "var(--accent)",
    textAlign: "left",
  };

  const quickStatCopyStyle: React.CSSProperties = {
    display: "grid",
    gap: 2,
    minWidth: 0,
    justifyItems: "start",
  };

  return (
    <div className="home-page">
      <div className="home-layout">
      <div className="home-main">
        {visible.quickStats && <div className="quick-stats" style={quickStatsStyle}>
          <WeightQuickStats weightKg={dashboard ? dashboard.weight?.weightKg ?? null : weightKg} recordedAt={dashboard?.weight?.recordedAt} progress={dashboard?.weightProgress} loading={!dashboard && !dashboardError} weightUnit={weightUnit} locale={locale} date={diaryDate} />
          {showWaterTracking ? <div style={quickStatItemStyle}>
            <Droplets size={17} />
            <span style={quickStatCopyStyle}><strong>{formatWaterAmount(waterMl, waterUnit)}</strong><small>{waterGoal === null ? "Set a water goal" : `of ${formatWaterAmount(waterGoal, waterUnit)}`}</small></span>
          </div> : null}
        </div>}

        {visible.energy && <Card className="energy-card">
          <div className="energy-heading">
            <div><span className="eyebrow">Daily energy</span><h2>Your calorie budget</h2></div>
            <span className={`on-track ${calorieRemaining !== null && calorieRemaining < 0 ? "over-target" : ""}`}><span />{calorieRemaining === null ? "Complete profile" : calorieRemaining >= 0 ? "On track" : `${formatEnergy(Math.abs(calorieRemaining), energyUnit, locale)} over`}</span>
          </div>
          <div className="energy-body">
            <div className="energy-stat supplied"><span className="round-icon teal"><ArrowDown size={20} /></span><strong>{formatEnergy(suppliedKcal, energyUnit, locale).replace(` ${displayedEnergyUnit}`, "")}</strong><small>supplied {displayedEnergyUnit}</small></div>
            <Donut value={caloriePercent} centerValue={calorieRemaining === null ? "—" : energyValue(Math.abs(calorieRemaining), energyUnit).toLocaleString(locale, { maximumFractionDigits: 0 })} centerLabel={calorieRemaining === null ? "complete profile" : calorieRemaining >= 0 ? `${displayedEnergyUnit} left` : `${displayedEnergyUnit} over`} />
            <div className="energy-stat burned"><span className="round-icon amber"><Flame size={20} /></span><strong>{expenditureKcal === null ? "—" : formatEnergy(expenditureKcal, energyUnit, locale).replace(` ${displayedEnergyUnit}`, "")}</strong><small>expenditure {displayedEnergyUnit}</small></div>
          </div>
          {showMacros && <div className="macro-grid">
            <div><span><i className="dot carbs" />carbs</span><strong>{Math.round(suppliedCarbs)}<small>/{carbsTarget ?? "—"} g</small></strong><ProgressBar value={carbsTarget ? (suppliedCarbs / carbsTarget) * 100 : 0} color="var(--carbs)" /></div>
            <div><span><i className="dot fat" />fat</span><strong>{Math.round(suppliedFat)}<small>/{fatTarget ?? "—"} g</small></strong><ProgressBar value={fatTarget ? (suppliedFat / fatTarget) * 100 : 0} color="var(--fat)" /></div>
            <div><span><i className="dot protein" />protein</span><strong>{Math.round(suppliedProtein)}<small>/{proteinTarget ?? "—"} g</small></strong><ProgressBar value={proteinTarget ? (suppliedProtein / proteinTarget) * 100 : 0} color="var(--protein)" /></div>
          </div>}
        </Card>}

        {dashboardError && <p className="food-picker-error" role="alert">{dashboardError}</p>}

        {visible.scores && <NutritionScores score={dashboard?.nutrition.score ?? null} />}

        {visible.meals && <section className="meal-section">
          <SectionTitle title="Today's meals" />
          <Card style={{ overflow: "hidden" }}>
            {dashboard?.meals.length ? dashboard.meals.map((meal, index) => (
              <div
                key={meal.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "76px minmax(0, 1fr) auto",
                  alignItems: "center",
                  gap: 14,
                  minHeight: 64,
                  padding: "11px 16px",
                  borderBottom: index < dashboard.meals.length - 1 ? "1px solid var(--border)" : "0",
                }}
              >
                <time style={{ color: "var(--muted)", fontSize: 11, fontWeight: 800 }}>{formatMealTime(meal.loggedAt)}</time>
                <div className="meal-copy">
                  <strong>{meal.name}</strong>
                  <small>{meal.brand ?? `${meal.mealType} · ${meal.quantity} serving${meal.quantity === 1 ? "" : "s"}`}</small>
                </div>
                <div className="meal-kcal"><strong>{energyValue(meal.energyKcal, energyUnit).toLocaleString(locale, { maximumFractionDigits: 0 })}</strong><span>{displayedEnergyUnit}</span></div>
              </div>
            )) : <p style={{ margin: 0, padding: "22px 16px", color: "var(--muted)", fontSize: 12, textAlign: "center" }}>No foods logged today.</p>}
          </Card>
        </section>}
      </div>

      <aside className="home-aside">
        {visible.streak && <Card className="streak-card">
          <div className="streak-icon"><Flame size={24} /></div>
          <div><strong>{currentStreak} day{currentStreak === 1 ? "" : "s"} streak</strong><span>{currentStreak > 0 ? "You’re building a healthy rhythm." : "Log food today to begin your streak."}</span></div>
          <span className="best">Best: {bestStreak}</span>
        </Card>}

        {visible.activity && showActivity && <section>
          <SectionTitle title="Activity" />
          <Card className="activity-list">
            {displayedActivities.map((item, index) => (
              <div className="activity-row" key={`${item.label}-${item.detail}-${index}`}>
                <span className={index ? "round-icon amber" : "round-icon green"}>{index ? <Footprints size={19} /> : <Activity size={19} />}</span>
                <div><strong>{item.label}</strong><small>{item.detail}</small></div>
                <span><Flame size={14} /> {item.kcal} cal</span>
              </div>
            ))}
            {displayedActivities.length === 0 && <p style={{ margin: 0, padding: "4px 0 14px", color: "var(--muted)", fontSize: 12, textAlign: "center" }}>No activity logged today.</p>}
            <button className="secondary-button" onClick={onLogActivity}><Plus size={18} /> Log activity</button>
          </Card>
        </section>}

        {showWaterTracking && visible.habits ? <section>
          <SectionTitle title="Daily habits" />
          <Card className="habits-card">
            <div className="habit-head"><span className="round-icon green"><Droplets size={19} /></span><div><strong>Water</strong><span>{formatWaterAmount(waterMl, waterUnit)}{waterGoal === null ? " · Set a goal" : ` of ${formatWaterAmount(waterGoal, waterUnit)}`}</span></div><b>{waterGoal === null ? "—" : `${waterPercent}%`}</b></div>
            <ProgressBar value={waterPercent} color="var(--accent)" />
            <button className="secondary-button" onClick={onAddWater}><Plus size={18} /> Add {formatWaterAmount(waterQuickAddMl, waterUnit)}</button>
          </Card>
        </section> : null}
      </aside>
      </div>

      {visible.targets && <AllTargets
        refreshVersion={diaryRefreshVersion}
        totals={dashboard?.nutrition.nutrients ?? {}}
        entryCount={dashboard?.nutrition.entryCount ?? 0}
        plan={dashboard?.plan ?? null}
      />}
    </div>
  );
}
