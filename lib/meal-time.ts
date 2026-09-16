export type TimeBasedMealSection = "Breakfast" | "Lunch" | "Dinner" | "Snack";

/** Selects the most likely meal using the user's device-local time. */
export function mealSectionForTime(date: Date): TimeBasedMealSection {
  const hour = date.getHours();

  if (hour >= 5 && hour < 11) return "Breakfast";
  if (hour >= 11 && hour < 16) return "Lunch";
  if (hour >= 16 && hour < 22) return "Dinner";
  return "Snack";
}
