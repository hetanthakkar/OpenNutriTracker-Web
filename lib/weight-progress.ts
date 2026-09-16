import { robustWeightTrend } from "./expenditure.ts";

export type WeightProgress = {
  history: Array<{ date: string; weightKg: number }>;
  weeklyChangeKg: number | null;
  weeklyGoalKg: number | null;
  status: "ready" | "building" | "stale";
};

export function weightProgress(weights: Array<{ day: string; weight_kg: string }>, asOf: string, weeklyGoalKg: number | null): WeightProgress {
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const dayMs = 86_400_000;
  const valid = weights.filter((row) => row.day <= asOf && Date.parse(`${row.day}T00:00:00Z`) >= end - 119 * dayMs && Number.isFinite(Number(row.weight_kg)) && Number(row.weight_kg) > 0);
  const byDay = new Map(valid.map((row) => [row.day, Number(row.weight_kg)]));
  const observed = [...byDay].sort(([a], [b]) => a.localeCompare(b));
  const history = observed.filter(([date]) => Date.parse(`${date}T00:00:00Z`) >= end - 13 * dayMs).map(([date, weightKg]) => ({ date, weightKg }));
  const latest = observed.at(-1);
  const stale = !!latest && end - Date.parse(`${latest[0]}T00:00:00Z`) > 3 * dayMs;
  const enough = history.length >= 3 && !!observed[0] && Date.parse(`${observed[0][0]}T00:00:00Z`) <= end - 7 * dayMs;
  const status = stale ? "stale" : enough ? "ready" : "building";
  let weeklyChangeKg: number | null = null;
  if (status === "ready" && latest) {
    // Use the same daily window, fallback, and smoother as adaptive expenditure.
    const days = Array.from({ length: 120 }, (_, i) => {
      const date = new Date(end - (119 - i) * dayMs).toISOString().slice(0, 10);
      return { date, weightKg: byDay.get(date) ?? null };
    });
    const trend = robustWeightTrend(days, latest[1]);
    weeklyChangeKg = trend[119] - trend[112];
  }
  return { history, weeklyChangeKg, weeklyGoalKg, status };
}
