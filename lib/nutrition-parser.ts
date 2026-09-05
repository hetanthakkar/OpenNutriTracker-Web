export type OcrPoint = [number, number];

export interface OcrItem {
  text: string;
  score: number;
  poly: OcrPoint[];
}

export interface NutritionValue {
  amount: number | null;
  unit: string | null;
  dailyValuePercent: number | null;
  sourceText: string;
}

export interface ParsedNutritionLabel {
  servingSize: string | null;
  servingsPerContainer: number | null;
  calories: number | null;
  nutrients: Record<string, NutritionValue>;
  ocrConfidence: number;
  parsedFieldCount: number;
  rows: string[];
}

interface Row {
  text: string;
  y: number;
  height: number;
}

const nutrientMatchers: Array<[string, RegExp]> = [
  ["saturatedFat", /\bsaturated\s+fat\b/i],
  ["transFat", /\btrans\s+fat\b/i],
  ["totalFat", /\btotal\s+fat\b/i],
  ["cholesterol", /\bcholesterol\b/i],
  ["sodium", /\bsodium\b/i],
  ["dietaryFiber", /\bdietary\s+fiber\b/i],
  ["addedSugars", /\badded\s+sugars?\b/i],
  ["totalSugars", /\btotal\s+sugars?\b/i],
  ["totalCarbohydrate", /\btotal\s+carbohydrate\b|\btotal\s+carb\b/i],
  ["protein", /\bprotein\b/i],
  ["vitaminD", /\bvitamin\s+d\b/i],
  ["calcium", /\bcalcium\b/i],
  ["iron", /\biron\b/i],
  ["potassium", /\bpotassium\b/i],
];

function boxStats(item: OcrItem) {
  const xs = item.poly.map(([x]) => x);
  const ys = item.poly.map(([, y]) => y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: Math.min(...xs),
    y: (minY + maxY) / 2,
    height: Math.max(1, maxY - minY),
  };
}

export function groupOcrItemsIntoRows(items: OcrItem[]): string[] {
  if (!items.length) return [];

  const sorted = [...items]
    .map((item) => ({ item, ...boxStats(item) }))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const rows: Array<Row & { parts: Array<{ x: number; text: string }> }> = [];

  for (const entry of sorted) {
    const tolerance = Math.max(8, entry.height * 0.65);
    let row = rows.find((candidate) => Math.abs(candidate.y - entry.y) <= Math.max(tolerance, candidate.height * 0.65));

    if (!row) {
      row = { text: "", y: entry.y, height: entry.height, parts: [] };
      rows.push(row);
    }

    row.parts.push({ x: entry.x, text: entry.item.text.trim() });
    const count = row.parts.length;
    row.y = ((row.y * (count - 1)) + entry.y) / count;
    row.height = Math.max(row.height, entry.height);
  }

  return rows
    .sort((a, b) => a.y - b.y)
    .map((row) => row.parts.sort((a, b) => a.x - b.x).map((part) => part.text).filter(Boolean).join(" "))
    .filter(Boolean);
}

function parseAmount(text: string): { amount: number | null; unit: string | null } {
  const cleaned = text.replace(/\d+(?:\.\d+)?\s*%/g, " ");
  const match = cleaned.match(/(-?\d+(?:\.\d+)?)\s*(mcg|µg|ug|mg|g|kcal|cal)\b/i);
  if (!match) return { amount: null, unit: null };

  const unit = match[2].toLowerCase().replace("µg", "mcg").replace("ug", "mcg");
  return { amount: Number(match[1]), unit };
}

function parseDailyValue(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : null;
}

function firstNumber(text: string): number | null {
  const match = text.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseServingSize(row: string): string | null {
  const match = row.match(/serving\s+size\s*:?[\s-]*(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function parseNutritionLabel(items: OcrItem[]): ParsedNutritionLabel {
  const rows = groupOcrItemsIntoRows(items);
  const nutrients: Record<string, NutritionValue> = {};
  let servingSize: string | null = null;
  let servingsPerContainer: number | null = null;
  let calories: number | null = null;

  for (const row of rows) {
    if (!servingSize && /serving\s+size/i.test(row)) {
      servingSize = parseServingSize(row);
    }

    if (servingsPerContainer === null && /servings?\s+per\s+container/i.test(row)) {
      servingsPerContainer = firstNumber(row);
    }

    if (calories === null && /\bcalories\b/i.test(row)) {
      const afterLabel = row.replace(/^.*?calories\s*:?[\s-]*/i, "");
      calories = firstNumber(afterLabel);
    }

    for (const [key, matcher] of nutrientMatchers) {
      if (nutrients[key] || !matcher.test(row)) continue;
      const { amount, unit } = parseAmount(row);
      nutrients[key] = {
        amount,
        unit,
        dailyValuePercent: parseDailyValue(row),
        sourceText: row,
      };
    }
  }

  const scores = items.map((item) => item.score).filter((score) => Number.isFinite(score));
  const ocrConfidence = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
  const parsedFieldCount = Object.keys(nutrients).length + Number(servingSize !== null) + Number(servingsPerContainer !== null) + Number(calories !== null);

  return {
    servingSize,
    servingsPerContainer,
    calories,
    nutrients,
    ocrConfidence,
    parsedFieldCount,
    rows,
  };
}
