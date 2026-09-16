import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { DatabaseNotConfiguredError, databaseQuery, withDatabaseTransaction } from "@/lib/db";
import { attachCurrentUserCookie, getOrCreateCurrentUser } from "@/lib/current-user";
import { parseHealthPayload } from "@/lib/health-import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EventRow = {
  id: string;
  received_at: string;
  processed_at: string | null;
  status: "received" | "processed" | "failed";
  processed_summary: { measurements?: number; weights?: number; workouts?: number } | null;
  error_message: string | null;
};

type ProfileRow = { profile_id: string | null };

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(kind: string, value: Record<string, unknown>) {
  return hash(`${kind}:${stableJson(value)}`);
}

function entryDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Read configuration and the outcome of the latest Conduit delivery for this browser profile. */
export async function GET(request: NextRequest) {
  try {
    const user = await getOrCreateCurrentUser(request);
    const [events, tokens] = await Promise.all([
      databaseQuery<EventRow>(
        `SELECT id, received_at::text, processed_at::text, status, processed_summary, error_message
         FROM food_catalog.app.health_sync_events WHERE user_id = $1
         ORDER BY received_at DESC LIMIT 1`,
        [user.id],
      ),
      databaseQuery("SELECT 1 FROM food_catalog.app.health_ingest_tokens WHERE user_id = $1 AND revoked_at IS NULL", [user.id]),
    ]);
    const latest = events.rows[0] ?? null;
    return attachCurrentUserCookie(NextResponse.json({
      configured: Boolean(tokens.rowCount),
      connected: Boolean(latest),
      latest: latest ? {
        receivedAt: latest.received_at,
        processedAt: latest.processed_at,
        status: latest.status,
        summary: latest.processed_summary ?? { measurements: 0, weights: 0, workouts: 0 },
        error: latest.error_message,
      } : null,
    }), user);
  } catch (error) {
    console.error("Read health status failed", error);
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Health status is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}

/**
 * Receive Conduit data, retain the original payload, and immediately map recognized
 * weight, workout, and daily health measurements into the active profile.
 */
export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ message: "Bearer token required." }, { status: 401 });

  let payload: Record<string, unknown>;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid payload");
    payload = body as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "Request body must be a JSON object." }, { status: 400 });
  }
  const serializedPayload = JSON.stringify(payload);
  if (serializedPayload.length > 250_000) return NextResponse.json({ message: "Health payload is too large." }, { status: 413 });

  let eventId: string | null = null;
  try {
    const tokenResult = await databaseQuery<{ user_id: string }>(
      "SELECT user_id FROM food_catalog.app.health_ingest_tokens WHERE token_hash = $1 AND revoked_at IS NULL",
      [hash(token)],
    );
    const tokenOwner = tokenResult.rows[0];
    if (!tokenOwner) return NextResponse.json({ message: "Invalid or revoked token." }, { status: 401 });

    const profileResult = await databaseQuery<ProfileRow>(
      `SELECT COALESCE(pref.current_profile_id, (
         SELECT id FROM food_catalog.app.profiles WHERE owner_user_id = $1 ORDER BY created_at, id LIMIT 1
       )) AS profile_id
       FROM food_catalog.app.user_preferences pref WHERE pref.user_id = $1`,
      [tokenOwner.user_id],
    );
    const profileId = profileResult.rows[0]?.profile_id;
    if (!profileId) return NextResponse.json({ message: "No destination profile is available for this token." }, { status: 409 });

    const eventResult = await databaseQuery<{ id: string }>(
      `INSERT INTO food_catalog.app.health_sync_events (user_id, profile_id, payload, payload_hash)
       VALUES ($1, $2, $3::JSONB, $4)
       ON CONFLICT (user_id, payload_hash) DO NOTHING
       RETURNING id`,
      [tokenOwner.user_id, profileId, serializedPayload, hash(serializedPayload)],
    );
    const event = eventResult.rows[0];
    if (!event) return NextResponse.json({ status: "duplicate" });
    eventId = event.id;

    const parsed = parseHealthPayload(payload);
    const summary = await withDatabaseTransaction(async (client) => {
      let measurements = 0;
      let weights = 0;
      let workouts = 0;
      for (const item of parsed.measurements) {
        const result = await client.query(
          `INSERT INTO food_catalog.app.health_measurements
             (user_id, profile_id, metric_code, measured_at, value, unit, source_event_id, fingerprint)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (profile_id, fingerprint) DO NOTHING`,
          [tokenOwner.user_id, profileId, item.metricCode, item.measuredAt.toISOString(), item.value, item.unit, event.id, fingerprint(item.metricCode, item.fingerprintSource)],
        );
        measurements += result.rowCount ?? 0;
      }
      for (const item of parsed.weights) {
        const result = await client.query(
          `INSERT INTO food_catalog.app.weight_entries
             (user_id, profile_id, weight_kg, recorded_at, source, health_fingerprint)
           VALUES ($1, $2, $3, $4, 'apple_health', $5)
           ON CONFLICT (profile_id, health_fingerprint) DO NOTHING`,
          [tokenOwner.user_id, profileId, item.value, item.measuredAt.toISOString(), fingerprint("weight", item.fingerprintSource)],
        );
        weights += result.rowCount ?? 0;
      }
      for (const item of parsed.workouts) {
        const result = await client.query(
          `INSERT INTO food_catalog.app.activity_entries
             (user_id, profile_id, diary_date, activity_name, duration_minutes, energy_kcal, logged_at, source, health_fingerprint)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'apple_health', $8)
           ON CONFLICT (profile_id, health_fingerprint) DO NOTHING`,
          [tokenOwner.user_id, profileId, entryDate(item.loggedAt), item.name, item.durationMinutes, item.energyKcal, item.loggedAt.toISOString(), fingerprint("workout", item.fingerprintSource)],
        );
        workouts += result.rowCount ?? 0;
      }
      const imported = { measurements, weights, workouts };
      await client.query(
        `UPDATE food_catalog.app.health_sync_events
         SET status = 'processed', processed_at = now(), processed_summary = $2::JSONB, error_message = NULL
         WHERE id = $1`,
        [event.id, JSON.stringify(imported)],
      );
      return imported;
    });
    return NextResponse.json({ status: "processed", imported: summary }, { status: 202 });
  } catch (error) {
    console.error("Health ingestion failed", error);
    if (eventId) {
      try {
        await databaseQuery(
          "UPDATE food_catalog.app.health_sync_events SET status = 'failed', error_message = $2 WHERE id = $1",
          [eventId, error instanceof Error ? error.message.slice(0, 500) : "Unknown import error"],
        );
      } catch (statusError) {
        console.error("Could not record health import failure", statusError);
      }
    }
    const message = error instanceof DatabaseNotConfiguredError ? "Set DATABASE_URL on the server." : "Health ingestion is temporarily unavailable.";
    return NextResponse.json({ message }, { status: 503 });
  }
}
