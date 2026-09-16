import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required. Add it to .env.local before running this command.");

const pool = new Pool({ connectionString });
const run = (statement) => pool.query(statement);

async function addForeignKey(table, name, target) {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.table_constraints
     WHERE table_catalog = 'food_catalog' AND table_schema = 'app'
       AND table_name = $1 AND constraint_name = $2`,
    [table, name],
  );
  if (!result.rowCount) await run(`ALTER TABLE food_catalog.app.${table} ADD CONSTRAINT ${name} FOREIGN KEY (profile_id) REFERENCES ${target}`);
}

try {
  await run("CREATE SCHEMA IF NOT EXISTS food_catalog.app");
  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.users (
    id UUID PRIMARY KEY, display_name TEXT NOT NULL DEFAULT 'New member', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await run("ALTER TABLE food_catalog.app.users ADD COLUMN IF NOT EXISTS auth_subject TEXT NULL");
  await run("ALTER TABLE food_catalog.app.users ADD COLUMN IF NOT EXISTS email TEXT NULL");
  await run("ALTER TABLE food_catalog.app.users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NULL");
  await run("ALTER TABLE food_catalog.app.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()");
  await run("CREATE UNIQUE INDEX IF NOT EXISTS users_auth_subject_idx ON food_catalog.app.users (auth_subject) WHERE auth_subject IS NOT NULL");
  await run("CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON food_catalog.app.users (email) WHERE email IS NOT NULL");

  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id UUID NOT NULL REFERENCES food_catalog.app.users(id),
    name TEXT NOT NULL, avatar_url TEXT NULL, timezone TEXT NOT NULL DEFAULT 'UTC',
    height_cm NUMERIC NULL CHECK (height_cm IS NULL OR (height_cm >= 80 AND height_cm <= 250)),
    date_of_birth DATE NULL, energy_equation_sex TEXT NULL CHECK (energy_equation_sex IS NULL OR energy_equation_sex IN ('female', 'male')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX profiles_owner_idx (owner_user_id, created_at)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.user_preferences (
    user_id UUID PRIMARY KEY, preferences JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await run("ALTER TABLE food_catalog.app.user_preferences ADD COLUMN IF NOT EXISTS current_profile_id UUID NULL");
  await run(`INSERT INTO food_catalog.app.profiles (owner_user_id, name, height_cm)
    SELECT u.id, COALESCE(up.display_name, u.display_name, 'Profile'), up.height_cm
    FROM food_catalog.app.users u LEFT JOIN food_catalog.app.user_profiles up ON up.user_id = u.id
    WHERE NOT EXISTS (SELECT 1 FROM food_catalog.app.profiles p WHERE p.owner_user_id = u.id)`);
  await run(`INSERT INTO food_catalog.app.user_preferences (user_id, current_profile_id)
    SELECT u.id, (SELECT p.id FROM food_catalog.app.profiles p WHERE p.owner_user_id = u.id ORDER BY p.created_at, p.id LIMIT 1)
    FROM food_catalog.app.users u
    ON CONFLICT (user_id) DO UPDATE SET current_profile_id = COALESCE(food_catalog.app.user_preferences.current_profile_id, excluded.current_profile_id)`);

  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.profile_goals (
    profile_id UUID PRIMARY KEY REFERENCES food_catalog.app.profiles(id),
    goal_type TEXT NOT NULL DEFAULT 'maintain_weight' CHECK (goal_type IN ('lose_weight', 'maintain_weight', 'gain_weight')),
    activity_level TEXT NOT NULL DEFAULT 'active' CHECK (activity_level IN ('sedentary', 'light', 'active', 'very_active')),
    target_weight_kg NUMERIC NULL CHECK (target_weight_kg IS NULL OR (target_weight_kg >= 20 AND target_weight_kg <= 500)),
    weekly_rate_kg NUMERIC NULL CHECK (weekly_rate_kg IS NULL OR (weekly_rate_kg >= -2 AND weekly_rate_kg <= 2)),
    water_goal_ml INT8 NOT NULL DEFAULT 1900 CHECK (water_goal_ml BETWEEN 250 AND 10000),
    calorie_adjustment_kcal INT8 NOT NULL DEFAULT 0 CHECK (calorie_adjustment_kcal BETWEEN -2000 AND 2000),
    carbs_pct NUMERIC NOT NULL DEFAULT 60, fat_pct NUMERIC NOT NULL DEFAULT 25, protein_pct NUMERIC NOT NULL DEFAULT 15,
    breakfast_pct NUMERIC NOT NULL DEFAULT 25, lunch_pct NUMERIC NOT NULL DEFAULT 35, dinner_pct NUMERIC NOT NULL DEFAULT 30, snack_pct NUMERIC NOT NULL DEFAULT 10,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT profile_goals_macros_total CHECK (carbs_pct + fat_pct + protein_pct = 100),
    CONSTRAINT profile_goals_meals_total CHECK (breakfast_pct + lunch_pct + dinner_pct + snack_pct = 100)
  )`);
  await run(`INSERT INTO food_catalog.app.profile_goals (profile_id, goal_type, activity_level, target_weight_kg, weekly_rate_kg, water_goal_ml)
    SELECT p.id, COALESCE(up.goal, 'maintain_weight'), COALESCE(up.activity_level, 'active'), up.target_weight_kg, up.weekly_rate_kg, COALESCE(up.water_goal_ml, 1900)
    FROM food_catalog.app.profiles p LEFT JOIN food_catalog.app.user_profiles up ON up.user_id = p.owner_user_id
    ON CONFLICT (profile_id) DO NOTHING`);

  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.nutrient_definitions (
    code TEXT PRIMARY KEY, display_name TEXT NOT NULL, group_name TEXT NOT NULL, canonical_unit TEXT NOT NULL,
    hierarchy_level INT4 NOT NULL DEFAULT 0, sort_order INT4 NOT NULL,
    target_kind TEXT NOT NULL CHECK (target_kind IN ('minimum', 'maximum', 'target', 'none')), default_target NUMERIC NULL
  )`);
  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.profile_nutrient_targets (
    profile_id UUID NOT NULL REFERENCES food_catalog.app.profiles(id), nutrient_code TEXT NOT NULL REFERENCES food_catalog.app.nutrient_definitions(code),
    target_value NUMERIC NULL, target_kind TEXT NOT NULL CHECK (target_kind IN ('minimum', 'maximum', 'target', 'none')),
    PRIMARY KEY (profile_id, nutrient_code)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.user_visible_nutrients (
    user_id UUID NOT NULL REFERENCES food_catalog.app.users(id), nutrient_code TEXT NOT NULL REFERENCES food_catalog.app.nutrient_definitions(code),
    sort_order INT4 NOT NULL, PRIMARY KEY (user_id, nutrient_code)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.daily_plan_snapshots (
    profile_id UUID NOT NULL REFERENCES food_catalog.app.profiles(id), diary_date DATE NOT NULL,
    base_expenditure_kcal NUMERIC NULL, weight_goal_adjustment_kcal NUMERIC NULL,
    activity_adjustment_kcal NUMERIC NOT NULL DEFAULT 0, manual_adjustment_kcal NUMERIC NOT NULL DEFAULT 0,
    calorie_goal_kcal NUMERIC NOT NULL, carbs_target_g NUMERIC NULL, fat_target_g NUMERIC NULL, protein_target_g NUMERIC NULL,
    water_target_ml INT8 NULL, nutrient_targets JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), finalized_at TIMESTAMPTZ NULL,
    PRIMARY KEY (profile_id, diary_date)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.diary_day_completions (
    profile_id UUID NOT NULL REFERENCES food_catalog.app.profiles(id), diary_date DATE NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (profile_id, diary_date)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.sharing_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_profile_id UUID NOT NULL REFERENCES food_catalog.app.profiles(id),
    invitee_name TEXT NOT NULL, invitee_email TEXT NOT NULL,
    relationship TEXT NOT NULL CHECK (relationship IN ('partner','family_member','coach','healthcare_professional')),
    invitee_user_id UUID NULL REFERENCES food_catalog.app.users(id), token_hash TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired','revoked')),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(), send_count INT8 NOT NULL DEFAULT 1,
    expires_at TIMESTAMPTZ NOT NULL, accepted_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX sharing_invitations_owner_status_idx (owner_profile_id, status, created_at DESC),
    INDEX sharing_invitations_invitee_idx (invitee_user_id, status)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.sharing_invitation_permissions (
    invitation_id UUID NOT NULL REFERENCES food_catalog.app.sharing_invitations(id) ON DELETE CASCADE,
    permission_code TEXT NOT NULL CHECK (permission_code IN ('calorie_total','macro_totals','meal_names_portions','water_intake','activity','weight_trend','goal_progress')),
    PRIMARY KEY (invitation_id, permission_code)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.profile_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_profile_id UUID NOT NULL REFERENCES food_catalog.app.profiles(id),
    viewer_user_id UUID NOT NULL REFERENCES food_catalog.app.users(id),
    relationship TEXT NOT NULL CHECK (relationship IN ('partner','family_member','coach','healthcare_professional')),
    connected_at TIMESTAMPTZ NOT NULL DEFAULT now(), revoked_at TIMESTAMPTZ NULL,
    notify_owner_on_view BOOL NOT NULL DEFAULT false, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner_profile_id, viewer_user_id), INDEX profile_shares_viewer_idx (viewer_user_id, revoked_at),
    INDEX profile_shares_owner_idx (owner_profile_id, revoked_at)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.profile_share_permissions (
    share_id UUID NOT NULL REFERENCES food_catalog.app.profile_shares(id) ON DELETE CASCADE,
    permission_code TEXT NOT NULL CHECK (permission_code IN ('calorie_total','macro_totals','meal_names_portions','water_intake','activity','weight_trend','goal_progress')),
    PRIMARY KEY (share_id, permission_code)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.share_view_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), share_id UUID NOT NULL REFERENCES food_catalog.app.profile_shares(id) ON DELETE CASCADE,
    viewer_user_id UUID NOT NULL REFERENCES food_catalog.app.users(id), viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX share_view_events_share_viewed_idx (share_id, viewed_at DESC)
  )`);

  await run("ALTER TABLE food_catalog.app.diary_entries ADD COLUMN IF NOT EXISTS profile_id UUID NULL");
  await run("ALTER TABLE food_catalog.app.diary_entries ADD COLUMN IF NOT EXISTS diary_date DATE NULL");
  await run("ALTER TABLE food_catalog.app.diary_entries ADD COLUMN IF NOT EXISTS source_item_type TEXT NULL");
  await run("ALTER TABLE food_catalog.app.diary_entries ADD COLUMN IF NOT EXISTS source_item_id TEXT NULL");
  await run("ALTER TABLE food_catalog.app.diary_entries ADD COLUMN IF NOT EXISTS detail_snapshot TEXT NULL");
  await run("ALTER TABLE food_catalog.app.diary_entries ADD COLUMN IF NOT EXISTS image_url_snapshot TEXT NULL");
  await run("ALTER TABLE food_catalog.app.diary_entries ADD COLUMN IF NOT EXISTS source_snapshot TEXT NULL");
  await run("ALTER TABLE food_catalog.app.diary_entries ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'serving'");
  await run("ALTER TABLE food_catalog.app.diary_entries ADD COLUMN IF NOT EXISTS portion_id TEXT NULL");
  await run("ALTER TABLE food_catalog.app.diary_entries ADD COLUMN IF NOT EXISTS portion_label_snapshot TEXT NULL");
  await run("ALTER TABLE food_catalog.app.diary_entries ADD COLUMN IF NOT EXISTS gram_weight_per_portion NUMERIC NULL");
  await run("ALTER TABLE food_catalog.app.diary_entries ADD COLUMN IF NOT EXISTS nutrition_per_100_snapshot JSONB NULL");
  await run("ALTER TABLE food_catalog.app.diary_entries ADD COLUMN IF NOT EXISTS portion_options_snapshot JSONB NULL");
  await run("ALTER TABLE food_catalog.app.diary_entries ALTER COLUMN grams DROP NOT NULL");
  await run("ALTER TABLE food_catalog.app.diary_entries ADD COLUMN IF NOT EXISTS note TEXT NULL");
  await run("ALTER TABLE food_catalog.app.diary_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()");
  await run(`UPDATE food_catalog.app.diary_entries d SET profile_id = COALESCE(d.profile_id, p.id),
    diary_date = COALESCE(d.diary_date, (d.logged_at AT TIME ZONE p.timezone)::DATE),
    source_item_type = COALESCE(d.source_item_type, CASE WHEN d.catalog_food_id LIKE 'custom:%' THEN 'custom_food' WHEN d.catalog_food_id LIKE 'recipe:%' THEN 'recipe' ELSE 'food' END),
    source_item_id = COALESCE(d.source_item_id, CASE WHEN d.catalog_food_id LIKE 'custom:%' THEN substring(d.catalog_food_id, 8) WHEN d.catalog_food_id LIKE 'recipe:%' THEN substring(d.catalog_food_id, 8) ELSE d.catalog_food_id END),
    portion_label_snapshot = COALESCE(d.portion_label_snapshot, d.serving->>'msreDesc'),
    gram_weight_per_portion = COALESCE(d.gram_weight_per_portion, NULLIF(d.serving->>'gmWgt', '')::NUMERIC)
    FROM food_catalog.app.profiles p WHERE p.owner_user_id = d.user_id`);
  const mealChecks = await pool.query(`SELECT tc.constraint_name, cc.check_clause FROM food_catalog.information_schema.table_constraints tc
    JOIN food_catalog.information_schema.check_constraints cc ON cc.constraint_catalog = tc.constraint_catalog AND cc.constraint_schema = tc.constraint_schema AND cc.constraint_name = tc.constraint_name
    WHERE tc.table_catalog = 'food_catalog' AND tc.table_schema = 'app' AND tc.table_name = 'diary_entries' AND tc.constraint_type = 'CHECK'`);
  for (const row of mealChecks.rows) {
    if (String(row.check_clause).includes("meal_type") && String(row.check_clause).includes("breakfast")) {
      const safeName = `"${String(row.constraint_name).replaceAll('"', '""')}"`;
      await run(`ALTER TABLE food_catalog.app.diary_entries DROP CONSTRAINT ${safeName}`);
    }
  }
  await run("ALTER TABLE food_catalog.app.diary_entries ADD CONSTRAINT diary_entries_meal_type_v2_check CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack'))");
  for (const column of ["profile_id", "diary_date", "source_item_type", "source_item_id"]) await run(`ALTER TABLE food_catalog.app.diary_entries ALTER COLUMN ${column} SET NOT NULL`);
  await run("CREATE INDEX IF NOT EXISTS diary_entries_profile_date_idx ON food_catalog.app.diary_entries (profile_id, diary_date, logged_at)");

  for (const [table, timestamp] of [["water_entries", "logged_at"], ["activity_entries", "logged_at"], ["weight_entries", "recorded_at"]]) {
    await run(`ALTER TABLE food_catalog.app.${table} ADD COLUMN IF NOT EXISTS profile_id UUID NULL`);
    await run(`ALTER TABLE food_catalog.app.${table} ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'`);
    if (table !== "weight_entries") await run(`ALTER TABLE food_catalog.app.${table} ADD COLUMN IF NOT EXISTS diary_date DATE NULL`);
    if (table === "activity_entries") await run(`ALTER TABLE food_catalog.app.${table} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`);
    const dateUpdate = table === "weight_entries" ? "" : `, diary_date = COALESCE(e.diary_date, (e.${timestamp} AT TIME ZONE p.timezone)::DATE)`;
    await run(`UPDATE food_catalog.app.${table} e SET profile_id = COALESCE(e.profile_id, p.id)${dateUpdate} FROM food_catalog.app.profiles p WHERE p.owner_user_id = e.user_id`);
    await run(`ALTER TABLE food_catalog.app.${table} ALTER COLUMN profile_id SET NOT NULL`);
    if (table !== "weight_entries") await run(`ALTER TABLE food_catalog.app.${table} ALTER COLUMN diary_date SET NOT NULL`);
  }
  await run("CREATE INDEX IF NOT EXISTS water_entries_profile_date_idx ON food_catalog.app.water_entries (profile_id, diary_date, logged_at)");
  await run("CREATE INDEX IF NOT EXISTS activity_entries_profile_date_idx ON food_catalog.app.activity_entries (profile_id, diary_date, logged_at)");
  await run("CREATE INDEX IF NOT EXISTS weight_entries_profile_recorded_idx ON food_catalog.app.weight_entries (profile_id, recorded_at DESC)");

  for (const table of ["custom_foods", "recipes"]) {
    await run(`ALTER TABLE food_catalog.app.${table} ADD COLUMN IF NOT EXISTS profile_id UUID NULL`);
    await run(`UPDATE food_catalog.app.${table} e SET profile_id = COALESCE(e.profile_id, p.id) FROM food_catalog.app.profiles p WHERE p.owner_user_id = e.user_id`);
    await run(`ALTER TABLE food_catalog.app.${table} ALTER COLUMN profile_id SET NOT NULL`);
  }
  await run("CREATE INDEX IF NOT EXISTS custom_foods_profile_name_idx ON food_catalog.app.custom_foods (profile_id, food_name)");
  await run("CREATE INDEX IF NOT EXISTS recipes_profile_name_idx ON food_catalog.app.recipes (profile_id, recipe_name)");
  await run(`CREATE TABLE IF NOT EXISTS food_catalog.app.scanned_foods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES food_catalog.app.users(id),
    profile_id UUID NOT NULL REFERENCES food_catalog.app.profiles(id), catalog_food_id TEXT NOT NULL,
    barcode TEXT NULL, food_name TEXT NOT NULL, brand_name TEXT NULL, nutrients JSONB NOT NULL, portions JSONB NOT NULL,
    default_portion_id TEXT NULL, nutrition_basis TEXT NOT NULL, scan_count INT8 NOT NULL DEFAULT 1,
    first_scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (profile_id, catalog_food_id)
  )`);
  await run("CREATE INDEX IF NOT EXISTS scanned_foods_profile_recent_idx ON food_catalog.app.scanned_foods (profile_id, last_scanned_at DESC)");

  const preferenceFk = await pool.query(`SELECT 1 FROM information_schema.table_constraints WHERE table_catalog='food_catalog' AND table_schema='app' AND table_name='user_preferences' AND constraint_name='user_preferences_current_profile_fk'`);
  if (!preferenceFk.rowCount) await run("ALTER TABLE food_catalog.app.user_preferences ADD CONSTRAINT user_preferences_current_profile_fk FOREIGN KEY (current_profile_id) REFERENCES food_catalog.app.profiles(id)");
  for (const table of ["diary_entries", "water_entries", "activity_entries", "weight_entries", "custom_foods", "recipes", "scanned_foods"]) {
    await addForeignKey(table, `${table}_profile_fk`, "food_catalog.app.profiles(id)");
  }

  console.log("Core schema v2 is ready. Existing data was preserved and assigned to default profiles.");
} finally {
  await pool.end();
}
