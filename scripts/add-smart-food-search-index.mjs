import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required. Add it to .env.local before running this command.");

const pool = new Pool({ connectionString });
let unlocked = false;

try {
  console.log("Temporarily unlocking food_catalog.public.typesense_foods…");
  await pool.query("ALTER TABLE food_catalog.public.typesense_foods SET (schema_locked = false)");
  unlocked = true;

  console.log("Adding the normalized product search document…");
  await pool.query(`ALTER TABLE food_catalog.public.typesense_foods
    ADD COLUMN IF NOT EXISTS search_text TEXT AS (
      lower(coalesce(brand_name, '') || ' ' || food_name || ' ' || coalesce(food_description, '') || ' ' || coalesce(category_tag, ''))
    ) STORED`);

  console.log("Creating the typo-tolerant product search index…");
  await pool.query(`CREATE INDEX IF NOT EXISTS typesense_foods_search_text_trgm_idx
    ON food_catalog.public.typesense_foods USING GIN (search_text gin_trgm_ops)`);
  console.log("Smart food search index is ready.");
} finally {
  if (unlocked) {
    console.log("Restoring the schema lock…");
    await pool.query("ALTER TABLE food_catalog.public.typesense_foods SET (schema_locked = true)");
  }
  await pool.end();
}
