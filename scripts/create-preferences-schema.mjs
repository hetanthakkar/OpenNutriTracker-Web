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
  `CREATE TABLE IF NOT EXISTS food_catalog.app.user_preferences (
    user_id UUID PRIMARY KEY,
    preferences JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
];

try {
  for (const statement of statements) await pool.query(statement);
  console.log("Preferences storage schema is ready.");
} finally {
  await pool.end();
}
