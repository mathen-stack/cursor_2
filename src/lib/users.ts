import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type { CandidateProfile } from "./types";
import { emptyProfile, parseProfileDraft } from "./profile";

export type StoredUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  profile?: CandidateProfile;
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

async function readStore(): Promise<UserStore> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as UserStore;
    if (!parsed || !Array.isArray(parsed.users)) return { users: [] };
    return parsed;
  } catch {
    return { users: [] };
  }
}

async function writeStore(store: UserStore) {
  const dir = path.dirname(storePath());
  await mkdir(dir, { recursive: true });
  await writeFile(storePath(), JSON.stringify(store, null, 2), "utf8");
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

export async function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<StoredUser> {
  return enqueue(async () => {
    const store = await readStore();
    const email = input.email.trim().toLowerCase();
    if (store.users.some((user) => user.email === email)) {
      throw new Error("An account with that email already exists.");
    }
    const user: StoredUser = {
      id: randomUUID(),
      name: input.name.trim(),
      email,
      passwordHash: input.passwordHash,
      createdAt: new Date().toISOString(),
      profile: {
        ...emptyProfile(),
        personal: {
          ...emptyProfile().personal,
          name: input.name.trim(),
          email,
        },
      },
    };
    store.users.push(user);
    await writeStore(store);
    return user;
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
