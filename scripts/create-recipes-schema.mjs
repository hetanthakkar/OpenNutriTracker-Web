import { Pool } from "pg";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required. Add it to .env.local before running this command.");
const pool = new Pool({ connectionString });
try {
  await pool.query("CREATE SCHEMA IF NOT EXISTS food_catalog.app");
  await pool.query(`CREATE TABLE IF NOT EXISTS food_catalog.app.users (id UUID PRIMARY KEY, display_name TEXT NOT NULL DEFAULT 'New member', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS food_catalog.app.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL, recipe_name TEXT NOT NULL,
    description TEXT NULL, servings NUMERIC NOT NULL CHECK (servings > 0 AND servings <= 1000),
    ingredients JSONB NOT NULL DEFAULT '[]', nutrients JSONB NOT NULL DEFAULT '{}',
    energy_kcal NUMERIC NOT NULL DEFAULT 0, protein_g NUMERIC NOT NULL DEFAULT 0, carbohydrate_g NUMERIC NOT NULL DEFAULT 0, total_fat_g NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX recipes_user_name_idx (user_id, recipe_name)
  )`);
  console.log("Recipe storage schema is ready.");
} finally { await pool.end(); }
