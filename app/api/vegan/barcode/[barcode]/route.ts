import { DatabaseNotConfiguredError, databaseQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type VeganProductRow = {
  source_product_id: string;
  barcode: string | null;
  slug: string | null;
  source_url: string | null;
  product_name: string | null;
  ingredients: string | null;
  allergens: string | null;
};

function canonicalBarcode(value: string): string {
  return value.replace(/^0+(?=\d)/, "");
}

/** Looks up a package in the separately imported vegan-product source. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ barcode: string }> },
) {
  const { barcode } = await params;
  const normalizedBarcode = barcode.replace(/[^0-9]/g, "");
  if (!normalizedBarcode || normalizedBarcode.length > 32) {
    return Response.json({ message: "Enter a valid numeric barcode." }, { status: 400 });
  }

  try {
    const result = await databaseQuery<VeganProductRow>(
      `SELECT source_product_id, barcode, slug, source_url, product_name,
              product_json->>'rawIngredients' AS ingredients,
              product_json->>'rawAllergens' AS allergens
       FROM food_catalog.app.vegan_products
       WHERE canonical_barcode = $1
       ORDER BY source_product_id ASC
       LIMIT 1`,
      [canonicalBarcode(normalizedBarcode)],
    );
    const product = result.rows[0];

    return Response.json({
      scannedBarcode: normalizedBarcode,
      isVegan: Boolean(product),
      product: product && {
        sourceProductId: product.source_product_id,
        barcode: product.barcode,
        slug: product.slug,
        sourceUrl: product.source_url,
        name: product.product_name,
        ingredients: product.ingredients,
        allergens: product.allergens,
      },
    }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
  } catch (error) {
    console.error("Vegan barcode lookup failed", error);
    const message = error instanceof DatabaseNotConfiguredError
      ? "Set DATABASE_URL on the server."
      : "Vegan product data is temporarily unavailable.";
    return Response.json({ message }, { status: 503 });
  }
}
