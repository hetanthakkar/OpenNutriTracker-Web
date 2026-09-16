import { DatabaseNotConfiguredError, databaseQuery, isDatabaseConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DatabaseStatusRow = {
  connected_at: string;
  database_name: string;
};

/** Server-only readiness check. It exposes no credentials or food data. */
export async function GET() {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { status: "not_configured", message: "Set DATABASE_URL on the server." },
      { status: 503 },
    );
  }

  try {
    const result = await databaseQuery<DatabaseStatusRow>(
      "SELECT now()::text AS connected_at, current_database() AS database_name",
    );
    const database = result.rows[0];

    return Response.json({
      status: "ok",
      database: database.database_name,
      connectedAt: database.connected_at,
    });
  } catch (error) {
    console.error("CockroachDB readiness check failed", error);
    const message = error instanceof DatabaseNotConfiguredError
      ? "Set DATABASE_URL on the server."
      : "Database connection failed.";
    return Response.json({ status: "unavailable", message }, { status: 503 });
  }
}
