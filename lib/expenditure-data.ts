import { databaseQuery } from "./db.ts";
import { estimateAdaptiveExpenditure, type BiologicalSex } from "./expenditure.ts";

type FoodDay = { day: string; calories: string };
type WeightDay = { day: string; weight_kg: string };
type StepDay = { day: string; steps: string | null };
type ProfileContext = {
  height_cm: string | null;
  date_of_birth: string | null;
  energy_equation_sex: BiologicalSex | null;
  activity_level: string;
  weekly_rate_kg: string | null;
  calorie_adjustment_kcal: string;
  carbs_pct: string;
  fat_pct: string;
  protein_pct: string;
  water_goal_ml: string;
  latest_weight_kg: string | null;
};

function ageOn(dateOfBirth: string, onDate: Date) {
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  let age = onDate.getUTCFullYear() - year;
  if (onDate.getUTCMonth() + 1 < month || (onDate.getUTCMonth() + 1 === month && onDate.getUTCDate() < day)) age -= 1;
  return age;
}

function activityFactor(level: string) {
  if (level === "sedentary") return 1.2;
  if (level === "light") return 1.375;
  if (level === "very_active") return 1.725;
  return 1.55;
}

/** One dated evidence source for Home, Trends, and daily calorie budgets. */
export async function loadExpenditureData(profileId: string, diaryDate: string) {
  const targetDate = new Date(`${diaryDate}T00:00:00.000Z`);
  const dayMs = 86_400_000;
  const analysisStart = new Date(targetDate.getTime() - 119 * dayMs);
  const endExclusive = new Date(targetDate.getTime() + dayMs);
  const params = [profileId, analysisStart.toISOString().slice(0, 10), endExclusive.toISOString().slice(0, 10)];
  const [foodResult, weightResult, stepResult, profileResult] = await Promise.all([
    databaseQuery<FoodDay>(
      `SELECT e.diary_date::text AS day, COALESCE(sum(e.energy_kcal), 0)::text AS calories
       FROM food_catalog.app.diary_entries e
       JOIN food_catalog.app.diary_day_completions c ON c.profile_id=e.profile_id AND c.diary_date=e.diary_date
       WHERE e.profile_id=$1 AND e.diary_date >= $2::date AND e.diary_date < $3::date
       GROUP BY 1 ORDER BY 1`, params),
    databaseQuery<WeightDay>(
      `SELECT DISTINCT ON (to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'))
              to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, weight_kg::text
       FROM food_catalog.app.weight_entries
       WHERE profile_id=$1 AND recorded_at >= $2::date AND recorded_at < $3::date
       ORDER BY to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'), recorded_at DESC, created_at DESC`, params),
    databaseQuery<StepDay>(
      `SELECT to_char(measured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, max(value)::text AS steps
       FROM food_catalog.app.health_measurements
       WHERE profile_id=$1 AND measured_at >= $2::date AND measured_at < $3::date AND metric_code='steps'
       GROUP BY 1 ORDER BY 1`, params),
    databaseQuery<ProfileContext>(
      `SELECT p.height_cm::text, p.date_of_birth::text, p.energy_equation_sex,
              g.activity_level, g.weekly_rate_kg::text, g.calorie_adjustment_kcal::text,
              g.carbs_pct::text, g.fat_pct::text, g.protein_pct::text, g.water_goal_ml::text,
              (SELECT w.weight_kg::text FROM food_catalog.app.weight_entries w
               WHERE w.profile_id=p.id AND w.recorded_at < ($2::date + INTERVAL '1 day')
               ORDER BY w.recorded_at DESC, w.created_at DESC LIMIT 1) AS latest_weight_kg
       FROM food_catalog.app.profiles p
       JOIN food_catalog.app.profile_goals g ON g.profile_id=p.id
       WHERE p.id=$1`, [profileId, diaryDate]),
  ]);

  const profile = profileResult.rows[0];
  const missingProfileFields: string[] = [];
  if (!profile?.height_cm) missingProfileFields.push("height");
  if (!profile?.date_of_birth) missingProfileFields.push("date of birth");
  if (!profile?.energy_equation_sex) missingProfileFields.push("energy equation sex");
  if (!profile?.latest_weight_kg) missingProfileFields.push("weight");
  const food = new Map(foodResult.rows.map((row) => [row.day, Number(row.calories)]));
  const weight = new Map(weightResult.rows.map((row) => [row.day, Number(row.weight_kg)]));
  const steps = new Map(stepResult.rows.map((row) => [row.day, Number(row.steps)]));
  const observations = Array.from({ length: 120 }, (_, i) => {
    const date = new Date(analysisStart.getTime() + i * dayMs).toISOString().slice(0, 10);
    return { date, caloriesKcal: food.get(date) ?? null, weightKg: weight.get(date) ?? null, steps: steps.get(date) ?? null };
  });
  const estimate = profile && missingProfileFields.length === 0 ? estimateAdaptiveExpenditure(observations, {
    ageYears: ageOn(profile.date_of_birth!, targetDate),
    sex: profile.energy_equation_sex!,
    heightCm: Number(profile.height_cm),
    weightKg: Number(profile.latest_weight_kg),
    activityFactor: activityFactor(profile.activity_level),
  }) : null;
  return { profile, estimate, missingProfileFields, weights: weightResult.rows };
}
