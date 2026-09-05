"use client";

import { Activity, ArrowDown, Droplets, Flame, Footprints, Plus, Scale } from "lucide-react";
import { activity, meals } from "@/lib/mock-data";
import { Donut } from "./charts";
import { Card, ProgressBar, SectionTitle } from "./ui";
import { AllTargets, NutritionScores } from "./nutrition-home";

type HomeSection = "quickStats" | "energy" | "scores" | "meals" | "streak" | "activity" | "habits" | "targets";

export type HomeVisibility = Record<HomeSection, boolean>;

export const defaultHomeVisibility: HomeVisibility = {
  quickStats: true, energy: true, scores: true, meals: true, streak: true,
  activity: true, habits: true, targets: true,
};

export const homeCustomizeOptions: Array<{ id: HomeSection; title: string; detail: string }> = [
  { id: "quickStats", title: "Quick stats", detail: "Weight and water" },
  { id: "energy", title: "Calorie budget", detail: "Energy and macro rings" },
  { id: "scores", title: "Nutrition scores", detail: "Daily nutrition quality" },
  { id: "meals", title: "Today's meals", detail: "Logged meals and times" },
  { id: "activity", title: "Activity", detail: "Exercise and calorie burn" },
  { id: "habits", title: "Daily habits", detail: "Hydration progress" },
  { id: "streak", title: "Tracking streak", detail: "Current and best streak" },
  { id: "targets", title: "All nutrition targets", detail: "Complete nutrient data table" },
];

type DemoActivity = { id: number; label: string; detail: string; kcal: number };

export function HomeView({
  visible,
  waterMl,
  weightKg,
  extraActivities,
  onLogActivity,
  onAddWater,
}: {
  visible: HomeVisibility;
  waterMl: number;
  weightKg: number;
  extraActivities: DemoActivity[];
  onLogActivity: () => void;
  onAddWater: () => void;
}) {
  const waterGoal = 1900;
  const waterPercent = Math.round((waterMl / waterGoal) * 100);
  const displayedActivities = [...activity, ...extraActivities];

  const quickStatsStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
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
          <div style={quickStatItemStyle}>
            <Scale size={17} />
            <span style={quickStatCopyStyle}><strong>{weightKg.toFixed(1).replace(".0", "")} kg</strong><small>Latest weight</small></span>
          </div>
          <div style={quickStatItemStyle}>
            <Droplets size={17} />
            <span style={quickStatCopyStyle}><strong>{waterMl.toLocaleString()} ml</strong><small>of {waterGoal.toLocaleString()} ml</small></span>
          </div>
        </div>}

        {visible.energy && <Card className="energy-card">
          <div className="energy-heading">
            <div><span className="eyebrow">Daily energy</span><h2>Your calorie budget</h2></div>
            <span className="on-track"><span />On track</span>
          </div>
          <div className="energy-body">
            <div className="energy-stat supplied"><span className="round-icon teal"><ArrowDown size={20} /></span><strong>2,655</strong><small>supplied</small></div>
            <Donut value={93} />
            <div className="energy-stat burned"><span className="round-icon amber"><Flame size={20} /></span><strong>249</strong><small>burned</small></div>
          </div>
          <div className="macro-grid">
            <div><span><i className="dot carbs" />carbs</span><strong>374<small>/428 g</small></strong><ProgressBar value={87} color="var(--carbs)" /></div>
            <div><span><i className="dot fat" />fat</span><strong>89<small>/77 g</small></strong><ProgressBar value={100} color="var(--fat)" /></div>
            <div><span><i className="dot protein" />protein</span><strong>92<small>/107 g</small></strong><ProgressBar value={86} color="var(--protein)" /></div>
          </div>
        </Card>}

        {visible.scores && <NutritionScores />}

        {visible.meals && <section className="meal-section">
          <SectionTitle title="Today's meals" />
          <Card style={{ overflow: "hidden" }}>
            {meals.map((meal, index) => (
              <div
                key={meal.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "76px minmax(0, 1fr) auto",
                  alignItems: "center",
                  gap: 14,
                  minHeight: 64,
                  padding: "11px 16px",
                  borderBottom: index < meals.length - 1 ? "1px solid var(--border)" : "0",
                }}
              >
                <time style={{ color: "var(--muted)", fontSize: 11, fontWeight: 800 }}>{meal.time}</time>
                <div className="meal-copy">
                  <strong>{meal.name}</strong>
                  <small>{meal.detail}</small>
                </div>
                <div className="meal-kcal"><strong>{meal.kcal}</strong><span>kcal</span></div>
              </div>
            ))}
          </Card>
        </section>}
      </div>

      <aside className="home-aside">
        {visible.streak && <Card className="streak-card">
          <div className="streak-icon"><Flame size={24} /></div>
          <div><strong>7 day streak</strong><span>You're building a healthy rhythm.</span></div>
          <span className="best">Best: 12</span>
        </Card>}

        {visible.activity && <section>
          <SectionTitle title="Activity" />
          <Card className="activity-list">
            {displayedActivities.map((item, index) => (
              <div className="activity-row" key={"id" in item ? item.id : `${item.label}-${index}`}>
                <span className={index ? "round-icon amber" : "round-icon green"}>{index ? <Footprints size={19} /> : <Activity size={19} />}</span>
                <div><strong>{item.label}</strong><small>{item.detail}</small></div>
                <span><Flame size={14} /> {item.kcal} kcal</span>
              </div>
            ))}
            <button className="secondary-button" onClick={onLogActivity}><Plus size={18} /> Log activity</button>
          </Card>
        </section>}

        {visible.habits && <section>
          <SectionTitle title="Daily habits" />
          <Card className="habits-card">
            <div className="habit-head"><span className="round-icon blue"><Droplets size={19} /></span><div><strong>Water</strong><span>{waterMl.toLocaleString()} of {waterGoal.toLocaleString()} ml</span></div><b>{waterPercent}%</b></div>
            <ProgressBar value={waterPercent} color="var(--blue)" />
            <button className="secondary-button" onClick={onAddWater}><Plus size={18} /> Add a glass</button>
          </Card>
        </section>}
      </aside>
      </div>

      {visible.targets && <AllTargets />}
    </div>
  );
}
