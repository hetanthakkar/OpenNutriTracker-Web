export type NutrientTotals = Record<string, number>;

export type TargetRow = {
  key: string;
  name: string;
  amount: number;
  target: number | null;
  unit: string;
  percent: number;
  level?: number;
};

export type TargetGroup = { name: string; rows: TargetRow[] };

type NutrientDefinition = Omit<TargetRow, "amount" | "percent">;

// These are every nutrition key presently imported in typesense_foods.nutrients.
// Keys without a daily goal are still shown, but intentionally have no progress bar target.
const definitions: Array<{ name: string; rows: NutrientDefinition[] }> = [
  { name: "General", rows: [
    { key: "energy_kcal", name: "Energy", target: null, unit: "cal" },
    { key: "alcohol_g", name: "Alcohol", target: 30, unit: "g" },
    { key: "caffeine_mg", name: "Caffeine", target: 400, unit: "mg" },
    { key: "water_g", name: "Food water", target: null, unit: "g" },
  ] },
  { name: "Carbohydrates", rows: [
    { key: "carbohydrate_g", name: "Carbohydrates", target: 428, unit: "g" },
    { key: "net_carbs_g", name: "Net carbs", target: 398, unit: "g", level: 1 },
    { key: "dietary_fiber_g", name: "Dietary fiber", target: 30, unit: "g", level: 1 },
    { key: "soluble_fiber_g", name: "Soluble fiber", target: 10, unit: "g", level: 2 },
    { key: "total_sugars_g", name: "Total sugars", target: 90, unit: "g", level: 1 },
    { key: "source_added_sugars_g", name: "Added sugars", target: 36, unit: "g", level: 2 },
    { key: "starch_g", name: "Starch", target: null, unit: "g", level: 1 },
    { key: "fructose_g", name: "Fructose", target: null, unit: "g", level: 2 },
    { key: "glucose_g", name: "Glucose", target: null, unit: "g", level: 2 },
    { key: "lactose_g", name: "Lactose", target: null, unit: "g", level: 2 },
    { key: "maltose_g", name: "Maltose", target: null, unit: "g", level: 2 },
    { key: "sucrose_g", name: "Sucrose", target: null, unit: "g", level: 2 },
    { key: "sorbitol_g", name: "Sorbitol", target: null, unit: "g", level: 2 },
  ] },
  { name: "Lipids", rows: [
    { key: "total_fat_g", name: "Total fat", target: 77, unit: "g" },
    { key: "monounsaturated_fat_g", name: "Monounsaturated fat", target: null, unit: "g", level: 1 },
    { key: "polyunsaturated_fat_g", name: "Polyunsaturated fat", target: null, unit: "g", level: 1 },
    { key: "total_omega_3_g", name: "Omega-3", target: 1.6, unit: "g", level: 1 },
    { key: "alpha_linolenic_acid_omega_3_g", name: "ALA", target: 1.6, unit: "g", level: 2 },
    { key: "dha_g", name: "DHA", target: 0.25, unit: "g", level: 2 },
    { key: "epa_g", name: "EPA", target: 0.25, unit: "g", level: 2 },
    { key: "total_omega_6_g", name: "Omega-6", target: 17, unit: "g", level: 1 },
    { key: "linoleic_acid_omega_6_g", name: "LA", target: 17, unit: "g", level: 2 },
    { key: "saturated_fat_g", name: "Saturated fat", target: 24, unit: "g", level: 1 },
    { key: "trans_fat_g", name: "Trans fat", target: 2, unit: "g", level: 1 },
    { key: "cholesterol_mg", name: "Cholesterol", target: 300, unit: "mg" },
  ] },
  { name: "Protein", rows: [
    { key: "protein_g", name: "Protein", target: 107, unit: "g" },
  ] },
  { name: "Vitamins & related", rows: [
    { key: "thiamin_b1_mg", name: "B1 (Thiamine)", target: 1.2, unit: "mg" },
    { key: "riboflavin_b2_mg", name: "B2 (Riboflavin)", target: 1.3, unit: "mg" },
    { key: "niacin_b3_mg", name: "B3 (Niacin)", target: 16, unit: "mg" },
    { key: "pantothenic_acid_b5_mg", name: "B5 (Pantothenic acid)", target: 5, unit: "mg" },
    { key: "vitamin_b6_mg", name: "B6", target: 1.7, unit: "mg" },
    { key: "biotin_b7_ug", name: "B7 (Biotin)", target: 30, unit: "µg" },
    { key: "vitamin_b12_ug", name: "B12", target: 2.4, unit: "µg" },
    { key: "folate_total_ug", name: "Folate", target: 400, unit: "µg" },
    { key: "vitamin_a_rae_ug", name: "Vitamin A", target: 900, unit: "µg" },
    { key: "vitamin_a_iu", name: "Vitamin A", target: null, unit: "IU", level: 1 },
    { key: "vitamin_a_daily_value_pct", name: "Vitamin A", target: null, unit: "% DV", level: 1 },
    { key: "vitamin_c_mg", name: "Vitamin C", target: 90, unit: "mg" },
    { key: "vitamin_c_daily_value_pct", name: "Vitamin C", target: null, unit: "% DV", level: 1 },
    { key: "vitamin_d_d2_d3_ug", name: "Vitamin D", target: 15, unit: "µg" },
    { key: "vitamin_d_iu", name: "Vitamin D", target: null, unit: "IU", level: 1 },
    { key: "vitamin_d_daily_value_pct", name: "Vitamin D", target: null, unit: "% DV", level: 1 },
    { key: "vitamin_e_mg", name: "Vitamin E", target: 15, unit: "mg" },
    { key: "vitamin_k_ug", name: "Vitamin K", target: 120, unit: "µg" },
    { key: "alpha_carotene_ug", name: "Alpha-carotene", target: null, unit: "µg" },
    { key: "beta_carotene_ug", name: "Beta-carotene", target: null, unit: "µg" },
    { key: "choline_mg", name: "Choline", target: 550, unit: "mg" },
  ] },
  { name: "Minerals", rows: [
    { key: "calcium_mg", name: "Calcium", target: 1000, unit: "mg" },
    { key: "calcium_daily_value_pct", name: "Calcium", target: null, unit: "% DV", level: 1 },
    { key: "chromium_ug", name: "Chromium", target: 35, unit: "µg" },
    { key: "copper_mg", name: "Copper", target: 0.9, unit: "mg" },
    { key: "iodine_ug", name: "Iodine", target: 150, unit: "µg" },
    { key: "iron_mg", name: "Iron", target: 18, unit: "mg" },
    { key: "iron_daily_value_pct", name: "Iron", target: null, unit: "% DV", level: 1 },
    { key: "magnesium_mg", name: "Magnesium", target: 420, unit: "mg" },
    { key: "manganese_mg", name: "Manganese", target: 2.3, unit: "mg" },
    { key: "molybdenum_ug", name: "Molybdenum", target: 45, unit: "µg" },
    { key: "phosphorus_mg", name: "Phosphorus", target: 700, unit: "mg" },
    { key: "potassium_mg", name: "Potassium", target: 3500, unit: "mg" },
    { key: "selenium_ug", name: "Selenium", target: 55, unit: "µg" },
    { key: "sodium_mg", name: "Sodium", target: 2300, unit: "mg" },
    { key: "zinc_mg", name: "Zinc", target: 11, unit: "mg" },
  ] },
];

const maximumTargetKeys = new Set([
  "alcohol_g", "caffeine_mg", "total_sugars_g", "source_added_sugars_g",
  "saturated_fat_g", "trans_fat_g", "cholesterol_mg", "sodium_mg",
]);

export const nutrientDefinitions = definitions.flatMap((group, groupIndex) => group.rows.map((row, rowIndex) => ({
  code: row.key,
  displayName: row.name,
  groupName: group.name,
  canonicalUnit: row.unit,
  hierarchyLevel: row.level ?? 0,
  sortOrder: groupIndex * 100 + rowIndex,
  targetKind: row.target === null ? "none" as const : maximumTargetKeys.has(row.key) ? "maximum" as const : "minimum" as const,
  defaultTarget: row.target,
})));

export const nutritionGoalKeys = nutrientDefinitions.filter((row) => row.defaultTarget !== null).map((row) => row.code);

function valueFor(key: string, totals: NutrientTotals) {
  if (key === "net_carbs_g") return Math.max(0, (totals.carbohydrate_g ?? 0) - (totals.dietary_fiber_g ?? 0));
  return totals[key] ?? 0;
}

export function buildTargetGroups(totals: NutrientTotals, overrides: Record<string, number> = {}): TargetGroup[] {
  return definitions.map((group) => ({
    name: group.name,
    rows: group.rows.map((definition) => {
      const amount = valueFor(definition.key, totals);
      const target = overrides[definition.key] ?? definition.target;
      return { ...definition, target, amount, percent: target === null ? 0 : Math.round((amount / target) * 100) };
    }),
  }));
}

export function formatNutrientAmount(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 100) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 10) return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
