import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type { CandidateProfile } from "./types";
import { emptyProfile, parseProfileDraft } from "./profile";

export type UserRole = "admin" | "user";

export type StoredUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  role: UserRole;
  profile?: CandidateProfile;
};

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  profile: CandidateProfile;
};

type UserStore = {
  users: StoredUser[];
};

function storePath() {
  return path.join(process.cwd(), "data", "users.json");
}

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function asRole(value: unknown): UserRole {
  return value === "admin" ? "admin" : "user";
}

function normalizeStore(store: UserStore): { store: UserStore; changed: boolean } {
  let changed = false;
  const users = store.users.map((user) => {
    const role = asRole(user.role);
    if (user.role !== role) changed = true;
    return { ...user, role };
  });

  if (users.length && !users.some((user) => user.role === "admin")) {
    const oldest = [...users].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )[0];
    oldest.role = "admin";
    changed = true;
  }

  return { store: { users }, changed };
}

async function readStore(): Promise<UserStore> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as UserStore;
    if (!parsed || !Array.isArray(parsed.users)) return { users: [] };
    return normalizeStore(parsed).store;
  } catch {
    return { users: [] };
  }
}

async function writeStore(store: UserStore) {
  const dir = path.dirname(storePath());
  await mkdir(dir, { recursive: true });
  const { store: normalized } = normalizeStore(store);
  await writeFile(storePath(), JSON.stringify(normalized, null, 2), "utf8");
}

function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    profile: profileFromUser(user),
  };
}

export function userRole(user: StoredUser | null | undefined): UserRole {
  return user?.role === "admin" ? "admin" : "user";
}

export function isAdminUser(user: StoredUser | null | undefined): boolean {
  return userRole(user) === "admin";
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const store = await readStore();
  const needle = email.trim().toLowerCase();
  return store.users.find((user) => user.email === needle) ?? null;
}

export async function findUserById(id: string): Promise<StoredUser | null> {
  const store = await readStore();
  return store.users.find((user) => user.id === id) ?? null;
}

export async function listPublicUsers(): Promise<PublicUser[]> {
  const store = await readStore();
  return store.users
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toPublicUser);
}

export async function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
}): Promise<StoredUser> {
  return enqueue(async () => {
    const store = await readStore();
    const email = input.email.trim().toLowerCase();
    if (store.users.some((user) => user.email === email)) {
      throw new Error("An account with that email already exists.");
    }
    const hasAdmin = store.users.some((user) => user.role === "admin");
    const role: UserRole = !hasAdmin
      ? "admin"
      : input.role === "admin"
        ? "admin"
        : "user";
    const name = input.name.trim();
    const user: StoredUser = {
      id: randomUUID(),
      name,
      email,
      passwordHash: input.passwordHash,
      createdAt: new Date().toISOString(),
      role,
      profile: {
        ...emptyProfile(),
        personal: {
          ...emptyProfile().personal,
          name,
          email,
        },
      },
    };
    store.users.push(user);
    await writeStore(store);
    return user;
  });
}

export async function updateUserAccount(
  userId: string,
  input: {
    name: string;
    email: string;
    role: UserRole;
    passwordHash?: string;
  },
): Promise<PublicUser> {
  return enqueue(async () => {
    const store = await readStore();
    const user = store.users.find((entry) => entry.id === userId);
    if (!user) throw new Error("Account not found.");

    const email = input.email.trim().toLowerCase();
    if (
      store.users.some((entry) => entry.id !== userId && entry.email === email)
    ) {
      throw new Error("An account with that email already exists.");
    }

    const nextRole = input.role === "admin" ? "admin" : "user";
    if (user.role === "admin" && nextRole !== "admin") {
      const otherAdmins = store.users.filter(
        (entry) => entry.id !== userId && entry.role === "admin",
      );
      if (!otherAdmins.length) {
        throw new Error("Keep at least one administrator.");
      }
    }

    user.name = input.name.trim();
    user.email = email;
    user.role = nextRole;
    if (input.passwordHash) user.passwordHash = input.passwordHash;
    if (user.profile?.personal) {
      user.profile = {
        ...user.profile,
        personal: {
          ...user.profile.personal,
          name: user.name,
          email: user.email,
        },
      };
    }
    await writeStore(store);
    return toPublicUser(user);
  });
}

export async function deleteUser(userId: string): Promise<void> {
  await enqueue(async () => {
    const store = await readStore();
    const user = store.users.find((entry) => entry.id === userId);
    if (!user) throw new Error("Account not found.");
    if (user.role === "admin") {
      const otherAdmins = store.users.filter(
        (entry) => entry.id !== userId && entry.role === "admin",
      );
      if (!otherAdmins.length) {
        throw new Error("Keep at least one administrator.");
      }
    }
    store.users = store.users.filter((entry) => entry.id !== userId);
    await writeStore(store);
  });
}

export async function saveUserProfile(
  userId: string,
  profile: CandidateProfile,
): Promise<void> {
  await enqueue(async () => {
    const store = await readStore();
    const user = store.users.find((entry) => entry.id === userId);
    if (!user) throw new Error("Account not found.");
    user.profile = parseProfileDraft(profile) ?? emptyProfile();
    await writeStore(store);
  });
}

export function profileFromUser(user: StoredUser | null): CandidateProfile {
  if (!user?.profile) return emptyProfile();
  return parseProfileDraft(user.profile) ?? emptyProfile();
}
