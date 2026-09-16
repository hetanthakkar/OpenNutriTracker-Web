export type WaterUnit = "ml" | "fl_oz";

const ML_PER_US_FL_OZ = 29.5735295625;

export function waterUnitLabel(unit: WaterUnit) {
  return unit === "fl_oz" ? "fl oz" : "ml";
}

export function waterDisplayValue(amountMl: number, unit: WaterUnit) {
  const normalizedAmount = Number(amountMl);
  const safeAmount = Number.isFinite(normalizedAmount) ? normalizedAmount : 0;
  return unit === "fl_oz" ? safeAmount / ML_PER_US_FL_OZ : safeAmount;
}

export function waterAmountToMl(amount: number, unit: WaterUnit) {
  return unit === "fl_oz" ? Math.round(amount * ML_PER_US_FL_OZ) : Math.round(amount);
}

export function formatWaterAmount(amountMl: number, unit: WaterUnit) {
  const amount = waterDisplayValue(amountMl, unit);
  return `${amount.toLocaleString("en-US", {
    maximumFractionDigits: unit === "fl_oz" ? 1 : 0,
  })} ${waterUnitLabel(unit)}`;
}
