import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CalendarRow = { day: string; energy_kcal: string; calorie_goal_kcal: string | null };

function monthRange(value: string | null) {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const start = new Date(`${value}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { month: value, start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function statusFor(energyKcal: number, calorieGoalKcal: number | null) {
  if (calorieGoalKcal === null || calorieGoalKcal <= 0) return "logged" as const;
  return energyKcal >= calorieGoalKcal * 0.9 && energyKcal <= calorieGoalKcal * 1.1 ? "met" as const : "missed" as const;
}

/** Summarize one calendar month using saved diary entries and daily-plan targets. */
export async function GET(request: NextRequest) {
  const range = monthRange(request.nextUrl.searchParams.get("month"));
  if (!range) return NextResponse.json({ message: "month must use YYYY-MM." }, { status: 400 });

  try {
    const user = await getOrCreateCurrentUser(request);
    const result = await databaseQuery<CalendarRow>(
      `WITH latest_plan AS (
         SELECT calorie_goal_kcal FROM food_catalog.app.daily_plan_snapshots
         WHERE profile_id = $1 ORDER BY diary_date DESC LIMIT 1
       )
       SELECT e.diary_date::text AS day, COALESCE(sum(e.energy_kcal), 0)::text AS energy_kcal,
              COALESCE(max(snapshot.calorie_goal_kcal), (SELECT calorie_goal_kcal FROM latest_plan))::text AS calorie_goal_kcal
       FROM food_catalog.app.diary_entries e
       LEFT JOIN food_catalog.app.daily_plan_snapshots snapshot
         ON snapshot.profile_id = e.profile_id AND snapshot.diary_date = e.diary_date
       WHERE e.profile_id = $1 AND e.diary_date >= $2::date AND e.diary_date < $3::date
       GROUP BY e.diary_date ORDER BY e.diary_date`,
      [user.profileId, range.start, range.end],
    );
    const days = result.rows.map((row) => {
      const energyKcal = Number(row.energy_kcal);
      const calorieGoalKcal = row.calorie_goal_kcal === null ? null : Number(row.calorie_goal_kcal);
      return { date: row.day, energyKcal, calorieGoalKcal, status: statusFor(energyKcal, calorieGoalKcal) };
    });
    return attachCurrentUserCookie(NextResponse.json({ month: range.month, days }), user);
  } catch (error) {
    console.error("Read diary calendar failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Calendar data is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
