"use client";

import { useState } from "react";
import { Activity, ArrowDownRight, Droplets, Flame, Scale, TrendingDown } from "lucide-react";
import { LineChart } from "./charts";
import { AppleHealthSection } from "./apple-health-section";
import { Card, ProgressBar } from "./ui";

const trendData = {
  "7 days": {
    labels: ["Aug 30", "31", "Sep 1", "2", "3", "4", "Today"],
    calories: [2520, 2590, 2540, 2575, 2350, 2210, 2655],
    weight: [89.1, 88.8, 88.6, 88.4, 88.2, 87.7, 87.3],
    water: [1650, 1900, 2100, 1800, 2250, 1700, 2200],
  },
  "30 days": {
    labels: ["Aug 7", "12", "17", "22", "27", "Sep 1", "Today"],
    calories: [2680, 2610, 2570, 2490, 2440, 2380, 2492],
    weight: [91.0, 90.4, 89.8, 89.2, 88.6, 88.0, 87.3],
    water: [1500, 1720, 1850, 1930, 2010, 1880, 1929],
  },
  "90 days": {
    labels: ["Jun", "Jun 20", "Jul", "Jul 20", "Aug", "Aug 20", "Today"],
    calories: [2810, 2740, 2700, 2630, 2580, 2510, 2460],
    weight: [94.2, 93.0, 92.1, 90.8, 89.6, 88.5, 87.3],
    water: [1380, 1490, 1620, 1710, 1840, 1900, 1970],
  },
  All: {
    labels: ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Today"],
    calories: [2940, 2880, 2810, 2740, 2660, 2540, 2460],
    weight: [99.0, 97.4, 95.8, 94.2, 92.1, 89.6, 87.3],
    water: [1210, 1320, 1420, 1540, 1690, 1850, 1970],
  },
} as const;

type Period = keyof typeof trendData;
const periods = Object.keys(trendData) as Period[];

export function TrendsView() {
  const [period, setPeriod] = useState<Period>("7 days");
  const data = trendData[period];

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
          <div className="chart-title"><div><span>Calories</span><strong>{data.calories[data.calories.length - 1].toLocaleString()} <small>kcal {period === "7 days" ? "today" : "latest average"}</small></strong></div><span className="chart-pill"><TrendingDown size={15} /> {period}</span></div>
          <LineChart values={[...data.calories]} labels={[...data.labels]} />
        </Card>
        <Card className="chart-card">
          <div className="chart-title"><div><span>Weight</span><strong>{data.weight[data.weight.length - 1]} <small>kg latest</small></strong></div><span className="chart-pill"><TrendingDown size={15} /> On pace</span></div>
          <LineChart values={[...data.weight]} color="var(--protein)" labels={[...data.labels]} />
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
          <div className="chart-title"><div><span>Hydration</span><strong>{data.water[data.water.length - 1].toLocaleString()} <small>ml latest average</small></strong></div><span className="round-icon blue"><Droplets size={19} /></span></div>
          <LineChart values={[...data.water]} color="var(--blue)" labels={[...data.labels]} />
        </Card>
      </div>
      <AppleHealthSection period={period} />
    </div>
  );
}
