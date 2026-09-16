import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required. Add it to .env.local before running this command.");

const pool = new Pool({ connectionString });
const run = (statement) => pool.query(statement);

try {
  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.sharing_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_profile_id UUID NOT NULL REFERENCES food_catalog.app.profiles(id),
    invitee_name TEXT NOT NULL,
    invitee_email TEXT NOT NULL,
    relationship TEXT NOT NULL CHECK (relationship IN ('partner','family_member','coach','healthcare_professional')),
    invitee_user_id UUID NULL REFERENCES food_catalog.app.users(id),
    token_hash TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired','revoked')),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    send_count INT8 NOT NULL DEFAULT 1,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX sharing_invitations_owner_status_idx (owner_profile_id, status, created_at DESC),
    INDEX sharing_invitations_invitee_idx (invitee_user_id, status)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.sharing_invitation_permissions (
    invitation_id UUID NOT NULL REFERENCES food_catalog.app.sharing_invitations(id) ON DELETE CASCADE,
    permission_code TEXT NOT NULL CHECK (permission_code IN ('calorie_total','macro_totals','meal_names_portions','water_intake','activity','weight_trend','goal_progress')),
    PRIMARY KEY (invitation_id, permission_code)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.profile_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_profile_id UUID NOT NULL REFERENCES food_catalog.app.profiles(id),
    viewer_user_id UUID NOT NULL REFERENCES food_catalog.app.users(id),
    relationship TEXT NOT NULL CHECK (relationship IN ('partner','family_member','coach','healthcare_professional')),
    connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ NULL,
    notify_owner_on_view BOOL NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner_profile_id, viewer_user_id),
    INDEX profile_shares_viewer_idx (viewer_user_id, revoked_at),
    INDEX profile_shares_owner_idx (owner_profile_id, revoked_at)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.profile_share_permissions (
    share_id UUID NOT NULL REFERENCES food_catalog.app.profile_shares(id) ON DELETE CASCADE,
    permission_code TEXT NOT NULL CHECK (permission_code IN ('calorie_total','macro_totals','meal_names_portions','water_intake','activity','weight_trend','goal_progress')),
    PRIMARY KEY (share_id, permission_code)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.share_view_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID NOT NULL REFERENCES food_catalog.app.profile_shares(id) ON DELETE CASCADE,
    viewer_user_id UUID NOT NULL REFERENCES food_catalog.app.users(id),
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX share_view_events_share_viewed_idx (share_id, viewed_at DESC)
  )`);
  console.log("Partner-sharing schema is ready.");
} finally {
  await pool.end();
}
