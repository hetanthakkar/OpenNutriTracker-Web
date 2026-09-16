import { Pool, type PoolClient, type QueryResultRow } from "pg";

const databaseUrl = process.env.DATABASE_URL;

declare global {
  // Keep one pool while Next.js reloads route modules during local development.
  var ontDatabasePool: Pool | undefined;
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured");
    this.name = "DatabaseNotConfiguredError";
  }
}

export function isDatabaseConfigured(): boolean {
  return Boolean(databaseUrl);
}

export function getDatabasePool(): Pool {
  if (!databaseUrl) throw new DatabaseNotConfiguredError();

  if (!global.ontDatabasePool) {
    // Keep TLS settings in the CockroachDB connection URL supplied through the
    // environment. This avoids weakening certificate verification in code.
    global.ontDatabasePool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  return global.ontDatabasePool;
}

export async function databaseQuery<T extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
) {
  return getDatabasePool().query<T>(text, [...values]);
}

export async function withDatabaseTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const value = await callback(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
