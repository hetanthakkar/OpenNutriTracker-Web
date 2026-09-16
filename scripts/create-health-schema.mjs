import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required. Add it to .env.local before running this command.");

const pool = new Pool({ connectionString });
const statements = [
  "CREATE SCHEMA IF NOT EXISTS food_catalog.app",
  `CREATE TABLE IF NOT EXISTS food_catalog.app.health_ingest_tokens (
    user_id UUID PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), revoked_at TIMESTAMPTZ NULL
  )`,
  `CREATE TABLE IF NOT EXISTS food_catalog.app.health_sync_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL,
    profile_id UUID NULL, payload JSONB NOT NULL, payload_hash TEXT NULL,
    status TEXT NOT NULL DEFAULT 'received', processed_summary JSONB NULL,
    error_message TEXT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT now(), processed_at TIMESTAMPTZ NULL
  )`,
  "ALTER TABLE food_catalog.app.health_sync_events ADD COLUMN IF NOT EXISTS profile_id UUID NULL",
  "ALTER TABLE food_catalog.app.health_sync_events ADD COLUMN IF NOT EXISTS payload_hash TEXT NULL",
  "ALTER TABLE food_catalog.app.health_sync_events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'received'",
  "ALTER TABLE food_catalog.app.health_sync_events ADD COLUMN IF NOT EXISTS processed_summary JSONB NULL",
  "ALTER TABLE food_catalog.app.health_sync_events ADD COLUMN IF NOT EXISTS error_message TEXT NULL",
  "ALTER TABLE food_catalog.app.health_sync_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS health_sync_events_user_payload_hash_idx ON food_catalog.app.health_sync_events (user_id, payload_hash)",
  `CREATE TABLE IF NOT EXISTS food_catalog.app.health_measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL, profile_id UUID NOT NULL,
    metric_code TEXT NOT NULL, measured_at TIMESTAMPTZ NOT NULL, value NUMERIC NOT NULL,
    unit TEXT NOT NULL, source_event_id UUID NOT NULL, fingerprint TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS health_measurements_profile_fingerprint_idx ON food_catalog.app.health_measurements (profile_id, fingerprint)",
  "CREATE INDEX IF NOT EXISTS health_measurements_profile_metric_date_idx ON food_catalog.app.health_measurements (profile_id, metric_code, measured_at DESC)",
  "ALTER TABLE food_catalog.app.weight_entries ADD COLUMN IF NOT EXISTS health_fingerprint TEXT NULL",
  "ALTER TABLE food_catalog.app.activity_entries ADD COLUMN IF NOT EXISTS health_fingerprint TEXT NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS weight_entries_profile_health_fingerprint_idx ON food_catalog.app.weight_entries (profile_id, health_fingerprint)",
  "CREATE UNIQUE INDEX IF NOT EXISTS activity_entries_profile_health_fingerprint_idx ON food_catalog.app.activity_entries (profile_id, health_fingerprint)",
];

try {
  for (const statement of statements) await pool.query(statement);
  console.log("Health integration schema is ready.");
} finally {
  await pool.end();
}
