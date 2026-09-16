import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required. Add it to .env.local before running this command.");

const pool = new Pool({ connectionString });
const statements = [
  "CREATE SCHEMA IF NOT EXISTS food_catalog.app",
  `CREATE TABLE IF NOT EXISTS food_catalog.app.push_subscriptions (
    endpoint TEXT PRIMARY KEY, user_id UUID NOT NULL, profile_id UUID NOT NULL,
    p256dh TEXT NOT NULL, auth TEXT NOT NULL, device_name TEXT NOT NULL DEFAULT 'This device',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), revoked_at TIMESTAMPTZ NULL
  )`,
  "CREATE INDEX IF NOT EXISTS push_subscriptions_user_active_idx ON food_catalog.app.push_subscriptions (user_id, updated_at DESC) WHERE revoked_at IS NULL",
  `CREATE TABLE IF NOT EXISTS food_catalog.app.reminder_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL, profile_id UUID NOT NULL,
    kind TEXT NOT NULL, local_date DATE NOT NULL, scheduled_for TIMESTAMPTZ NOT NULL,
    title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    delivery_count INT NOT NULL DEFAULT 0, attempts INT NOT NULL DEFAULT 0,
    sent_at TIMESTAMPTZ NULL, failed_at TIMESTAMPTZ NULL, last_error TEXT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reminder_deliveries_status_check CHECK (status IN ('pending', 'sent', 'failed')),
    CONSTRAINT reminder_deliveries_daily_unique UNIQUE (user_id, kind, local_date)
  )`,
  "CREATE INDEX IF NOT EXISTS reminder_deliveries_profile_date_idx ON food_catalog.app.reminder_deliveries (profile_id, local_date DESC)",
];

try {
  for (const statement of statements) await pool.query(statement);
  console.log("Notification storage schema is ready.");
} finally {
  await pool.end();
}
