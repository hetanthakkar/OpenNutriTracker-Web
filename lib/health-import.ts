export type HealthImportRecord = {
  metricCode: string;
  value: number;
  unit: string;
  measuredAt: Date;
  fingerprintSource: Record<string, unknown>;
};

export type HealthWorkout = {
  name: string;
  durationMinutes: number;
  energyKcal: number;
  loggedAt: Date;
  fingerprintSource: Record<string, unknown>;
};

export type ParsedHealthPayload = {
  measurements: HealthImportRecord[];
  weights: HealthImportRecord[];
  workouts: HealthWorkout[];
};

type UnknownRecord = Record<string, unknown>;

const LIST_KEYS = ["samples", "records", "data", "healthData", "metrics", "workouts", "weights", "bodyMass"];
const DATE_KEYS = ["endDate", "end_date", "timestamp", "recordedAt", "recorded_at", "date", "generatedAt", "generated_at", "startDate", "start_date"];
const VALUE_KEYS = ["value", "quantity", "amount", "count", "average", "avg"];
const METRIC_ALIASES: Array<[string, string, string]> = [
  ["step", "steps", "count"],
  ["sleep", "sleep_hours", "hours"],
  ["restingheart", "resting_heart_rate", "bpm"],
  ["heart", "heart_rate", "bpm"],
  ["hrv", "heart_rate_variability", "ms"],
  ["activeenergy", "active_energy", "kcal"],
  ["distance", "distance", "km"],
  ["bodyfat", "body_fat_percentage", "%"],
  ["oxygensaturation", "oxygen_saturation", "%"],
  ["vo2", "vo2_max", "ml/kg/min"],
];

function object(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function text(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function numberFrom(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = numberValue(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function recordedAt(record: UnknownRecord) {
  for (const key of DATE_KEYS) {
    const value = record[key];
    if (typeof value !== "string" && typeof value !== "number") continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function normalizeUnit(unit: string) {
  return unit.trim().toLowerCase().replaceAll(" ", "");
}

function canonicalRecord(record: UnknownRecord) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function collectRecords(payload: UnknownRecord) {
  const results: UnknownRecord[] = [];
  const seen = new Set<UnknownRecord>();
  const add = (value: unknown) => {
    const item = object(value);
    if (item && !seen.has(item)) {
      seen.add(item);
      results.push(item);
    }
  };

  for (const key of LIST_KEYS) {
    const value = payload[key];
    if (Array.isArray(value)) value.slice(0, 2_000).forEach(add);
    else if (object(value)) {
      const section = object(value)!;
      for (const nestedKey of LIST_KEYS) {
        const nested = section[nestedKey];
        if (Array.isArray(nested)) nested.slice(0, 2_000).forEach(add);
      }
    }
  }
  add(payload);
  return results;
}

function summaryRecords(payload: UnknownRecord) {
  const date = text(payload, DATE_KEYS);
  if (!date) return [];
  const fields: Array<[string, string, string]> = [
    ["steps", "steps", "count"], ["stepCount", "steps", "count"],
    ["sleepHours", "sleep", "hours"], ["sleep_hours", "sleep", "hours"],
    ["restingHeartRate", "restingHeartRate", "bpm"], ["resting_heart_rate", "restingHeartRate", "bpm"],
    ["heartRate", "heartRate", "bpm"], ["heart_rate", "heartRate", "bpm"],
    ["activeEnergyKcal", "activeEnergy", "kcal"], ["active_energy_kcal", "activeEnergy", "kcal"],
    ["weightKg", "weight", "kg"], ["weight_kg", "weight", "kg"], ["weightLb", "weight", "lb"],
  ];
  return fields.flatMap(([field, type, unit]) => {
    const value = numberValue(payload[field]);
    return value === null ? [] : [{ type, value, unit, timestamp: date, sourceField: field }];
  });
}

function typeName(record: UnknownRecord) {
  return text(record, ["type", "dataType", "data_type", "identifier", "metric", "category", "workoutActivityType", "name"]).toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function workoutFrom(record: UnknownRecord, type: string, date: Date | null): HealthWorkout | null {
  if (!date || (!type.includes("workout") && !type.includes("exercise") && !type.includes("activity"))) return null;
  const start = recordedAt({ startDate: record.startDate, start_date: record.start_date });
  const durationSeconds = numberFrom(record, ["durationSeconds", "duration_seconds"]);
  const durationMinutes = numberFrom(record, ["durationMinutes", "duration_minutes", "duration"])
    ?? (durationSeconds === null ? null : durationSeconds / 60)
    ?? (start ? (date.getTime() - start.getTime()) / 60_000 : null);
  const energy = numberFrom(record, ["activeEnergyBurned", "active_energy_burned", "activeEnergyKcal", "active_energy_kcal", "energyKcal", "energy_kcal", "calories"]);
  if (durationMinutes === null || durationMinutes < 1 || durationMinutes > 1_440 || energy === null || energy < 0 || energy > 20_000) return null;
  return {
    name: text(record, ["workoutActivityType", "activityType", "activity_name", "name", "type"]) || "Apple Health workout",
    durationMinutes: Math.round(durationMinutes),
    energyKcal: energy,
    loggedAt: date,
    fingerprintSource: canonicalRecord(record),
  };
}

function measurementFrom(record: UnknownRecord, type: string, date: Date | null): HealthImportRecord | null {
  if (!date) return null;
  const rawValue = numberFrom(record, VALUE_KEYS);
  const unit = text(record, ["unit", "units"]);
  const normalizedUnit = normalizeUnit(unit);
  const isWeight = type.includes("bodymass") || type.includes("bodyweight") || type === "weight" || type.includes("weight");
  if (isWeight && rawValue !== null) {
    const kilograms = normalizedUnit === "lb" || normalizedUnit === "lbs" || normalizedUnit === "pound" || normalizedUnit === "pounds"
      ? rawValue * 0.45359237
      : rawValue;
    if (kilograms >= 20 && kilograms <= 500) return { metricCode: "weight", value: kilograms, unit: "kg", measuredAt: date, fingerprintSource: canonicalRecord(record) };
  }
  const metric = METRIC_ALIASES.find(([needle]) => type.includes(needle));
  if (!metric || rawValue === null || rawValue < 0) return null;
  let value = rawValue;
  if (metric[1] === "sleep_hours" && (normalizedUnit === "min" || normalizedUnit === "minute" || normalizedUnit === "minutes")) value /= 60;
  if (metric[1] === "distance" && (normalizedUnit === "m" || normalizedUnit === "meter" || normalizedUnit === "meters")) value /= 1_000;
  if (!Number.isFinite(value)) return null;
  return { metricCode: metric[1], value, unit: metric[2], measuredAt: date, fingerprintSource: canonicalRecord(record) };
}

/**
 * Normalize common webhook conventions without assuming a specific vendor schema.
 * Unrecognized values remain available in health_sync_events for later mapping.
 */
export function parseHealthPayload(payload: UnknownRecord): ParsedHealthPayload {
  const measurements: HealthImportRecord[] = [];
  const weights: HealthImportRecord[] = [];
  const workouts: HealthWorkout[] = [];
  for (const record of [...collectRecords(payload), ...summaryRecords(payload)]) {
    const type = typeName(record);
    const date = recordedAt(record);
    const workout = workoutFrom(record, type, date);
    if (workout) {
      workouts.push(workout);
      continue;
    }
    const measurement = measurementFrom(record, type, date);
    if (!measurement) continue;
    if (measurement.metricCode === "weight") weights.push(measurement);
    else measurements.push(measurement);
  }
  return { measurements, weights, workouts };
}
