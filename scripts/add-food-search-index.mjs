import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required. Add it to .env.local before running this command.");
}

const pool = new Pool({ connectionString });
let unlocked = false;

try {
  // Each pool.query call is an individual, implicit transaction. CockroachDB
  // requires this exact shape when changing schema_locked.
  console.log("Temporarily unlocking food_catalog.public.typesense_foods…");
  await pool.query(
    "ALTER TABLE food_catalog.public.typesense_foods SET (schema_locked = false)",
  );
  unlocked = true;

  console.log("Creating the food-name search index…");
  await pool.query(
    "CREATE INDEX IF NOT EXISTS typesense_foods_food_name_idx ON food_catalog.public.typesense_foods (food_name)",
  );
  console.log("Food-name search index is ready.");
} finally {
  if (unlocked) {
    console.log("Restoring the schema lock…");
    await pool.query(
      "ALTER TABLE food_catalog.public.typesense_foods SET (schema_locked = true)",
    );
  }
  await pool.end();
}
