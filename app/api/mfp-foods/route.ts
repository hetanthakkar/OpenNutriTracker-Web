import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";
import { mfpPortions, normalizeMfpNutrients } from "@/lib/food-portions";
import type { MfpFoodRow } from "@/lib/mfp-food-catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchRow = MfpFoodRow & { logged_count: string | null; last_logged_at: string | null };
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 25;
const MAX_OFFSET = 500;

function readLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), MAX_LIMIT) : DEFAULT_LIMIT;
}

function readOffset(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), MAX_OFFSET) : 0;
}

function normalizeQuery(value: string) {
  const possessivesNormalized = value.toLocaleLowerCase("en-US").replace(/([\p{L}\p{N}])[’']s\b/gu, "$1s");
  return (possessivesNormalized.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
}

function searchAlternatives(token: string) {
  if (token.length <= 2 || !token.endsWith("s")) return [token];
  const stem = token.slice(0,-1);
  return [token,`${stem}'s`,`${stem}’s`];
}

function serialize(food: SearchRow) {
  const nutrientBase = normalizeMfpNutrients(food.nutrients);
  const portions = mfpPortions(food.serving_sizes);
  const portion = portions[0];
  const energy = typeof nutrientBase.energy_kcal === "number" ? nutrientBase.energy_kcal : null;
  const loggedCount = Number(food.logged_count ?? 0);
  return {
    id: food.id, source: "mfp", provider: food.provider, name: food.food_name,
    description: food.verified ? "Verified MFP food" : "MFP food", brand: food.brand_name,
    barcode: null, isVegan: false, defaultServing: null,
    defaultCalories: energy === null || !portion ? null : energy * portion.nutrientMultiplier,
    defaultPortionLabel: portion?.label ?? "Serving",
    personalized: loggedCount > 0, loggedCount, lastLoggedAt: food.last_logged_at,
  };
}

/** Search the MFP catalog after db:enable-flexible-portions has installed its search index. */
export async function GET(request: NextRequest) {
  const rawQuery = request.nextUrl.searchParams.get("query")?.trim() ?? "";
  const limit = readLimit(request.nextUrl.searchParams.get("limit"));
  const offset = readOffset(request.nextUrl.searchParams.get("offset"));
  if (rawQuery.length < 2 || rawQuery.length > 80) return NextResponse.json({ message: "query must contain 2–80 characters." }, { status: 400 });
  const tokens = normalizeQuery(rawQuery);
  if (!tokens.length) return NextResponse.json({ message: "query must contain searchable letters or numbers." }, { status: 400 });

  try {
    const user = await getOrCreateCurrentUser(request);
    const params: unknown[] = [user.profileId, tokens.join(" ")];
    const clauses = tokens.map((token) => {
      const alternatives = searchAlternatives(token);
      const placeholders = alternatives.map((alternative) => { params.push(`%${alternative}%`); return `$${params.length}`; });
      return `(${placeholders.map((placeholder) => `f.search_text ILIKE ${placeholder}`).join(" OR ")})`;
    });
    params.push(limit + 1);
    const limitPlaceholder = `$${params.length}`;
    params.push(offset);
    const offsetPlaceholder = `$${params.length}`;
    const result = await databaseQuery<SearchRow>(
      `WITH personal AS (
         SELECT source_item_id AS food_id, count(*) AS logged_count, max(logged_at) AS last_logged_at
         FROM food_catalog.app.diary_entries WHERE profile_id=$1 AND source_item_type='mfp_food'
         GROUP BY source_item_id
       )
       SELECT f.id,f.provider,f.source_food_id,f.food_name,f.brand_name,f.verified,f.serving_sizes,f.nutrients,f.nutrition_source,
              p.logged_count::text,p.last_logged_at::text
       FROM food_catalog.public.mfp_foods f LEFT JOIN personal p ON p.food_id=f.id
       WHERE ${clauses.join(" AND ")}
       ORDER BY CASE WHEN lower(f.food_name)=$2 THEN 0 WHEN lower(coalesce(f.brand_name,''))=$2 THEN 1
                     WHEN lower(f.food_name) LIKE $2 || '%' THEN 2 ELSE 3 END,
                coalesce(p.logged_count,0) DESC, f.verified DESC, f.food_name, f.id
       LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      params,
    );
    const rows = result.rows.slice(0, limit);
    return attachCurrentUserCookie(NextResponse.json({ query: rawQuery, results: rows.map(serialize), hasMore: result.rows.length > limit }, { headers: { "Cache-Control": "private, no-store" } }), user);
  } catch (error) {
    console.error("MFP food search failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "MFP food search is unavailable. Run npm run db:enable-flexible-portions first.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
