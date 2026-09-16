import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required. Add it to .env.local before running this command.");

const pool = new Pool({ connectionString });

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS food_catalog.app.diary_day_completions (
    profile_id UUID NOT NULL REFERENCES food_catalog.app.profiles(id),
    diary_date DATE NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, diary_date)
  )`);
  // CockroachDB does not support this cross-database reference in a trigger
  // function. The diary API clears completion records on every food mutation.
  console.log("Diary completion storage is ready.");
} finally {
  await pool.end();
}
