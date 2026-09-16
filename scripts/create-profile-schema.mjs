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
  `CREATE TABLE IF NOT EXISTS food_catalog.app.user_profiles (
    user_id UUID PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT 'Alex',
    height_cm NUMERIC NULL CHECK (height_cm IS NULL OR (height_cm >= 80 AND height_cm <= 250)),
    target_weight_kg NUMERIC NULL CHECK (target_weight_kg IS NULL OR (target_weight_kg >= 20 AND target_weight_kg <= 500)),
    activity_level TEXT NOT NULL DEFAULT 'active',
    goal TEXT NOT NULL DEFAULT 'maintain_weight',
    weekly_rate_kg NUMERIC NULL CHECK (weekly_rate_kg IS NULL OR (weekly_rate_kg >= -2 AND weekly_rate_kg <= 2)),
    water_goal_ml INT NOT NULL DEFAULT 1900 CHECK (water_goal_ml >= 250 AND water_goal_ml <= 10000),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
];

try {
  for (const statement of statements) await pool.query(statement);
  console.log("Profile storage schema is ready.");
} finally {
  await pool.end();
}
