"use client";

import { useState } from "react";
import { Apple, ChevronDown, Target, Utensils } from "lucide-react";
import { Card, ProgressBar, SectionTitle } from "./ui";

export function NutritionScores() {
  return <section>
    <SectionTitle title="Nutrition scores" action="All targets" />
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




type TargetRow = { name: string; amount: string; target: string; unit: string; percent: number; level?: number };
type TargetGroup = { name: string; rows: TargetRow[] };

const targetGroups: TargetGroup[] = [
  { name: "General", rows: [
    { name: "Energy", amount: "2,655", target: "2,855", unit: "kcal", percent: 93 },
    { name: "Alcohol", amount: "0", target: "30", unit: "g", percent: 0 },
    { name: "Caffeine", amount: "94", target: "400", unit: "mg", percent: 24 },
    { name: "Oxalate", amount: "86", target: "250", unit: "mg", percent: 34 },
    { name: "Phytate", amount: "412", target: "—", unit: "mg", percent: 0 },
    { name: "Water", amount: "1,200", target: "1,900", unit: "ml", percent: 63 },
  ]},
  { name: "Carbohydrates", rows: [
    { name: "Carbs", amount: "374", target: "428", unit: "g", percent: 87 },
    { name: "Net Carbs", amount: "354", target: "398", unit: "g", percent: 89, level: 1 },
    { name: "Fiber", amount: "20", target: "30", unit: "g", percent: 68, level: 1 },
    { name: "Insoluble Fiber", amount: "12", target: "20", unit: "g", percent: 60, level: 2 },
    { name: "Soluble Fiber", amount: "8", target: "10", unit: "g", percent: 80, level: 2 },
    { name: "Starch", amount: "126", target: "—", unit: "g", percent: 0, level: 1 },
    { name: "Sugars", amount: "74", target: "90", unit: "g", percent: 82, level: 1 },
    { name: "Added Sugars", amount: "18", target: "36", unit: "g", percent: 50, level: 1 },
  ]},
  { name: "Lipids", rows: [
    { name: "Fat", amount: "89", target: "77", unit: "g", percent: 116 },
    { name: "Monounsaturated", amount: "31", target: "—", unit: "g", percent: 0, level: 1 },
    { name: "Polyunsaturated", amount: "12", target: "—", unit: "g", percent: 0, level: 1 },
    { name: "Omega-3", amount: "2.3", target: "1.6", unit: "g", percent: 144, level: 2 },
    { name: "ALA", amount: "1.4", target: "1.6", unit: "g", percent: 88, level: 3 },
    { name: "DHA", amount: "0.5", target: "0.25", unit: "g", percent: 200, level: 3 },
    { name: "EPA", amount: "0.4", target: "0.25", unit: "g", percent: 160, level: 3 },
    { name: "Omega-6", amount: "9.1", target: "17", unit: "g", percent: 54, level: 2 },
    { name: "AA", amount: "0.2", target: "—", unit: "g", percent: 0, level: 3 },
    { name: "LA", amount: "8.4", target: "17", unit: "g", percent: 49, level: 3 },
    { name: "Saturated", amount: "17.5", target: "24", unit: "g", percent: 73, level: 1 },
    { name: "Trans-Fats", amount: "0.3", target: "2", unit: "g", percent: 15, level: 1 },
    { name: "Cholesterol", amount: "218", target: "300", unit: "mg", percent: 73 },
  ]},
  { name: "Protein", rows: [
    { name: "Protein", amount: "92", target: "107", unit: "g", percent: 86 },
    { name: "Cystine", amount: "1.1", target: "—", unit: "g", percent: 0, level: 1 },
    { name: "Histidine", amount: "2.4", target: "1.2", unit: "g", percent: 200, level: 1 },
    { name: "Isoleucine", amount: "4.2", target: "1.7", unit: "g", percent: 200, level: 1 },
    { name: "Leucine", amount: "7.1", target: "3.3", unit: "g", percent: 200, level: 1 },
    { name: "Lysine", amount: "6.8", target: "3", unit: "g", percent: 200, level: 1 },
    { name: "Methionine", amount: "2.1", target: "1.3", unit: "g", percent: 162, level: 1 },
    { name: "Phenylalanine", amount: "3.8", target: "2.5", unit: "g", percent: 152, level: 1 },
    { name: "Threonine", amount: "3.6", target: "1.7", unit: "g", percent: 200, level: 1 },
    { name: "Tryptophan", amount: "1.1", target: "0.4", unit: "g", percent: 200, level: 1 },
    { name: "Tyrosine", amount: "3.1", target: "—", unit: "g", percent: 0, level: 1 },
    { name: "Valine", amount: "4.8", target: "2.2", unit: "g", percent: 200, level: 1 },
  ]},
  { name: "Vitamins", rows: [
    { name: "B1 (Thiamine)", amount: "0.9", target: "1.2", unit: "mg", percent: 75 },
    { name: "B2 (Riboflavin)", amount: "1.4", target: "1.3", unit: "mg", percent: 108 },
    { name: "B3 (Niacin)", amount: "14", target: "16", unit: "mg", percent: 88 },
    { name: "B5 (Pantothenic Acid)", amount: "3.7", target: "5", unit: "mg", percent: 74 },
    { name: "B6 (Pyridoxine)", amount: "1.5", target: "1.7", unit: "mg", percent: 88 },
    { name: "B12 (Cobalamin)", amount: "2.1", target: "2.4", unit: "µg", percent: 88 },
    { name: "Folate", amount: "256", target: "400", unit: "µg", percent: 64 },
    { name: "Vitamin A", amount: "520", target: "900", unit: "µg", percent: 58 },
    { name: "Vitamin C", amount: "83", target: "90", unit: "mg", percent: 92 },
    { name: "Vitamin D", amount: "420", target: "600", unit: "IU", percent: 70 },
    { name: "Vitamin E", amount: "9", target: "15", unit: "mg", percent: 60 },
    { name: "Vitamin K", amount: "96", target: "120", unit: "µg", percent: 80 },
  ]},
  { name: "Minerals", rows: [
    { name: "Calcium", amount: "760", target: "1,000", unit: "mg", percent: 76 },
    { name: "Copper", amount: "0.8", target: "0.9", unit: "mg", percent: 89 },
    { name: "Iron", amount: "7.6", target: "18", unit: "mg", percent: 42 },
    { name: "Magnesium", amount: "312", target: "420", unit: "mg", percent: 74 },
    { name: "Manganese", amount: "1.9", target: "2.3", unit: "mg", percent: 83 },
    { name: "Phosphorus", amount: "840", target: "700", unit: "mg", percent: 120 },
    { name: "Potassium", amount: "2,484", target: "3,500", unit: "mg", percent: 71 },
    { name: "Selenium", amount: "62", target: "55", unit: "µg", percent: 113 },
    { name: "Sodium", amount: "1,820", target: "2,300", unit: "mg", percent: 79 },
    { name: "Zinc", amount: "8.4", target: "11", unit: "mg", percent: 76 },
  ]},
];

export function AllTargets() {
  const [full, setFull] = useState(false);
  return <section className="all-targets-section">
    <div className="targets-heading"><div><span className="eyebrow">Complete nutrition</span><h2>All targets</h2><p>Explore energy, macros, vitamins, minerals, amino acids and fatty acids.</p></div><div className="segmented"><button className={!full ? "active" : ""} onClick={() => setFull(false)}>Summary</button><button className={full ? "active" : ""} onClick={() => setFull(true)}>Full table</button></div></div>
    <Card className="targets-card">
      <div className="target-table-head"><span>Nutrient</span><span>Consumed</span><span>Target</span><span>Progress</span></div>
      {targetGroups.map((group, index) => <details key={group.name} open={index === 0}>
        <summary><span className="icon-badge green">{group.name === "General" ? <Target size={17} /> : group.name === "Protein" ? <Utensils size={17} /> : <Apple size={17} />}</span><strong>{group.name}</strong><small>{group.rows.length} nutrients</small><ChevronDown size={18} /></summary>
        <div>{group.rows.filter((row) => full || !row.level).map((row) => <div className="target-row" key={row.name}><span style={{ "--level": row.level ?? 0 } as React.CSSProperties}>{row.name}</span><strong>{row.amount} <small>{row.unit}</small></strong><span>{row.target} <small>{row.unit}</small></span><span><ProgressBar value={row.percent} color={row.percent < 60 ? "var(--fat)" : row.percent > 110 ? "var(--carbs)" : "var(--accent)"} /><b>{row.target === "—" ? "—" : `${row.percent}%`}</b></span></div>)}</div>
      </details>)}
    </Card>
  </section>;
}

function ScoreRing({ value, size = "default" }: { value: number; size?: "small" | "default" | "large" }) {
  return <span className={`score-ring ${size}`} style={{ "--score": `${value * 3.6}deg` } as React.CSSProperties} role="img" aria-label={`${value}% of target`}><b>{value}%</b></span>;
}
