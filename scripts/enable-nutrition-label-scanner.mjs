import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required. Add it to .env.local before running this command.");

const pool = new Pool({ connectionString });
try {
  await pool.query("ALTER TABLE food_catalog.app.custom_foods ALTER COLUMN serving_grams DROP NOT NULL");
  await pool.query("ALTER TABLE food_catalog.app.custom_foods ADD COLUMN IF NOT EXISTS serving_ml NUMERIC NULL CHECK (serving_ml > 0 AND serving_ml <= 10000)");
  await pool.query("ALTER TABLE food_catalog.app.custom_foods ADD COLUMN IF NOT EXISTS serving_amount NUMERIC NOT NULL DEFAULT 1 CHECK (serving_amount > 0 AND serving_amount <= 100000)");
  await pool.query("ALTER TABLE food_catalog.app.custom_foods ADD COLUMN IF NOT EXISTS serving_unit TEXT NOT NULL DEFAULT 'serving'");
  await pool.query("ALTER TABLE food_catalog.app.custom_foods ADD COLUMN IF NOT EXISTS nutrition_basis TEXT NOT NULL DEFAULT 'per_serving'");
  await pool.query("ALTER TABLE food_catalog.app.custom_foods ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'");
  await pool.query("ALTER TABLE food_catalog.app.custom_foods ADD COLUMN IF NOT EXISTS barcode TEXT NULL");
  await pool.query("ALTER TABLE food_catalog.app.custom_foods ADD COLUMN IF NOT EXISTS source_url TEXT NULL");
  await pool.query("UPDATE food_catalog.app.custom_foods SET serving_amount=COALESCE(serving_amount, 1), serving_unit=COALESCE(nullif(serving_unit, ''), 'serving'), nutrition_basis=COALESCE(nullif(nutrition_basis, ''), 'per_serving')");
  console.log("Nutrition-label scanner fields are ready. Existing custom foods remain per serving.");
} finally {
  await pool.end();
}
