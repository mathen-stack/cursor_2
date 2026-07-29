import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type SqlClient = NeonQueryFunction<false, false>;

function resolveDatabaseUrl(): string | null {
  const value =
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.CUSTOM_DATABASE_URL?.trim() ||
    "";
  return value || null;
}

export function hasDatabaseUrl(): boolean {
  return Boolean(resolveDatabaseUrl());
}

export function getDatabasePersistenceLabel(): "postgres" | "file" {
  return hasDatabaseUrl() ? "postgres" : "file";
}

let sqlClient: SqlClient | null = null;
let schemaReady: Promise<void> | null = null;

export function getSql(): SqlClient {
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }
  if (!sqlClient) {
    sqlClient = neon(databaseUrl);
  }
  return sqlClient;
}

export async function ensureDatabaseSchema(): Promise<SqlClient> {
  const sql = getSql();
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS accounts (
          username TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
          status TEXT NOT NULL CHECK (status IN ('pending', 'approved')),
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          updated_by TEXT NOT NULL
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS profiles (
          username TEXT PRIMARY KEY REFERENCES accounts(username)
            ON DELETE CASCADE ON UPDATE CASCADE,
          saved_at TIMESTAMPTZ NOT NULL,
          updated_by TEXT NOT NULL,
          profile JSONB NOT NULL
        )
      `;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
  return sql;
}

/** Test helper — reset cached client between cases. */
export function resetDatabaseClientForTests(): void {
  sqlClient = null;
  schemaReady = null;
}
