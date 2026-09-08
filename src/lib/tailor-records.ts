import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type { ExtractedJD } from "./types";

export type TailorRecordStatus = "done" | "error";

export type TailorRecord = {
  id: string;
  userId: string;
  createdAt: string;
  status: TailorRecordStatus;
  jobDescription: string;
  company: string;
  jobTitle: string;
  extracted?: ExtractedJD;
  atsScore?: number;
  zipName?: string;
  folderName?: string;
  resumeDocxName?: string;
  resumePdfName?: string;
  coverLetterDocxName?: string;
  error?: string;
};

type RecordStore = {
  records: TailorRecord[];
};

function storePath() {
  return path.join(process.cwd(), "data", "tailor-records.json");
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

async function readStore(): Promise<RecordStore> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as RecordStore;
    if (!parsed || !Array.isArray(parsed.records)) return { records: [] };
    return parsed;
  } catch {
    return { records: [] };
  }
}

async function writeStore(store: RecordStore) {
  const dir = path.dirname(storePath());
  await mkdir(dir, { recursive: true });
  await writeFile(storePath(), JSON.stringify(store, null, 2), "utf8");
}

export function newTailorRecordId() {
  return randomUUID();
}

export function recordOutputSuffix(id: string) {
  return id.replace(/-/g, "").slice(0, 8);
}

export async function addTailorRecord(
  input: Omit<TailorRecord, "createdAt"> & { createdAt?: string },
): Promise<TailorRecord> {
  return enqueue(async () => {
    const store = await readStore();
    const record: TailorRecord = {
      ...input,
      jobDescription: input.jobDescription.slice(0, 50000),
      createdAt: input.createdAt || new Date().toISOString(),
    };
    store.records.push(record);
    await writeStore(store);
    return record;
  });
}

export async function listTailorRecords(): Promise<TailorRecord[]> {
  const store = await readStore();
  return store.records
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listTailorRecordsForUser(
  userId: string,
): Promise<TailorRecord[]> {
  const store = await readStore();
  return store.records
    .filter((record) => record.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function findTailorRecordById(
  id: string,
): Promise<TailorRecord | null> {
  const store = await readStore();
  return store.records.find((record) => record.id === id) ?? null;
}

export async function findTailorRecordByOutput(input: {
  zipName?: string | null;
  folderName?: string | null;
}): Promise<TailorRecord | null> {
  const store = await readStore();
  if (input.zipName) {
    return store.records.find((record) => record.zipName === input.zipName) ?? null;
  }
  if (input.folderName) {
    return (
      store.records.find((record) => record.folderName === input.folderName) ??
      null
    );
  }
  return null;
}

export async function deleteTailorRecord(id: string): Promise<TailorRecord | null> {
  return enqueue(async () => {
    const store = await readStore();
    const record = store.records.find((entry) => entry.id === id) ?? null;
    if (!record) return null;
    store.records = store.records.filter((entry) => entry.id !== id);
    await writeStore(store);
    return record;
  });
}

export async function deleteTailorRecordsForUser(
  userId: string,
): Promise<TailorRecord[]> {
  return enqueue(async () => {
    const store = await readStore();
    const removed = store.records.filter((record) => record.userId === userId);
    store.records = store.records.filter((record) => record.userId !== userId);
    await writeStore(store);
    return removed;
  });
}
