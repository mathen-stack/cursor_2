import type { UserProfile } from "@resume/contracts";
import {
  createEmptyProfile,
  normalizeStoredProfile,
} from "./saved-profile-store";
import { ensureDatabaseSchema } from "./db";
import type {
  StoredUserProfileRecord,
  UserProfileSummary,
} from "./user-profile-store-types";

type ProfileRow = {
  username: string;
  saved_at: string | Date;
  updated_by: string;
  profile: unknown;
};

function toIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function mapProfileRow(row: ProfileRow): StoredUserProfileRecord | null {
  const profile = normalizeStoredProfile(row.profile);
  if (!profile) return null;
  return {
    version: 1,
    username: row.username,
    savedAt: toIso(row.saved_at),
    updatedBy: row.updated_by,
    profile,
  };
}

export async function dbReadProfile(
  username: string,
): Promise<StoredUserProfileRecord | null> {
  const sql = await ensureDatabaseSchema();
  const rows = (await sql`
    SELECT username, saved_at, updated_by, profile
    FROM resume_profiles
    WHERE username = ${username}
    LIMIT 1
  `) as ProfileRow[];
  const row = rows[0];
  return row ? mapProfileRow(row) : null;
}

export async function dbWriteProfile(input: {
  username: string;
  profile: UserProfile;
  updatedBy: string;
}): Promise<StoredUserProfileRecord> {
  const sql = await ensureDatabaseSchema();
  const profile =
    normalizeStoredProfile(input.profile) ?? createEmptyProfile();
  profile.profileId = `PROFILE-${input.username.toUpperCase()}`;
  const savedAt = new Date().toISOString();
  const updatedBy = input.updatedBy;
  await sql`
    INSERT INTO resume_profiles (username, saved_at, updated_by, profile)
    VALUES (
      ${input.username},
      ${savedAt},
      ${updatedBy},
      ${profile}
    )
    ON CONFLICT (username) DO UPDATE SET
      saved_at = EXCLUDED.saved_at,
      updated_by = EXCLUDED.updated_by,
      profile = EXCLUDED.profile
  `;
  return {
    version: 1,
    username: input.username,
    savedAt,
    updatedBy,
    profile,
  };
}

export async function dbDeleteProfile(username: string): Promise<boolean> {
  const sql = await ensureDatabaseSchema();
  const rows = (await sql`
    DELETE FROM resume_profiles
    WHERE username = ${username}
    RETURNING username
  `) as Array<{ username: string }>;
  return rows.length > 0;
}

export async function dbListProfileSummaries(
  usernames: string[],
): Promise<UserProfileSummary[]> {
  if (usernames.length === 0) return [];
  const sql = await ensureDatabaseSchema();
  const rows = (await sql`
    SELECT username, saved_at, updated_by, profile
    FROM resume_profiles
  `) as ProfileRow[];
  const wanted = new Set(usernames);
  const byUsername = new Map(
    rows
      .filter((row) => wanted.has(row.username))
      .map((row) => [row.username, mapProfileRow(row)] as const),
  );
  return usernames
    .map((username) => {
      const record = byUsername.get(username) ?? null;
      if (!record) {
        return {
          username,
          savedAt: "",
          updatedBy: "",
          fullName: "",
          email: "",
          hasProfile: false,
        } satisfies UserProfileSummary;
      }
      return {
        username,
        savedAt: record.savedAt,
        updatedBy: record.updatedBy,
        fullName: record.profile.personalInformation.fullName,
        email: record.profile.personalInformation.email,
        hasProfile: true,
      } satisfies UserProfileSummary;
    })
    .sort((left, right) => left.username.localeCompare(right.username));
}

export async function dbListProfileUsernames(): Promise<string[]> {
  const sql = await ensureDatabaseSchema();
  const rows = (await sql`
    SELECT username FROM resume_profiles ORDER BY username ASC
  `) as Array<{ username: string }>;
  return rows.map((row) => row.username);
}
