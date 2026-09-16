export const sharePermissionCodes = [
  "calorie_total",
  "macro_totals",
  "meal_names_portions",
  "water_intake",
  "activity",
  "weight_trend",
  "goal_progress",
] as const;

export type SharePermissionCode = (typeof sharePermissionCodes)[number];

export const sharePermissionLabels: Record<SharePermissionCode, string> = {
  calorie_total: "Daily calorie total",
  macro_totals: "Macro totals",
  meal_names_portions: "Meal names and portions",
  water_intake: "Water intake",
  activity: "Activity",
  weight_trend: "Weight trend",
  goal_progress: "Goal progress",
};

export const shareRelationships = ["partner", "family_member", "coach", "healthcare_professional"] as const;
export type ShareRelationship = (typeof shareRelationships)[number];

export const shareRelationshipLabels: Record<ShareRelationship, string> = {
  partner: "Partner",
  family_member: "Family member",
  coach: "Coach",
  healthcare_professional: "Healthcare professional",
};

export function isSharePermission(value: unknown): value is SharePermissionCode {
  return typeof value === "string" && sharePermissionCodes.includes(value as SharePermissionCode);
}

export function isShareRelationship(value: unknown): value is ShareRelationship {
  return typeof value === "string" && shareRelationships.includes(value as ShareRelationship);
}
