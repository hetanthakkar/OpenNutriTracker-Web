"use client";

import { useEffect, useMemo, useState } from "react";
import { Apple, ChevronDown, Target, Utensils } from "lucide-react";
import { buildTargetGroups, formatNutrientAmount, type NutrientTotals, type TargetRow } from "@/lib/nutrition-targets";
import { Card, ProgressBar, SectionTitle } from "./ui";
import type { NutritionScore } from "@/lib/nutrition-score";
import { showWaterTracking } from "@/lib/ui-features";

export function NutritionScores({ score }: { score: NutritionScore | null }) {
  const parts = [score?.macros, score?.micronutrients, score?.foodQuality];
  return <section>
    <SectionTitle title="Nutrition scores" />
    <Card className="nutrition-score-card">
      <div className="score-overall"><ScoreRing value={score?.overall.value ?? null} size="large" /><div><span className="eyebrow">Overall balance</span><strong>{score?.overall.label ?? "Calculating…"}</strong><p>{score?.overall.detail ?? "Loading today’s logged nutrients and targets."}</p></div></div>
      <div className="score-breakdown">
        {parts.map((part, index) => <div key={["macros", "micronutrients", "food-quality"][index]}><ScoreRing value={part?.value ?? null} /><span><strong>{part?.label ?? ["Macro balance", "Micronutrients", "Food quality"][index]}</strong><small>{part?.detail ?? "Waiting for today’s data"}</small></span></div>)}
      </div>
    </Card>
  </section>;
}

const summaryNames = ["Energy", "Protein", "Dietary fiber", "Iron", "Potassium", ...(showWaterTracking ? ["Food water"] : [])];

function findTarget(name: string, targetGroups: ReturnType<typeof buildTargetGroups>): TargetRow | undefined {
  for (const group of targetGroups) {
    const row = group.rows.find((item) => item.name === name);
    if (row) return row;
  }
}

function targetTone(row: TargetRow) {
  if (row.target === null) return { label: "No target", color: "var(--muted)" };
  if (row.percent < 60) return { label: "Low", color: "var(--fat)" };
  if (row.percent < 80) return { label: "Needs attention", color: "var(--carbs)" };
  if (row.percent > 110) return { label: "Above target", color: "var(--carbs)" };
  return { label: "On track", color: "var(--accent)" };
}

export function AllTargets({
  refreshVersion,
  totals,
  entryCount,
  plan,
}: {
  refreshVersion: number;
  totals: NutrientTotals;
  entryCount: number;
  plan: { calorieGoalKcal: number | null; carbsTargetG: number | null; fatTargetG: number | null; proteinTargetG: number | null } | null;
}) {
  const [view, setView] = useState<"summary" | "full">("summary");
  const [goalOverrides, setGoalOverrides] = useState<Record<string, number>>({});
  const [visibleNutrients, setVisibleNutrients] = useState<string[] | null>(null);
  const [visibleRefresh, setVisibleRefresh] = useState(0);
  const [loadError, setLoadError] = useState("");
  const effectiveGoals = useMemo(() => {
    const nextGoals = { ...goalOverrides };
    if (plan?.calorieGoalKcal != null) nextGoals.energy_kcal = plan.calorieGoalKcal;
    else delete nextGoals.energy_kcal;
    if (plan?.carbsTargetG != null) nextGoals.carbohydrate_g = plan.carbsTargetG;
    else delete nextGoals.carbohydrate_g;
    if (plan?.fatTargetG != null) nextGoals.total_fat_g = plan.fatTargetG;
    else delete nextGoals.total_fat_g;
    if (plan?.proteinTargetG != null) nextGoals.protein_g = plan.proteinTargetG;
    else delete nextGoals.protein_g;
    return nextGoals;
  }, [goalOverrides, plan]);
  const targetGroups = useMemo(() => buildTargetGroups(totals, effectiveGoals), [effectiveGoals, totals]);
  const visibleTargetGroups = useMemo(() => {
    if (visibleNutrients === null) return targetGroups.map((group) => ({ ...group, rows: group.rows.filter((row) => showWaterTracking || row.key !== "water_g") })).filter((group) => group.rows.length > 0);
    const required = new Set(["energy_kcal", "carbohydrate_g", "total_fat_g", "protein_g"]);
    const selected = new Set(visibleNutrients);
    return targetGroups.map((group) => ({ ...group, rows: group.rows.filter((row) => (required.has(row.key) || selected.has(row.key)) && (showWaterTracking || row.key !== "water_g")) })).filter((group) => group.rows.length > 0);
  }, [targetGroups, visibleNutrients]);
  const summaryRows = summaryNames.map((name) => findTarget(name, targetGroups)).filter((row): row is TargetRow => Boolean(row));
  const attentionRows = summaryRows.filter((row) => row.target !== null && row.percent < 80);
  const lowest = [...summaryRows].filter((row) => row.target !== null).sort((a, b) => a.percent - b.percent)[0];

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/me/nutrient-goals");
        const data = await response.json() as { goals?: Record<string, number>; message?: string };
        if (!response.ok) throw new Error(data.message ?? "Could not load nutrient goals.");
        if (cancelled) return;
        setGoalOverrides(data.goals ?? {});
        setLoadError("");
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load nutrition totals.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [refreshVersion]);

  useEffect(() => {
    const refresh = () => setVisibleRefresh((current) => current + 1);
    window.addEventListener("ont-visible-nutrients", refresh);
    return () => window.removeEventListener("ont-visible-nutrients", refresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/me/visible-nutrients").then(async (response) => {
      const data = await response.json() as { nutrients?: string[]; message?: string };
      if (!response.ok) throw new Error(data.message ?? "Could not load visible nutrients.");
      if (!cancelled) setVisibleNutrients(data.nutrients ?? []);
    }).catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load visible nutrients.");
    });
    return () => { cancelled = true; };
  }, [refreshVersion, visibleRefresh]);

  return <section className="all-targets-section" id="nutrition-targets">
    <div className="targets-heading">
      <div>
        <span className="eyebrow">Complete nutrition</span>
        <h2>Nutrition targets</h2>
        <p>{view === "summary" ? "A live view of the targets that matter most today." : "Every nutrient available from today’s logged foods, grouped by category."}</p>
      </div>
      <div className="segmented" role="group" aria-label="Nutrition target view">
        <button className={view === "summary" ? "active" : ""} onClick={() => setView("summary")}>Summary</button>
        <button className={view === "full" ? "active" : ""} onClick={() => setView("full")}>Full table</button>
      </div>
    </div>

    {view === "summary" ? (
      <div style={{ display: "grid", gap: 14 }}>
        <div className="card" style={{ padding: "18px 20px", borderRadius: 22, boxShadow: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 3 }}>
            <strong style={{ fontSize: 16 }}>{attentionRows.length} key targets need attention</strong>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              {entryCount === 0 ? "Add a food to start calculating your nutrition." : lowest ? `${lowest.name} is furthest from its goal at ${lowest.percent}%.` : "Your key targets are on track."}
            </span>
          </div>
          <span style={{ padding: "7px 11px", borderRadius: 999, background: "color-mix(in srgb, var(--carbs), transparent 86%)", color: "var(--carbs)", fontSize: 11, fontWeight: 850 }}>
            Today
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))", gap: 12 }}>
          {summaryRows.map((row) => {
            const tone = targetTone(row);
            return <article className="card" key={row.name} style={{ padding: 18, borderRadius: 20, boxShadow: "none", display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <strong style={{ fontSize: 13 }}>{row.name}</strong>
                <span style={{ color: tone.color, fontSize: 10, fontWeight: 850 }}>{tone.label}</span>
              </div>
              <div>
                <strong style={{ display: "block", fontSize: 22, lineHeight: 1.1 }}>{formatNutrientAmount(row.amount)} <small style={{ color: "var(--muted)", fontSize: 11 }}>{row.unit}</small></strong>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>{row.target === null ? "No daily target" : `of ${formatNutrientAmount(row.target)} ${row.unit}`}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: 10 }}>
                <ProgressBar value={row.percent} color={tone.color} />
                <b style={{ color: tone.color, fontSize: 11 }}>{row.target === null ? "—" : `${row.percent}%`}</b>
              </div>
            </article>;
          })}
        </div>
      </div>
    ) : (
      <Card className="targets-card">
        <div className="target-table-head"><span>Nutrient</span><span>Consumed</span><span>Target</span><span>Progress</span></div>
        {visibleTargetGroups.map((group, index) => <details key={group.name} open={index === 0}>
          <summary><span className="icon-badge green">{group.name === "General" ? <Target size={17} /> : group.name === "Protein" ? <Utensils size={17} /> : <Apple size={17} />}</span><strong>{group.name}</strong><small>{group.rows.length} nutrients</small><ChevronDown size={18} /></summary>
          <div>{group.rows.map((row) => <div className="target-row" key={row.key}><span style={{ "--level": row.level ?? 0 } as React.CSSProperties}>{row.name}</span><strong>{formatNutrientAmount(row.amount)} <small>{row.unit}</small></strong><span>{row.target === null ? "—" : formatNutrientAmount(row.target)} <small>{row.target === null ? "" : row.unit}</small></span><span><ProgressBar value={row.percent} color={row.target === null ? "var(--muted)" : row.percent < 60 ? "var(--fat)" : row.percent > 110 ? "var(--carbs)" : "var(--accent)"} /><b>{row.target === null ? "—" : `${row.percent}%`}</b></span></div>)}</div>
        </details>)}
      </Card>
    )}
    {loadError && <p className="food-picker-error" role="alert">{loadError}</p>}
  </section>;
}

function ScoreRing({ value, size = "default" }: { value: number | null; size?: "small" | "default" | "large" }) {
  return <span className={`score-ring ${size}`} style={{ "--score": `${(value ?? 0) * 3.6}deg` } as React.CSSProperties} role="img" aria-label={value === null ? "Nutrition score unavailable" : `${value}% nutrition score`}><b>{value === null ? "—" : `${value}%`}</b></span>;
}
