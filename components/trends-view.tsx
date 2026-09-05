"use client";

import { useState } from "react";
import { Activity, ArrowDownRight, Droplets, Flame, Scale, TrendingDown } from "lucide-react";
import { trendValues } from "@/lib/mock-data";
import { LineChart } from "./charts";
import { Card, ProgressBar } from "./ui";

const periods = ["7 days", "30 days", "90 days", "All"];

export function TrendsView() {
  const [period, setPeriod] = useState("7 days");
  const labels = ["Aug 30", "31", "Sep 1", "2", "3", "4", "Today"];
  return (
    <div className="trends-page">
      <div className="trends-head">
        <div><span className="eyebrow">Your progress</span><h2>Small steps, visible progress</h2><p>Daily averages and habits based on your logged entries.</p></div>
        <div className="segmented">{periods.map((item) => <button key={item} className={period === item ? "active" : ""} onClick={() => setPeriod(item)}>{item}</button>)}</div>
      </div>
      <div className="trend-kpis">
        <Card><span className="round-icon green"><Flame size={20} /></span><div><span>Current streak</span><strong>7 <small>days</small></strong></div><em>Best 12</em></Card>
        <Card><span className="round-icon teal"><Scale size={20} /></span><div><span>Weight change</span><strong>−1.8 <small>kg</small></strong></div><em className="positive"><ArrowDownRight size={15} /> 2.0%</em></Card>
        <Card><span className="round-icon amber"><Activity size={20} /></span><div><span>Active time</span><strong>214 <small>min</small></strong></div><em>+18 min</em></Card>
      </div>
      <div className="trend-grid">
        <Card className="chart-card calories-chart">
          <div className="chart-title"><div><span>Calories</span><strong>2,492 <small>kcal daily average</small></strong></div><span className="chart-pill"><TrendingDown size={15} /> 4% vs last week</span></div>
          <LineChart values={trendValues.calories} labels={labels} />
        </Card>
        <Card className="chart-card">
          <div className="chart-title"><div><span>Weight</span><strong>87.3 <small>kg today</small></strong></div><span className="chart-pill"><TrendingDown size={15} /> On pace</span></div>
          <LineChart values={trendValues.weight} color="var(--protein)" labels={labels} />
        </Card>
        <Card className="average-card">
          <div className="chart-title"><div><span>Daily average</span><strong>Nutrition</strong></div></div>
          <div className="average-list">
            <div><p><span>Carbs</span><strong>344 / 402 g</strong></p><ProgressBar value={86} color="var(--carbs)" /></div>
            <div><p><span>Fat</span><strong>73 / 74 g</strong></p><ProgressBar value={98} color="var(--fat)" /></div>
            <div><p><span>Protein</span><strong>84 / 100 g</strong></p><ProgressBar value={84} color="var(--protein)" /></div>
          </div>
        </Card>
        <Card className="chart-card water-chart">
          <div className="chart-title"><div><span>Hydration</span><strong>1,929 <small>ml daily average</small></strong></div><span className="round-icon blue"><Droplets size={19} /></span></div>
          <LineChart values={trendValues.water} color="var(--blue)" labels={labels} />
        </Card>
      </div>
    </div>
  );
}
