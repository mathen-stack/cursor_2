import type { AccountStatus, PublicAccount, StoredAccount } from "./user-account-store-types";
import { ensureDatabaseSchema } from "./db";

type AccountRow = {
  username: string;
  display_name: string;
  role: string;
  status: string;
  password_hash: string;
  password_salt: string;
  updated_at: string | Date;
  updated_by: string;
};

function toIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function mapAccountRow(row: AccountRow): StoredAccount {
  return {
    username: row.username,
    displayName: row.display_name,
    role: row.role === "admin" ? "admin" : "user",
    status: row.status === "pending" ? "pending" : "approved",
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    updatedAt: toIso(row.updated_at),
    updatedBy: row.updated_by,
  };
}

export async function dbListAccounts(): Promise<StoredAccount[]> {
  const sql = await ensureDatabaseSchema();
  const rows = (await sql`
    SELECT
      username,
      display_name,
      role,
      status,
      password_hash,
      password_salt,
      updated_at,
      updated_by
    FROM resume_accounts
    ORDER BY username ASC
  `) as AccountRow[];
  return rows.map(mapAccountRow);
}

export async function dbFindAccount(
  username: string,
): Promise<StoredAccount | null> {
  const sql = await ensureDatabaseSchema();
  const rows = (await sql`
    SELECT
      username,
      display_name,
      role,
      status,
      password_hash,
      password_salt,
      updated_at,
      updated_by
    FROM resume_accounts
    WHERE username = ${username}
    LIMIT 1
  `) as AccountRow[];
  const row = rows[0];
  return row ? mapAccountRow(row) : null;
}

export async function dbCountAccounts(): Promise<number> {
  const sql = await ensureDatabaseSchema();
  const rows = (await sql`SELECT COUNT(*)::int AS count FROM resume_accounts`) as Array<{
    count: number;
  }>;
  return Number(rows[0]?.count ?? 0);
}

export async function dbInsertAccount(account: StoredAccount): Promise<void> {
  const sql = await ensureDatabaseSchema();
  await sql`
    INSERT INTO resume_accounts (
      username,
      display_name,
      role,
      status,
      password_hash,
      password_salt,
      updated_at,
      updated_by
    ) VALUES (
      ${account.username},
      ${account.displayName},
      ${account.role},
      ${account.status},
      ${account.passwordHash},
      ${account.passwordSalt},
      ${account.updatedAt},
      ${account.updatedBy}
    )
  `;
}

export async function dbReplaceAccount(
  previousUsername: string,
  account: StoredAccount,
): Promise<void> {
  const sql = await ensureDatabaseSchema();
  if (previousUsername === account.username) {
    await sql`
      UPDATE resume_accounts
      SET
        display_name = ${account.displayName},
        role = ${account.role},
        status = ${account.status},
        password_hash = ${account.passwordHash},
        password_salt = ${account.passwordSalt},
        updated_at = ${account.updatedAt},
        updated_by = ${account.updatedBy}
      WHERE username = ${previousUsername}
    `;
    return;
  }
  await sql`
    UPDATE resume_accounts
    SET
      username = ${account.username},
      display_name = ${account.displayName},
      role = ${account.role},
      status = ${account.status},
      password_hash = ${account.passwordHash},
      password_salt = ${account.passwordSalt},
      updated_at = ${account.updatedAt},
      updated_by = ${account.updatedBy}
    WHERE username = ${previousUsername}
  `;
}

export async function dbDeleteAccount(username: string): Promise<boolean> {
  const sql = await ensureDatabaseSchema();
  const rows = (await sql`
    DELETE FROM resume_accounts
    WHERE username = ${username}
    RETURNING username
  `) as Array<{ username: string }>;
  return rows.length > 0;
}

export async function dbSeedAccountsIfEmpty(
  accounts: StoredAccount[],
): Promise<StoredAccount[]> {
  const count = await dbCountAccounts();
  if (count > 0) return dbListAccounts();
  for (const account of accounts) {
    await dbInsertAccount(account);
  }
  return dbListAccounts();
}

export function toPublicAccount(account: StoredAccount): PublicAccount {
  return {
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    status: account.status as AccountStatus,
    updatedAt: account.updatedAt,
    updatedBy: account.updatedBy,
  };
}
