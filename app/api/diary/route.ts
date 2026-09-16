import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";
import { resolveDailyPlan } from "@/lib/daily-plan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DiaryRow = {
  id: string;
  catalog_food_id: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  logged_at: string;
  food_name: string;
  brand_name: string | null;
  serving: Record<string, unknown> | null;
  quantity: string;
  grams: string | null;
  unit: string;
  portion_id: string | null;
  portion_label_snapshot: string | null;
  portion_options_snapshot: Array<{ id:string; label:string; unit:string; amount:number; nutrientMultiplier:number; grams:number|null }> | null;
  nutrition_basis: string;
  nutrients: Record<string, unknown>;
  energy_kcal: string | null;
  protein_g: string | null;
  carbohydrate_g: string | null;
  total_fat_g: string | null;
  dietary_fiber_g: string | null;
  total_sugars_g: string | null;
  sodium_mg: string | null;
};

type CompletionRow = { completed_at: string };

function numberValue(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function sumNutrients(entries: DiaryRow[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of entries) {
    for (const [key, value] of Object.entries(entry.nutrients)) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      totals[key] = Number(((totals[key] ?? 0) + value).toFixed(4));
    }
  }
  return totals;
}

function dateRange(value: string | null): { date: string; start: Date; end: Date } | null {
  const date = value ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== date) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { date, start, end };
}

/** List the current browser profile's diary entries for one UTC calendar day. */
export async function GET(request: NextRequest) {
  const range = dateRange(request.nextUrl.searchParams.get("date"));
  if (!range) return NextResponse.json({ message: "date must use YYYY-MM-DD." }, { status: 400 });

  try {
    const user = await getOrCreateCurrentUser(request);
    const [result, plan, completion] = await Promise.all([databaseQuery<DiaryRow>(
      `SELECT
         id, catalog_food_id, meal_type, logged_at::text, food_name, brand_name,
         serving, quantity::text, grams::text, unit, portion_id, portion_label_snapshot, portion_options_snapshot, nutrition_basis, nutrients,
         energy_kcal::text, protein_g::text, carbohydrate_g::text, total_fat_g::text,
         dietary_fiber_g::text, total_sugars_g::text, sodium_mg::text
       FROM food_catalog.app.diary_entries
       WHERE profile_id = $1 AND diary_date = $2
      ORDER BY logged_at ASC, created_at ASC`,
      [user.profileId, range.date],
    ), resolveDailyPlan(user.profileId, range.date), databaseQuery<CompletionRow>(
      "SELECT completed_at::text FROM food_catalog.app.diary_day_completions WHERE profile_id=$1 AND diary_date=$2",
      [user.profileId, range.date],
    )]);

    const nutrients = sumNutrients(result.rows);
    return attachCurrentUserCookie(NextResponse.json({
      date: range.date,
      plan: {
        calorieGoalKcal: plan.calorieGoalKcal,
        carbsTargetG: plan.carbsTargetG,
        fatTargetG: plan.fatTargetG,
        proteinTargetG: plan.proteinTargetG,
      },
      nutrition: { entryCount: result.rows.length, nutrients },
      completion: { completed: completion.rows.length > 0, completedAt: completion.rows[0]?.completed_at ?? null },
      entries: result.rows.map((entry) => ({
        id: entry.id,
        catalogFoodId: entry.catalog_food_id,
        mealType: entry.meal_type,
        loggedAt: entry.logged_at,
        name: entry.food_name,
        brand: entry.brand_name,
        serving: entry.serving,
        quantity: Number(entry.quantity),
        grams: numberValue(entry.grams),
        unit: entry.unit,
        portionId: entry.portion_id,
        portionLabel: entry.portion_label_snapshot,
        portions: entry.portion_options_snapshot ?? [],
        nutritionBasis: entry.nutrition_basis,
        nutrients: entry.nutrients,
        macros: {
          energyKcal: numberValue(entry.energy_kcal),
          proteinG: numberValue(entry.protein_g),
          carbohydrateG: numberValue(entry.carbohydrate_g),
          totalFatG: numberValue(entry.total_fat_g),
          dietaryFiberG: numberValue(entry.dietary_fiber_g),
          totalSugarsG: numberValue(entry.total_sugars_g),
          sodiumMg: numberValue(entry.sodium_mg),
        },
      })),
    }), user);
  } catch (error) {
    console.error("Read diary failed", error);
    const message = error instanceof DatabaseNotConfiguredError
      ? "Set DATABASE_URL on the server."
      : "Diary storage is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}

/** Mark a finished diary day as complete, or reopen it for changes. */
export async function PUT(request: NextRequest) {
  let body: { date?: unknown; completed?: unknown };
  try { body = await request.json() as { date?: unknown; completed?: unknown }; }
  catch { return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 }); }
  const range = typeof body.date === "string" ? dateRange(body.date) : null;
  if (!range || typeof body.completed !== "boolean") return NextResponse.json({ message: "A valid diary date and completion state are required." }, { status: 400 });
  if (range.start.getTime() > new Date().setUTCHours(0, 0, 0, 0)) return NextResponse.json({ message: "Future diary days cannot be completed." }, { status: 400 });

  try {
    const user = await getOrCreateCurrentUser(request);
    if (body.completed) {
      const entries = await databaseQuery<{ count: string }>("SELECT count(*)::text AS count FROM food_catalog.app.diary_entries WHERE profile_id=$1 AND diary_date=$2", [user.profileId, range.date]);
      if (Number(entries.rows[0]?.count ?? 0) === 0) return attachCurrentUserCookie(NextResponse.json({ message: "Add at least one food before marking this day complete." }, { status: 400 }), user);
      const result = await databaseQuery<CompletionRow>(
        `INSERT INTO food_catalog.app.diary_day_completions (profile_id, diary_date)
         VALUES ($1,$2) ON CONFLICT (profile_id, diary_date) DO UPDATE SET completed_at=now()
         RETURNING completed_at::text`,
        [user.profileId, range.date],
      );
      return attachCurrentUserCookie(NextResponse.json({ completed: true, completedAt: result.rows[0].completed_at }), user);
    }
    await databaseQuery("DELETE FROM food_catalog.app.diary_day_completions WHERE profile_id=$1 AND diary_date=$2", [user.profileId, range.date]);
    return attachCurrentUserCookie(NextResponse.json({ completed: false, completedAt: null }), user);
  } catch (error) {
    console.error("Update diary completion failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Diary completion storage is temporarily unavailable. Run npm run db:create-diary-completion-schema if you have not migrated yet.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
