import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";
import { typesensePortions } from "@/lib/food-portions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_QUERY_LENGTH = 80;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 25;
const MAX_OFFSET = 500;

type FoodSearchRow = {
  id: string;
  provider: string;
  food_name: string;
  food_description: string | null;
  brand_name: string | null;
  barcode: string | null;
  category_tag: string | null;
  is_common: boolean;
  is_branded: boolean;
  default_serving: Record<string, unknown> | null;
  energy_kcal: string | null;
  protein_g: string | null;
  carbohydrate_g: string | null;
  total_fat_g: string | null;
  nutrition_basis: string;
  is_vegan: boolean;
  relevance: string | null;
  logged_count: string | null;
  last_logged_at: string | null;
};

const synonyms: Record<string, string[]> = {
  aubergine: ["eggplant"], eggplant: ["aubergine"],
  capsicum: ["pepper"], cilantro: ["coriander"], coriander: ["cilantro"],
  courgette: ["zucchini"], zucchini: ["courgette"],
  garbanzo: ["chickpea"], chickpea: ["garbanzo"],
  yoghurt: ["yogurt"], yogurt: ["yoghurt"],
  "plant-based": ["vegan"], vegan: ["plant based"],
};

function readLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), MAX_LIMIT) : DEFAULT_LIMIT;
}

function readOffset(value: string | null): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), MAX_OFFSET) : 0;
}

function normalizeQuery(value: string) {
  const possessivesNormalized = value.toLocaleLowerCase("en-US").replace(/([\p{L}\p{N}])[’']s\b/gu, "$1s");
  return (possessivesNormalized.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
}

function searchAlternatives(token: string) {
  const alternatives = [token, ...(synonyms[token] ?? [])];
  if (token.length > 2 && token.endsWith("s")) {
    const stem = token.slice(0, -1);
    alternatives.push(`${stem}'s`, `${stem}’s`);
  }
  return [...new Set(alternatives)];
}

function toNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function serialize(food: FoodSearchRow) {
  const loggedCount = Number(food.logged_count ?? 0);
  const portion = typesensePortions(food.default_serving, [])[0];
  const energy = toNumber(food.energy_kcal);
  return {
    id: food.id,
    source: "typesense",
    provider: food.provider,
    name: food.food_name,
    description: food.food_description,
    brand: food.brand_name,
    barcode: food.barcode,
    category: food.category_tag,
    isCommon: food.is_common,
    isBranded: food.is_branded,
    defaultServing: food.default_serving,
    nutritionPer100g: {
      energyKcal: toNumber(food.energy_kcal), proteinG: toNumber(food.protein_g),
      carbohydrateG: toNumber(food.carbohydrate_g), totalFatG: toNumber(food.total_fat_g),
    },
    nutritionBasis: food.nutrition_basis,
    defaultCalories: energy === null || !portion ? null : energy * portion.nutrientMultiplier,
    defaultPortionLabel: portion?.label ?? "Serving",
    isVegan: food.is_vegan,
    personalized: loggedCount > 0,
    loggedCount,
    lastLoggedAt: food.last_logged_at,
  };
}

const resultColumns = `
  f.id, f.provider, f.food_name, f.food_description, f.brand_name, f.barcode,
  f.category_tag, f.is_common, f.is_branded, f.default_serving,
  f.energy_kcal, f.protein_g, f.carbohydrate_g, f.total_fat_g, f.nutrition_basis,
  EXISTS (
    SELECT 1 FROM food_catalog.app.vegan_products AS vegan
    WHERE vegan.canonical_barcode = nullif(ltrim(f.barcode, '0'), '')
  ) AS is_vegan`;

function personalHistoryCte(profilePlaceholder: string) {
  return `personal AS (
    SELECT COALESCE(source_item_id, catalog_food_id) AS food_id, count(*) AS logged_count, max(logged_at) AS last_logged_at
    FROM food_catalog.app.diary_entries
    WHERE profile_id = ${profilePlaceholder} AND COALESCE(source_item_type, 'food') = 'food'
    GROUP BY COALESCE(source_item_id, catalog_food_id)
  )`;
}

/** Search catalog fields and rank exact, lexical, popular, and personally relevant matches. */
export async function GET(request: NextRequest) {
  const rawQuery = request.nextUrl.searchParams.get("query")?.trim() ?? "";
  const wantsRecent = request.nextUrl.searchParams.get("recent") === "true";
  const limit = readLimit(request.nextUrl.searchParams.get("limit"));
  const offset = readOffset(request.nextUrl.searchParams.get("offset"));
  if ((!wantsRecent && rawQuery.length < 2) || rawQuery.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ message: `query must contain 2–${MAX_QUERY_LENGTH} characters.` }, { status: 400 });
  }

  try {
    const user = await getOrCreateCurrentUser(request);
    if (wantsRecent && !rawQuery) {
      const recent = await databaseQuery<FoodSearchRow>(
        `WITH ${personalHistoryCte("$1")}
         SELECT ${resultColumns}, 0::DECIMAL AS relevance, p.logged_count::text,
                p.last_logged_at::text
         FROM personal p JOIN food_catalog.public.typesense_foods f ON f.id = p.food_id
         ORDER BY p.last_logged_at DESC, p.logged_count DESC, f.food_name
         LIMIT $2`,
        [user.profileId, limit + 1],
      );
      const rows = recent.rows.slice(0, limit);
      return attachCurrentUserCookie(NextResponse.json({ query: "", kind: "recent", results: rows.map(serialize), hasMore: recent.rows.length > limit }, { headers: { "Cache-Control": "private, no-store" } }), user);
    }

    const tokens = normalizeQuery(rawQuery);
    if (!tokens.length) return NextResponse.json({ message: "query must contain searchable letters or numbers." }, { status: 400 });
    const query = tokens.join(" ");
    const params: unknown[] = [query, user.profileId];
    const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
    const tokenPlaceholders: string[] = [];
    const tokenClauses = tokens.map((token) => {
      const alternatives = searchAlternatives(token);
      const placeholders = alternatives.map((alternative) => bind(`%${alternative}%`));
      tokenPlaceholders.push(placeholders[0]);
      return `(${placeholders.map((placeholder) => `f.search_text ILIKE ${placeholder}`).join(" OR ")})`;
    });
    const tokenScores = tokenPlaceholders.map((placeholder) => `
      CASE WHEN lower(f.food_name) ILIKE ${placeholder} THEN 15 ELSE 0 END +
      CASE WHEN lower(coalesce(f.brand_name, '')) ILIKE ${placeholder} THEN 19 ELSE 0 END +
      CASE WHEN lower(coalesce(f.food_description, '')) ILIKE ${placeholder} THEN 4 ELSE 0 END
    `).join(" + ");
    const limitPlaceholder = bind(limit + 1);
    const offsetPlaceholder = bind(offset);

    const result = await databaseQuery<FoodSearchRow>(
      `WITH ${personalHistoryCte("$2")}
       SELECT ${resultColumns},
         (
           CASE WHEN lower(f.food_name) = $1 THEN 180 ELSE 0 END +
           CASE WHEN lower(coalesce(f.brand_name, '')) = $1 THEN 130 ELSE 0 END +
           CASE WHEN lower(f.food_name) LIKE $1 || '%' THEN 90 ELSE 0 END +
           CASE WHEN f.search_text LIKE '%' || $1 || '%' THEN 55 ELSE 0 END +
           ${tokenScores} +
           -- CockroachDB does not implicitly combine its FLOAT search functions
           -- with the integer CASE scores. Keep the full ranking calculation DECIMAL.
           similarity($1, f.search_text)::DECIMAL * 35 +
           CASE WHEN f.is_common THEN 8 ELSE 0 END + CASE WHEN f.is_branded THEN 2 ELSE 0 END +
           least(12::DECIMAL, greatest(coalesce(f.boost, 0), 0)::DECIMAL) +
           least(32::DECIMAL, coalesce(p.logged_count, 0)::DECIMAL * 4) +
           CASE WHEN p.last_logged_at >= now() - INTERVAL '30 days' THEN 18
                WHEN p.last_logged_at >= now() - INTERVAL '120 days' THEN 8 ELSE 0 END
         )::DECIMAL AS relevance,
         p.logged_count::text, p.last_logged_at::text
       FROM food_catalog.public.typesense_foods f
       LEFT JOIN personal p ON p.food_id = f.id
       WHERE ${tokenClauses.join(" AND ")}
       ORDER BY relevance DESC, coalesce(p.logged_count, 0) DESC, f.food_name, f.id
       LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      params,
    );

    const rows = result.rows.slice(0, limit);
    return attachCurrentUserCookie(NextResponse.json({ query: rawQuery, kind: "search", results: rows.map(serialize), hasMore: result.rows.length > limit }, { headers: { "Cache-Control": "private, no-store" } }), user);
  } catch (error) {
    console.error("Food search failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Food search is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
