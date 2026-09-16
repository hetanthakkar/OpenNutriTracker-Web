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
  `CREATE TABLE IF NOT EXISTS food_catalog.app.water_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    amount_ml INT NOT NULL CHECK (amount_ml > 0 AND amount_ml <= 5000),
    logged_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX water_entries_user_logged_at_idx (user_id, logged_at DESC)
  )`,
  `CREATE TABLE IF NOT EXISTS food_catalog.app.activity_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    activity_name TEXT NOT NULL,
    duration_minutes INT NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
    energy_kcal NUMERIC NOT NULL CHECK (energy_kcal >= 0 AND energy_kcal <= 20000),
    logged_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX activity_entries_user_logged_at_idx (user_id, logged_at DESC)
  )`,
  `CREATE TABLE IF NOT EXISTS food_catalog.app.weight_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    weight_kg NUMERIC NOT NULL CHECK (weight_kg >= 20 AND weight_kg <= 500),
    recorded_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX weight_entries_user_recorded_at_idx (user_id, recorded_at DESC)
  )`,
];

try {
  for (const statement of statements) await pool.query(statement);
  console.log("Tracking storage schema is ready.");
} finally {
  await pool.end();
}
