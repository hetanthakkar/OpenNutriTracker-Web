export type HealthTrendPeriod = "7 days" | "30 days" | "90 days" | "All";

type HealthTrendSeries = {
  labels: string[];
  steps: number[];
  sleep: number[];
  restingHeartRate: number[];
};

export const conduitHealthTrends: Record<HealthTrendPeriod, HealthTrendSeries> = {
  "7 days": {
    labels: ["Aug 30", "31", "Sep 1", "2", "3", "4", "Today"],
    steps: [6820, 9410, 8020, 11240, 7350, 10110, 8742],
    sleep: [6.8, 7.4, 7.1, 7.8, 6.6, 7.6, 7.5],
    restingHeartRate: [61, 60, 60, 59, 61, 58, 58],
  },
  "30 days": {
    labels: ["Aug 7", "12", "17", "22", "27", "Sep 1", "Today"],
    steps: [7150, 7620, 8240, 8910, 8460, 9230, 8742],
    sleep: [6.9, 7.0, 7.2, 7.1, 7.4, 7.3, 7.5],
    restingHeartRate: [63, 62, 62, 61, 60, 59, 58],
  },
  "90 days": {
    labels: ["Jun", "Jun 20", "Jul", "Jul 20", "Aug", "Aug 20", "Today"],
    steps: [6120, 6480, 7020, 7350, 7980, 8310, 8742],
    sleep: [6.5, 6.7, 6.8, 6.9, 7.1, 7.3, 7.5],
    restingHeartRate: [66, 65, 64, 63, 61, 60, 58],
  },
  All: {
    labels: ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Today"],
    steps: [5480, 5710, 6040, 6310, 7040, 8110, 8742],
    sleep: [6.2, 6.4, 6.5, 6.6, 6.9, 7.2, 7.5],
    restingHeartRate: [69, 68, 67, 66, 64, 61, 58],
  },
};

export const conduitHealthSummary = {
  syncedAt: "6 min ago",
  steps: 8742,
  activeEnergyKcal: 462,
  exerciseMinutes: 48,
  distanceKm: 6.4,
  sleepHours: 7.5,
  sleepLabel: "7 h 31 min",
  heartRateBpm: 72,
  restingHeartRateBpm: 58,
  hrvMs: 52,
  workouts: 2,
  workoutMinutes: 64,
  weightKg: 87,
  bodyFatPercent: 24.6,
  oxygenSaturationPercent: 98,
  respiratoryRate: 15.2,
  vo2Max: 42.1,
  nutrition: {
    calories: 2655,
    proteinG: 92,
    carbsG: 374,
    fatG: 89,
  },
  running: {
    speedKph: 9.8,
    powerW: 252,
    strideLengthM: 1.06,
    groundContactMs: 264,
  },
};

export const conduitCategories = [
  "Steps & activity",
  "Heart rate & HRV",
  "Sleep",
  "Workouts",
  "Body measurements",
  "Nutrition",
  "Running dynamics",
] as const;
