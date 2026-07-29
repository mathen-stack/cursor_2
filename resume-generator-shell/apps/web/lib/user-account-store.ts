import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { UserRole } from "./auth-types";
import {
  deleteUserProfileRecord,
  readUserProfileRecord,
  sanitizeProfileUsername,
  writeUserProfileRecord,
} from "./user-profile-store";

export type StoredAccount = {
  username: string;
  displayName: string;
  role: UserRole;
  passwordHash: string;
  passwordSalt: string;
  updatedAt: string;
  updatedBy: string;
};

type AccountsFile = {
  version: 1;
  users: StoredAccount[];
};

export type PublicAccount = {
  username: string;
  displayName: string;
  role: UserRole;
  updatedAt: string;
  updatedBy: string;
};

function accountsRootDirectory(): string {
  const cwd = process.cwd();
  if (/[/\\]apps[/\\]web$/.test(cwd)) {
    return path.resolve(cwd, "..", "..", "data", "users");
  }
  if (existsSync(path.join(cwd, "resume-generator-shell", "package.json"))) {
    return path.resolve(cwd, "resume-generator-shell", "data", "users");
  }
  return path.resolve(cwd, "data", "users");
}

function accountsFilePath(): string {
  return path.join(accountsRootDirectory(), "accounts.json");
}

export function sanitizeUsername(username: string): string {
  return sanitizeProfileUsername(username);
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

function createPasswordRecord(password: string): {
  passwordHash: string;
  passwordSalt: string;
} {
  const passwordSalt = randomBytes(16).toString("hex");
  return {
    passwordSalt,
    passwordHash: hashPassword(password, passwordSalt),
  };
}

export function verifyPassword(
  password: string,
  passwordHash: string,
  passwordSalt: string,
): boolean {
  const next = Buffer.from(hashPassword(password, passwordSalt), "hex");
  const current = Buffer.from(passwordHash, "hex");
  if (next.length !== current.length) return false;
  return timingSafeEqual(next, current);
}

function defaultAccounts(): StoredAccount[] {
  const now = new Date().toISOString();
  return [
    {
      username: "admin",
      displayName: "admin",
      role: "admin",
      ...createPasswordRecord("admin123"),
      updatedAt: now,
      updatedBy: "system",
    },
    {
      username: "demo",
      displayName: "demo",
      role: "user",
      ...createPasswordRecord("demo123"),
      updatedAt: now,
      updatedBy: "system",
    },
  ];
}

function accountsFromEnv(): StoredAccount[] | null {
  const configured = process.env.RESUME_AUTH_USERS?.trim();
  if (!configured) return null;
  const now = new Date().toISOString();
  const users: StoredAccount[] = [];
  for (const part of configured.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [usernameRaw, passwordRaw, roleRaw] = trimmed.split(":");
    const username = sanitizeUsername(usernameRaw ?? "");
    const password = passwordRaw ?? "";
    if (!username || !password) continue;
    users.push({
      username,
      displayName: username,
      role: roleRaw?.trim().toLowerCase() === "admin" ? "admin" : "user",
      ...createPasswordRecord(password),
      updatedAt: now,
      updatedBy: "env",
    });
  }
  const adminNames = new Set(
    (process.env.RESUME_AUTH_ADMINS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  for (const user of users) {
    if (adminNames.has(user.username)) user.role = "admin";
  }
  return users.length > 0 ? users : null;
}

async function writeAccountsFile(users: StoredAccount[]): Promise<void> {
  const directory = accountsRootDirectory();
  await mkdir(directory, { recursive: true });
  const payload: AccountsFile = { version: 1, users };
  await writeFile(accountsFilePath(), JSON.stringify(payload, null, 2), "utf8");
}

export async function ensureAccountsFile(): Promise<StoredAccount[]> {
  try {
    const raw = await readFile(accountsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AccountsFile>;
    if (!Array.isArray(parsed.users) || parsed.users.length === 0) {
      throw new Error("empty");
    }
    return parsed.users.map((user) => ({
      username: sanitizeUsername(user.username),
      displayName:
        typeof user.displayName === "string" && user.displayName.trim()
          ? user.displayName.trim()
          : sanitizeUsername(user.username),
      role: user.role === "admin" ? "admin" : "user",
      passwordHash: String(user.passwordHash ?? ""),
      passwordSalt: String(user.passwordSalt ?? ""),
      updatedAt:
        typeof user.updatedAt === "string" && user.updatedAt
          ? user.updatedAt
          : new Date().toISOString(),
      updatedBy:
        typeof user.updatedBy === "string" && user.updatedBy
          ? user.updatedBy
          : "system",
    }));
  } catch {
    const seeded = accountsFromEnv() ?? defaultAccounts();
    await writeAccountsFile(seeded);
    return seeded;
  }
}

export async function listStoredAccounts(): Promise<StoredAccount[]> {
  const users = await ensureAccountsFile();
  return users.sort((left, right) => left.username.localeCompare(right.username));
}

export async function listPublicAccounts(): Promise<PublicAccount[]> {
  const users = await listStoredAccounts();
  return users.map((user) => ({
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    updatedAt: user.updatedAt,
    updatedBy: user.updatedBy,
  }));
}

export async function findStoredAccount(
  username: string,
): Promise<StoredAccount | null> {
  const safe = sanitizeUsername(username);
  const users = await listStoredAccounts();
  return users.find((user) => user.username === safe) ?? null;
}

export async function createStoredAccount(input: {
  username: string;
  password: string;
  role?: UserRole;
  updatedBy: string;
}): Promise<PublicAccount> {
  const username = sanitizeUsername(input.username);
  if (!username || username === "guest") {
    throw Object.assign(new Error("Enter a valid username."), { status: 400 });
  }
  if (!input.password || input.password.length < 6) {
    throw Object.assign(new Error("Password must be at least 6 characters."), {
      status: 400,
    });
  }
  const users = await listStoredAccounts();
  if (users.some((user) => user.username === username)) {
    throw Object.assign(new Error("That username is already taken."), {
      status: 409,
    });
  }
  const account: StoredAccount = {
    username,
    displayName: username,
    role: input.role === "admin" ? "admin" : "user",
    ...createPasswordRecord(input.password),
    updatedAt: new Date().toISOString(),
    updatedBy: sanitizeUsername(input.updatedBy),
  };
  users.push(account);
  await writeAccountsFile(users);
  return {
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    updatedAt: account.updatedAt,
    updatedBy: account.updatedBy,
  };
}

export async function updateStoredAccount(input: {
  username: string;
  nextUsername?: string;
  password?: string;
  role?: UserRole;
  updatedBy: string;
}): Promise<{ account: PublicAccount; renamedFrom: string | null }> {
  const currentUsername = sanitizeUsername(input.username);
  const users = await listStoredAccounts();
  const index = users.findIndex((user) => user.username === currentUsername);
  if (index < 0) {
    throw Object.assign(new Error("Unknown user account."), { status: 404 });
  }

  const current = users[index]!;
  let nextUsername = currentUsername;
  if (typeof input.nextUsername === "string" && input.nextUsername.trim()) {
    nextUsername = sanitizeUsername(input.nextUsername);
    if (!nextUsername || nextUsername === "guest") {
      throw Object.assign(new Error("Enter a valid username."), { status: 400 });
    }
    if (
      nextUsername !== currentUsername &&
      users.some((user) => user.username === nextUsername)
    ) {
      throw Object.assign(new Error("That username is already taken."), {
        status: 409,
      });
    }
  }

  if (typeof input.password === "string" && input.password.length > 0) {
    if (input.password.length < 6) {
      throw Object.assign(new Error("Password must be at least 6 characters."), {
        status: 400,
      });
    }
  }

  const nextRole =
    input.role === "admin" || input.role === "user" ? input.role : current.role;
  if (current.role === "admin" && nextRole !== "admin") {
    const remainingAdmins = users.filter(
      (user, userIndex) => userIndex !== index && user.role === "admin",
    );
    if (remainingAdmins.length === 0) {
      throw Object.assign(
        new Error("At least one administrator account is required."),
        { status: 400 },
      );
    }
  }

  const passwordRecord =
    typeof input.password === "string" && input.password.length > 0
      ? createPasswordRecord(input.password)
      : {
          passwordHash: current.passwordHash,
          passwordSalt: current.passwordSalt,
        };

  const updated: StoredAccount = {
    ...current,
    username: nextUsername,
    displayName: nextUsername,
    role: nextRole,
    ...passwordRecord,
    updatedAt: new Date().toISOString(),
    updatedBy: sanitizeUsername(input.updatedBy),
  };
  users[index] = updated;
  await writeAccountsFile(users);

  if (nextUsername !== currentUsername) {
    const existingProfile = await readUserProfileRecord(currentUsername);
    if (existingProfile) {
      await writeUserProfileRecord({
        username: nextUsername,
        profile: existingProfile.profile,
        updatedBy: input.updatedBy,
      });
      await deleteUserProfileRecord(currentUsername);
    }
  }

  return {
    renamedFrom: nextUsername !== currentUsername ? currentUsername : null,
    account: {
      username: updated.username,
      displayName: updated.displayName,
      role: updated.role,
      updatedAt: updated.updatedAt,
      updatedBy: updated.updatedBy,
    },
  };
}

/** Stable fingerprint for tests — not a secret. */
export function accountFingerprint(account: StoredAccount): string {
  return createHash("sha256")
    .update(`${account.username}:${account.role}:${account.passwordHash}`)
    .digest("hex")
    .slice(0, 12);
}
