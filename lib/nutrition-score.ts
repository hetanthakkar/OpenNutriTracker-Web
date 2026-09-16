import { nutrientDefinitions } from "./nutrition-targets";

export type NutritionScorePart = {
  value: number | null;
  label: string;
  detail: string;
  measuredTargets: number;
  targetsOnTrack: number;
};

export type NutritionScore = {
  overall: NutritionScorePart;
  macros: NutritionScorePart;
  micronutrients: NutritionScorePart;
  foodQuality: NutritionScorePart;
};

type ScoreInput = {
  entryCount: number;
  totals: Record<string, number>;
  macroTargets: {
    carbohydrateG: number | null;
    totalFatG: number | null;
    proteinG: number | null;
  };
  nutrientTargets: Record<string, number>;
};

type ScoredTarget = { score: number; onTrack: boolean };

const micronutrientGroups = new Set(["Vitamins & related", "Minerals"]);
const foodQualityKeys = new Set([
  "dietary_fiber_g",
  "source_added_sugars_g",
  "saturated_fat_g",
  "sodium_mg",
]);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function scoreTarget(actual: number, target: number, kind: "minimum" | "maximum" | "target" | "none"): ScoredTarget {
  if (kind === "maximum") {
    const score = actual <= target ? 100 : clamp(100 - ((actual - target) / target) * 100, 0, 100);
    return { score, onTrack: actual <= target };
  }
  if (kind === "target") {
    const score = clamp(100 - (Math.abs(actual - target) / target) * 100, 0, 100);
    return { score, onTrack: actual >= target * 0.8 && actual <= target * 1.2 };
  }
  const score = clamp((actual / target) * 100, 0, 100);
  return { score, onTrack: actual >= target * 0.8 };
}

function summarize(scored: ScoredTarget[], label: string, unavailableDetail: string): NutritionScorePart {
  if (scored.length === 0) {
    return { value: null, label: "Not enough data", detail: unavailableDetail, measuredTargets: 0, targetsOnTrack: 0 };
  }
  const value = Math.round(scored.reduce((total, item) => total + item.score, 0) / scored.length);
  const targetsOnTrack = scored.filter((item) => item.onTrack).length;
  return {
    value,
    label,
    detail: `${targetsOnTrack} of ${scored.length} measured target${scored.length === 1 ? "" : "s"} on track`,
    measuredTargets: scored.length,
    targetsOnTrack,
  };
}

function overallLabel(value: number | null) {
  if (value === null) return "Not enough data";
  if (value >= 85) return "Excellent balance";
  if (value >= 70) return "Strong day";
  if (value >= 50) return "Building balance";
  return "Needs attention";
}

/**
 * Produce a transparent daily nutrition score without treating absent source
 * nutrients as zero. A nutrient is scored only when the logged foods contain a
 * positive measured amount and a target exists.
 */
export function calculateNutritionScore(input: ScoreInput): NutritionScore {
  const macros = input.entryCount === 0 ? [] : [
    input.macroTargets.carbohydrateG == null ? null : scoreTarget(input.totals.carbohydrate_g ?? 0, input.macroTargets.carbohydrateG, "target"),
    input.macroTargets.totalFatG == null ? null : scoreTarget(input.totals.total_fat_g ?? 0, input.macroTargets.totalFatG, "target"),
    input.macroTargets.proteinG == null ? null : scoreTarget(input.totals.protein_g ?? 0, input.macroTargets.proteinG, "target"),
  ].filter((item): item is ScoredTarget => item !== null);

  const scoreDefinitions = (predicate: (definition: typeof nutrientDefinitions[number]) => boolean) => nutrientDefinitions.flatMap((definition) => {
    if (!predicate(definition) || definition.targetKind === "none") return [];
    const actual = input.totals[definition.code];
    const target = input.nutrientTargets[definition.code] ?? definition.defaultTarget;
    // Many imported foods omit micronutrients as zero. Positive values are the
    // only ones that can safely be treated as measured in the current catalog.
    if (!Number.isFinite(actual) || actual <= 0 || target == null || !Number.isFinite(target) || target <= 0) return [];
    return [scoreTarget(actual, target, definition.targetKind)];
  });

  const micronutrients = scoreDefinitions((definition) => micronutrientGroups.has(definition.groupName) && !foodQualityKeys.has(definition.code));
  const quality = scoreDefinitions((definition) => foodQualityKeys.has(definition.code));
  const macroPart = summarize(macros, "Macro balance", "Complete your calorie plan and log food to score macros.");
  const micronutrientPart = summarize(micronutrients, "Micronutrients", "No measured vitamins or minerals are available yet.");
  const qualityPart = summarize(quality, "Food quality", "No measured fiber or limit nutrients are available yet.");
  const availableParts = [
    macroPart.value === null ? null : { value: macroPart.value, weight: 0.4 },
    micronutrientPart.value === null ? null : { value: micronutrientPart.value, weight: 0.4 },
    qualityPart.value === null ? null : { value: qualityPart.value, weight: 0.2 },
  ].filter((part): part is { value: number; weight: number } => part !== null);
  const weightTotal = availableParts.reduce((total, part) => total + part.weight, 0);
  const overallValue = weightTotal === 0 ? null : Math.round(availableParts.reduce((total, part) => total + part.value * part.weight, 0) / weightTotal);
  const measuredTargets = macroPart.measuredTargets + micronutrientPart.measuredTargets + qualityPart.measuredTargets;
  const targetsOnTrack = macroPart.targetsOnTrack + micronutrientPart.targetsOnTrack + qualityPart.targetsOnTrack;

  return {
    overall: {
      value: overallValue,
      label: overallLabel(overallValue),
      detail: input.entryCount === 0
        ? "Add food to calculate today’s nutrition score."
        : measuredTargets === 0
          ? "The logged foods do not contain enough measured nutrient data."
          : `${targetsOnTrack} of ${measuredTargets} measured target${measuredTargets === 1 ? "" : "s"} on track`,
      measuredTargets,
      targetsOnTrack,
    },
    macros: macroPart,
    micronutrients: micronutrientPart,
    foodQuality: qualityPart,
  };
}
