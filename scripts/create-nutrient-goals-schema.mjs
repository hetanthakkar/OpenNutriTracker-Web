import { Pool } from "pg";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required. Add it to .env.local before running this command.");
const pool = new Pool({ connectionString });
try {
  await pool.query("CREATE SCHEMA IF NOT EXISTS food_catalog.app");
  await pool.query(`CREATE TABLE IF NOT EXISTS food_catalog.app.users (id UUID PRIMARY KEY, display_name TEXT NOT NULL DEFAULT 'New member', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS food_catalog.app.user_nutrient_goals (user_id UUID PRIMARY KEY, goals JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  console.log("Nutrient goals storage schema is ready.");
} finally { await pool.end(); }
