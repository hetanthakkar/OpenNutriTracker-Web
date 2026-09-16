import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required. Add it to .env.local before running this command.");

const pool = new Pool({ connectionString });
const table = "food_catalog.app.diary_entries";

try {
  const constraints = await pool.query(`
    SELECT constraint_name, check_clause
    FROM food_catalog.information_schema.check_constraints
    WHERE constraint_schema = 'app'
      AND constraint_name IN (
        SELECT constraint_name
        FROM food_catalog.information_schema.table_constraints
        WHERE table_schema = 'app'
          AND table_name = 'diary_entries'
          AND constraint_type = 'CHECK'
      )
  `);

  for (const row of constraints.rows) {
    if (!String(row.check_clause).includes("meal_type")) continue;
    const safeName = `"${String(row.constraint_name).replaceAll('"', '""')}"`;
    await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${safeName}`);
  }

  await pool.query(`ALTER TABLE ${table}
    ADD CONSTRAINT diary_entries_meal_type_v2_check
    CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack'))`);
  console.log("Snack diary entries are enabled.");
} finally {
  await pool.end();
}
