import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { UserProfile } from "@resume/contracts";
import { getProfilesDirectory } from "./data-paths";
import {
  createEmptyProfile,
  normalizeStoredProfile,
} from "./saved-profile-store";

export type StoredUserProfileRecord = {
  version: 1;
  username: string;
  savedAt: string;
  updatedBy: string;
  profile: UserProfile;
};

export type UserProfileSummary = {
  username: string;
  savedAt: string;
  updatedBy: string;
  fullName: string;
  email: string;
  hasProfile: boolean;
};

function profilesRootDirectory(): string {
  return getProfilesDirectory();
}

export function sanitizeProfileUsername(username: string): string {
  return (
    username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "guest"
  );
}

function profileFilePath(username: string): string {
  return path.join(
    profilesRootDirectory(),
    `${sanitizeProfileUsername(username)}.json`,
  );
}

export async function readUserProfileRecord(
  username: string,
): Promise<StoredUserProfileRecord | null> {
  try {
    const raw = await readFile(profileFilePath(username), "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredUserProfileRecord>;
    const profile = normalizeStoredProfile(parsed.profile);
    if (!profile) return null;
    return {
      version: 1,
      username: sanitizeProfileUsername(username),
      savedAt:
        typeof parsed.savedAt === "string" && parsed.savedAt
          ? parsed.savedAt
          : new Date().toISOString(),
      updatedBy:
        typeof parsed.updatedBy === "string" && parsed.updatedBy
          ? parsed.updatedBy
          : sanitizeProfileUsername(username),
      profile,
    };
  } catch {
    return null;
  }
}

export async function writeUserProfileRecord(input: {
  username: string;
  profile: UserProfile;
  updatedBy: string;
}): Promise<StoredUserProfileRecord> {
  const username = sanitizeProfileUsername(input.username);
  const profile =
    normalizeStoredProfile(input.profile) ??
    createEmptyProfile();
  profile.profileId = `PROFILE-${username.toUpperCase()}`;
  const record: StoredUserProfileRecord = {
    version: 1,
    username,
    savedAt: new Date().toISOString(),
    updatedBy: sanitizeProfileUsername(input.updatedBy),
    profile,
  };
  const directory = profilesRootDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(profileFilePath(username), JSON.stringify(record, null, 2), "utf8");
  return record;
}

export async function deleteUserProfileRecord(username: string): Promise<boolean> {
  try {
    await unlink(profileFilePath(username));
    return true;
  } catch {
    return false;
  }
}

export async function listUserProfileSummaries(
  usernames: string[],
): Promise<UserProfileSummary[]> {
  const unique = Array.from(
    new Set(usernames.map((name) => sanitizeProfileUsername(name))),
  ).filter(Boolean);

  const summaries = await Promise.all(
    unique.map(async (username) => {
      const record = await readUserProfileRecord(username);
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
    }),
  );

  return summaries.sort((left, right) => left.username.localeCompare(right.username));
}

/** Used by tests / diagnostics — list files currently on disk. */
export async function listStoredProfileUsernames(): Promise<string[]> {
  try {
    const files = await readdir(profilesRootDirectory());
    return files
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.replace(/\.json$/i, ""))
      .sort();
  } catch {
    return [];
  }
}
