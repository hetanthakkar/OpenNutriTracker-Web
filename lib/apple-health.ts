export type HealthTrendPeriod = "7 days" | "30 days" | "90 days" | "All";

export const conduitCategories = [
  "Steps & activity",
  "Heart rate & HRV",
  "Sleep",
  "Workouts",
  "Body measurements",
  "Nutrition",
  "Running dynamics",
] as const;
