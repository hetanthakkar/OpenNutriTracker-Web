import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required. Add it to .env.local before running this command.");

const pool = new Pool({ connectionString });
const statements = [
  "CREATE SCHEMA IF NOT EXISTS food_catalog.app",
  `CREATE TABLE IF NOT EXISTS food_catalog.app.users (
    id UUID PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT 'New member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS food_catalog.app.custom_foods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    food_name TEXT NOT NULL,
    brand_name TEXT NULL,
    serving_grams NUMERIC NULL CHECK (serving_grams > 0 AND serving_grams <= 10000),
    serving_ml NUMERIC NULL CHECK (serving_ml > 0 AND serving_ml <= 10000),
    serving_amount NUMERIC NOT NULL DEFAULT 1 CHECK (serving_amount > 0 AND serving_amount <= 100000),
    serving_unit TEXT NOT NULL DEFAULT 'serving',
    nutrition_basis TEXT NOT NULL DEFAULT 'per_serving',
    source TEXT NOT NULL DEFAULT 'manual',
    barcode TEXT NULL,
    source_url TEXT NULL,
    nutrients JSONB NOT NULL,
    energy_kcal NUMERIC NOT NULL DEFAULT 0,
    protein_g NUMERIC NOT NULL DEFAULT 0,
    carbohydrate_g NUMERIC NOT NULL DEFAULT 0,
    total_fat_g NUMERIC NOT NULL DEFAULT 0,
    dietary_fiber_g NUMERIC NOT NULL DEFAULT 0,
    total_sugars_g NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX custom_foods_user_name_idx (user_id, food_name)
  )`,
];

try {
  for (const statement of statements) await pool.query(statement);
  console.log("Custom foods storage schema is ready.");
} finally {
  await pool.end();
}
