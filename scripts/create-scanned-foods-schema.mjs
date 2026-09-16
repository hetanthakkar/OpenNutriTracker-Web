import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required. Add it to .env.local before running this command.");

const pool = new Pool({ connectionString });

try {
  await pool.query("CREATE SCHEMA IF NOT EXISTS food_catalog.app");
  await pool.query(`CREATE TABLE IF NOT EXISTS food_catalog.app.scanned_foods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES food_catalog.app.users(id),
    profile_id UUID NOT NULL REFERENCES food_catalog.app.profiles(id),
    catalog_food_id TEXT NOT NULL,
    barcode TEXT NULL,
    food_name TEXT NOT NULL,
    brand_name TEXT NULL,
    nutrients JSONB NOT NULL,
    portions JSONB NOT NULL,
    default_portion_id TEXT NULL,
    nutrition_basis TEXT NOT NULL,
    scan_count INT8 NOT NULL DEFAULT 1,
    first_scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (profile_id, catalog_food_id)
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS scanned_foods_profile_recent_idx ON food_catalog.app.scanned_foods (profile_id, last_scanned_at DESC)");
  console.log("Scanned foods storage schema is ready.");
} finally {
  await pool.end();
}
