import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required. Add it to .env.local before running this command.");

const pool = new Pool({ connectionString });
let mfpUnlocked = false;

try {
  console.log("Enabling unknown-weight diary portions…");
  await pool.query("ALTER TABLE food_catalog.app.diary_entries ALTER COLUMN grams DROP NOT NULL");
  await pool.query("ALTER TABLE food_catalog.app.diary_entries ADD COLUMN IF NOT EXISTS portion_options_snapshot JSONB NULL");

  console.log("Temporarily unlocking food_catalog.public.mfp_foods…");
  await pool.query("ALTER TABLE food_catalog.public.mfp_foods SET (schema_locked = false)");
  mfpUnlocked = true;

  console.log("Adding the MFP search document…");
  await pool.query(`ALTER TABLE food_catalog.public.mfp_foods
    ADD COLUMN IF NOT EXISTS search_text TEXT AS (
      lower(coalesce(brand_name, '') || ' ' || food_name)
    ) STORED`);

  console.log("Creating the MFP typo-tolerant search index…");
  await pool.query(`CREATE INDEX IF NOT EXISTS mfp_foods_search_text_trgm_idx
    ON food_catalog.public.mfp_foods USING GIN (search_text gin_trgm_ops)`);
  console.log("Flexible Typesense and MFP portions are ready.");
} finally {
  if (mfpUnlocked) {
    console.log("Restoring the MFP schema lock…");
    await pool.query("ALTER TABLE food_catalog.public.mfp_foods SET (schema_locked = true)");
  }
  await pool.end();
}
