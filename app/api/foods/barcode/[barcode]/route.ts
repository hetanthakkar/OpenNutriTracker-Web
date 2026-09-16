import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";
import { foodDetailColumns, type FoodDetailRow, serializeFoodDetail } from "@/lib/food-catalog";
import { macroValues } from "@/lib/food-portions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OffProduct = {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number;
  nutrition_data_per?: string;
  nutriments?: Record<string, unknown>;
  image_front_small_url?: string;
  last_modified_t?: number;
};

function numeric(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function offNutrients(source: Record<string, unknown> | undefined) {
  const value = (key: string) => numeric(source?.[key]);
  const energyKcal = value("energy-kcal_100g") ?? (value("energy_100g") === null ? null : Number((value("energy_100g")! / 4.184).toFixed(3)));
  return Object.fromEntries(Object.entries({
    energy_kcal: energyKcal, protein_g:value("proteins_100g"), carbohydrate_g:value("carbohydrates_100g"), total_fat_g:value("fat_100g"), dietary_fiber_g:value("fiber_100g"), total_sugars_g:value("sugars_100g"), source_added_sugars_g:value("added-sugars_100g"), saturated_fat_g:value("saturated-fat_100g"), trans_fat_g:value("trans-fat_100g"), cholesterol_mg:value("cholesterol_100g") === null ? null : value("cholesterol_100g")! * 1000, sodium_mg:value("sodium_100g") === null ? null : value("sodium_100g")! * 1000, potassium_mg:value("potassium_100g") === null ? null : value("potassium_100g")! * 1000, calcium_mg:value("calcium_100g") === null ? null : value("calcium_100g")! * 1000, iron_mg:value("iron_100g") === null ? null : value("iron_100g")! * 1000, vitamin_d_d2_d3_ug:value("vitamin-d_100g") === null ? null : value("vitamin-d_100g")! * 1_000_000,
  }).filter(([, amount]) => amount !== null));
}

function serializeOffProduct(product: OffProduct, barcode: string) {
  const nutrients = offNutrients(product.nutriments);
  const servingGrams = numeric(product.serving_quantity);
  const portions = [
    ...(servingGrams ? [{ id:"serving",label:`1 serving · ${servingGrams} g`,unit:"serving",amount:1,nutrientMultiplier:servingGrams / 100,grams:servingGrams }] : []),
    { id:"g",label:"1 g",unit:"g",amount:1,nutrientMultiplier:0.01,grams:1 },
  ];
  return {
    id: product.code ?? barcode, source:"open_food_facts", provider:"Open Food Facts", sourceUrl:`https://world.openfoodfacts.org/product/${encodeURIComponent(product.code ?? barcode)}`,
    name:product.product_name?.trim() || "Unnamed product", description:product.serving_size ?? null, brand:product.brands?.trim() || null, barcode:product.code ?? barcode,
    defaultServing:servingGrams ? { amount:1,gmWgt:servingGrams,msreDesc:"serving" } : null, servings:[], portions, defaultPortionId:servingGrams ? "serving" : "g", nutrientBase:nutrients, macrosBase:macroValues(nutrients), nutritionPer100g:nutrients, macrosPer100g:macroValues(nutrients), nutritionBasis:"per_100g", isVegan:false,
  };
}

async function lookupOpenFoodFacts(barcode: string) {
  const fields = "code,product_name,brands,serving_size,serving_quantity,nutrition_data_per,nutriments,image_front_small_url,last_modified_t";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_500);
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}?fields=${encodeURIComponent(fields)}`, {
      signal:controller.signal,
      headers:{ "User-Agent":"OpenNutriTracker/0.1 (barcode lookup; contact: support@opennutritracker.local)", Accept:"application/json" },
      next:{ revalidate:300 },
    });
    if (!response.ok) return null;
    const data = await response.json() as { status?: number; product?: OffProduct };
    return data.status === 1 && data.product?.product_name ? serializeOffProduct(data.product, barcode) : null;
  } catch {
    return null;
  } finally { clearTimeout(timeout); }
}

/** Full food lookup for a scanned package barcode. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ barcode: string }> },
) {
  const { barcode } = await params;
  const normalizedBarcode = barcode.replace(/[^0-9A-Za-z-]/g, "");
  const canonicalBarcode = normalizedBarcode.replace(/^0+(?=\d)/, "");

  if (!normalizedBarcode || normalizedBarcode.length > 128) {
    return Response.json({ message: "Invalid barcode." }, { status: 400 });
  }

  try {
    const result = await databaseQuery<FoodDetailRow>(
      `SELECT ${foodDetailColumns}
       FROM food_catalog.public.typesense_foods
       WHERE barcode = ANY($1::STRING[])
       ORDER BY CASE WHEN barcode = $2 THEN 0 ELSE 1 END, id ASC
       LIMIT 1`,
      [[normalizedBarcode, canonicalBarcode], normalizedBarcode],
    );
    const food = result.rows[0];

    if (!food) {
      const external = await lookupOpenFoodFacts(normalizedBarcode);
      if (external) return Response.json(external, { headers:{ "Cache-Control":"public, max-age=60, s-maxage=300, stale-while-revalidate=600" } });
      return Response.json({ message: "No food found for this barcode. Scan the nutrition label to create a private food." }, { status: 404 });
    }

    return Response.json(
      serializeFoodDetail(food),
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
    );
  } catch (error) {
    console.error("Barcode lookup failed", error);
    const message = error instanceof DatabaseNotConfiguredError
      ? "Set DATABASE_URL on the server."
      : "Barcode lookup is temporarily unavailable.";
    // A catalog outage should not prevent the free community fallback.
    const external = await lookupOpenFoodFacts(normalizedBarcode);
    if (external) return Response.json(external, { headers:{ "Cache-Control":"public, max-age=60, s-maxage=300" } });
    return Response.json({ message }, { status: 503 });
  }
}
