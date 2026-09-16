import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required. Add it to .env.local before running this command.");
}

const pool = new Pool({ connectionString });

const statements = [
  "CREATE SCHEMA IF NOT EXISTS food_catalog.app",
  `CREATE TABLE IF NOT EXISTS food_catalog.app.users (
    id UUID PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT 'New member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS food_catalog.app.diary_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    catalog_food_id TEXT NOT NULL,
    meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
    logged_at TIMESTAMPTZ NOT NULL,
    food_name TEXT NOT NULL,
    brand_name TEXT NULL,
    serving JSONB NULL,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    grams NUMERIC NOT NULL CHECK (grams > 0),
    nutrition_basis TEXT NOT NULL,
    nutrients JSONB NOT NULL,
    energy_kcal NUMERIC NULL,
    protein_g NUMERIC NULL,
    carbohydrate_g NUMERIC NULL,
    total_fat_g NUMERIC NULL,
    dietary_fiber_g NUMERIC NULL,
    total_sugars_g NUMERIC NULL,
    sodium_mg NUMERIC NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX diary_entries_user_logged_at_idx (user_id, logged_at DESC)
  )`,
];

try {
  for (const statement of statements) {
    await pool.query(statement);
  }
  console.log("Diary storage schema is ready.");
} finally {
  await pool.end();
}
