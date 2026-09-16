export type EnergyUnit = "kcal" | "kJ";
export type WeightUnit = "kg" | "lb" | "st";
export type HeightUnit = "cm" | "ft_in";
export type FoodUnitPreference = "metric" | "imperial";

export type DisplayPreferences = {
  energyUnit: EnergyUnit;
  weightUnit: WeightUnit;
  heightUnit: HeightUnit;
  foodUnit: FoodUnitPreference;
  dayStart: string;
  locale: string;
  showActivity: boolean;
  showMacros: boolean;
  showMicros: boolean;
};

export const defaultDisplayPreferences: DisplayPreferences = {
  energyUnit: "kcal", weightUnit: "kg", heightUnit: "cm", foodUnit: "metric",
  dayStart: "00:00", locale: "en-US", showActivity: true, showMacros: true, showMicros: true,
};

const languageLocales: Record<string, string> = {
  English: "en-US", Deutsch: "de-DE", Čeština: "cs-CZ", Italiano: "it-IT", Polski: "pl-PL",
  Slovenčina: "sk-SK", Türkçe: "tr-TR", Українська: "uk-UA", 中文: "zh-CN",
};

export function displayPreferences(value: Record<string, unknown>): DisplayPreferences {
  return {
    energyUnit: value.energyUnits === "Kilojoules (kJ)" ? "kJ" : "kcal",
    weightUnit: value.weightUnits === "Pounds (lb)" ? "lb" : value.weightUnits === "Stone (st)" ? "st" : "kg",
    heightUnit: value.heightUnits === "Imperial (ft, in)" ? "ft_in" : "cm",
    foodUnit: value.foodUnits === "Imperial (oz, fl oz)" ? "imperial" : "metric",
    dayStart: typeof value.dayStart === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.dayStart) ? value.dayStart : "00:00",
    locale: typeof value.language === "string" ? languageLocales[value.language] ?? "en-US" : "en-US",
    showActivity: value.showActivity !== false,
    showMacros: value.showMacros !== false,
    showMicros: value.showMicros !== false,
  };
}

export function formatEnergy(kcal: number, unit: EnergyUnit, locale = "en-US", maximumFractionDigits = 0) {
  const amount = unit === "kJ" ? kcal * 4.184 : kcal;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits }).format(amount)} ${energyUnitLabel(unit)}`;
}

export function energyValue(kcal: number, unit: EnergyUnit) {
  return unit === "kJ" ? kcal * 4.184 : kcal;
}

export const energyDisplayValue = energyValue;

export function energyAmountToKcal(value: number, unit: EnergyUnit) {
  return unit === "kJ" ? value / 4.184 : value;
}

export function energyUnitLabel(unit: EnergyUnit) {
  return unit === "kJ" ? "kJ" : "cal";
}

export function weightDisplayValue(kg: number, unit: WeightUnit) {
  if (unit === "lb") return kg * 2.2046226218;
  if (unit === "st") return (kg * 2.2046226218) / 14;
  return kg;
}

export function weightAmountToKg(value: number, unit: WeightUnit) {
  if (unit === "lb") return value / 2.2046226218;
  if (unit === "st") return (value * 14) / 2.2046226218;
  return value;
}

export function weightUnitLabel(unit: WeightUnit) {
  return unit === "lb" ? "lb" : unit === "st" ? "st" : "kg";
}

export function heightDisplayValue(cm: number, unit: HeightUnit) {
  return unit === "ft_in" ? cm / 30.48 : cm;
}

export function heightAmountToCm(value: number, unit: HeightUnit) {
  return unit === "ft_in" ? value * 30.48 : value;
}

export function heightUnitLabel(unit: HeightUnit) {
  return unit === "ft_in" ? "ft" : "cm";
}

export function foodDisplayValue(grams: number, unit: FoodUnitPreference) {
  return unit === "imperial" ? grams / 28.349523125 : grams;
}

export function foodAmountToGrams(value: number, unit: FoodUnitPreference) {
  return unit === "imperial" ? value * 28.349523125 : value;
}

export function foodUnitLabel(unit: FoodUnitPreference) {
  return unit === "imperial" ? "oz" : "g";
}

export function formatWeight(kg: number, unit: WeightUnit, locale = "en-US") {
  if (unit === "lb") return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(kg * 2.2046226218)} lb`;
  if (unit === "st") {
    const totalPounds = kg * 2.2046226218;
    const stone = Math.floor(totalPounds / 14);
    const pounds = totalPounds - stone * 14;
    return `${stone} st ${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(pounds)} lb`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(kg)} kg`;
}

export function formatHeight(cm: number, unit: HeightUnit, locale = "en-US") {
  if (unit === "ft_in") {
    const totalInches = cm / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches - feet * 12;
    return `${feet} ft ${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(inches)} in`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(cm)} cm`;
}

/** Return the user's diary date when their day begins at a time other than midnight. */
export function diaryDateKey(now: Date, dayStart: string) {
  const [hours, minutes] = dayStart.split(":").map(Number);
  const date = new Date(now);
  if (date.getHours() < hours || (date.getHours() === hours && date.getMinutes() < minutes)) date.setDate(date.getDate() - 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateFromKey(value: string) {
  return new Date(`${value}T12:00:00`);
}
