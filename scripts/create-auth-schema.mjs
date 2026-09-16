import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required. Add it to .env.local before running this command.");

const pool = new Pool({ connectionString });
const statements = [
  "CREATE SCHEMA IF NOT EXISTS food_catalog.app",
  "ALTER TABLE food_catalog.app.users ADD COLUMN IF NOT EXISTS firebase_uid TEXT NULL",
  "ALTER TABLE food_catalog.app.users ADD COLUMN IF NOT EXISTS email TEXT NULL",
  "ALTER TABLE food_catalog.app.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()",
  "ALTER TABLE food_catalog.app.users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()",
  "CREATE UNIQUE INDEX IF NOT EXISTS users_firebase_uid_idx ON food_catalog.app.users (firebase_uid)",
];

try {
  for (const statement of statements) await pool.query(statement);
  console.log("Firebase authentication schema is ready.");
} finally {
  await pool.end();
}
