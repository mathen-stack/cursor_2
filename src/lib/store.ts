import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import type { CandidateProfile } from "./types";
import { createBlankProfile } from "./profile";

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  profile: CandidateProfile;
}

interface StoreShape {
  users: StoredUser[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "app.json");

let writeChain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readStore(): Promise<StoreShape> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    if (!parsed || !Array.isArray(parsed.users)) return { users: [] };
    return parsed;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { users: [] };
    throw err;
  }
}

async function writeStore(store: StoreShape): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await rename(tmp, STORE_PATH);
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const store = await readStore();
  const needle = email.trim().toLowerCase();
  return store.users.find((user) => user.email === needle) || null;
}

export async function findUserById(id: string): Promise<StoredUser | null> {
  const store = await readStore();
  return store.users.find((user) => user.id === id) || null;
}

export async function createUser(options: {
  email: string;
  passwordHash: string;
}): Promise<StoredUser> {
  return withLock(async () => {
    const store = await readStore();
    const email = options.email.trim().toLowerCase();
    if (store.users.some((user) => user.email === email)) {
      throw new Error("An account with this email already exists.");
    }

    const user: StoredUser = {
      id: crypto.randomUUID(),
      email,
      passwordHash: options.passwordHash,
      createdAt: new Date().toISOString(),
      profile: createBlankProfile(email),
    };
    store.users.push(user);
    await writeStore(store);
    return user;
  });
}

export async function updateUserProfile(
  userId: string,
  profile: CandidateProfile,
): Promise<StoredUser> {
  return withLock(async () => {
    const store = await readStore();
    const index = store.users.findIndex((user) => user.id === userId);
    if (index < 0) {
      throw new Error("Account not found.");
    }
    store.users[index] = {
      ...store.users[index],
      profile,
    };
    await writeStore(store);
    return store.users[index];
  });
}

export function toPublicUser(user: StoredUser) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
    profile: user.profile,
  };
}
