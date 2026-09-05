"use client";

import { useState } from "react";
import { Apple, ChevronDown, Target, Utensils } from "lucide-react";
import { targetGroups, type TargetRow } from "@/lib/nutrition-targets";
import { Card, ProgressBar, SectionTitle } from "./ui";

export function NutritionScores() {
  return <section>
    <SectionTitle title="Nutrition scores" />
    <Card className="nutrition-score-card">
      <div className="score-overall"><ScoreRing value={78} size="large" /><div><span className="eyebrow">Overall balance</span><strong>Strong day</strong><p>Your meals cover most daily targets. Iron and fiber need the most attention.</p></div></div>
      <div className="score-breakdown">
        <div><ScoreRing value={84} /><span><strong>Macro balance</strong><small>Carbs, fat and protein</small></span></div>
        <div><ScoreRing value={72} /><span><strong>Micronutrients</strong><small>Vitamins and minerals</small></span></div>
        <div><ScoreRing value={81} /><span><strong>Food quality</strong><small>Fiber and whole foods</small></span></div>
      </div>
    </Card>
  </section>;
}

const summaryNames = ["Energy", "Protein", "Fiber", "Iron", "Potassium", "Water"];

function findTarget(name: string): TargetRow | undefined {
  for (const group of targetGroups) {
    const row = group.rows.find((item) => item.name === name);
    if (row) return row;
  }
}

function targetTone(row: TargetRow) {
  if (row.target === "—") return { label: "No target", color: "var(--muted)" };
  if (row.percent < 60) return { label: "Low", color: "var(--fat)" };
  if (row.percent < 80) return { label: "Needs attention", color: "var(--carbs)" };
  if (row.percent > 110) return { label: "Above target", color: "var(--carbs)" };
  return { label: "On track", color: "var(--accent)" };
}

export function AllTargets() {
  const [view, setView] = useState<"summary" | "full">("summary");
  const summaryRows = summaryNames.map(findTarget).filter((row): row is TargetRow => Boolean(row));
  const attentionRows = summaryRows.filter((row) => row.target !== "—" && row.percent < 80);
  const lowest = [...summaryRows].filter((row) => row.target !== "—").sort((a, b) => a.percent - b.percent)[0];

  return <section className="all-targets-section" id="nutrition-targets">
    <div className="targets-heading">
      <div>
        <span className="eyebrow">Complete nutrition</span>
        <h2>Nutrition targets</h2>
        <p>{view === "summary" ? "A quick view of the targets that matter most today." : "Every tracked nutrient, grouped by category."}</p>
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
              {lowest ? `${lowest.name} is furthest from its goal at ${lowest.percent}%.` : "Your key targets are on track."}
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
                <strong style={{ display: "block", fontSize: 22, lineHeight: 1.1 }}>{row.amount} <small style={{ color: "var(--muted)", fontSize: 11 }}>{row.unit}</small></strong>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>of {row.target} {row.unit}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: 10 }}>
                <ProgressBar value={row.percent} color={tone.color} />
                <b style={{ color: tone.color, fontSize: 11 }}>{row.target === "—" ? "—" : `${row.percent}%`}</b>
              </div>
            </article>;
          })}
        </div>
      </div>
    ) : (
      <Card className="targets-card">
        <div className="target-table-head"><span>Nutrient</span><span>Consumed</span><span>Target</span><span>Progress</span></div>
        {targetGroups.map((group, index) => <details key={group.name} open={index === 0}>
          <summary><span className="icon-badge green">{group.name === "General" ? <Target size={17} /> : group.name === "Protein" ? <Utensils size={17} /> : <Apple size={17} />}</span><strong>{group.name}</strong><small>{group.rows.length} nutrients</small><ChevronDown size={18} /></summary>
          <div>{group.rows.map((row) => <div className="target-row" key={row.name}><span style={{ "--level": row.level ?? 0 } as React.CSSProperties}>{row.name}</span><strong>{row.amount} <small>{row.unit}</small></strong><span>{row.target} <small>{row.unit}</small></span><span><ProgressBar value={row.percent} color={row.percent < 60 ? "var(--fat)" : row.percent > 110 ? "var(--carbs)" : "var(--accent)"} /><b>{row.target === "—" ? "—" : `${row.percent}%`}</b></span></div>)}</div>
        </details>)}
      </Card>
    )}
  </section>;
}

function ScoreRing({ value, size = "default" }: { value: number; size?: "small" | "default" | "large" }) {
  return <span className={`score-ring ${size}`} style={{ "--score": `${value * 3.6}deg` } as React.CSSProperties} role="img" aria-label={`${value}% of target`}><b>{value}%</b></span>;
}
