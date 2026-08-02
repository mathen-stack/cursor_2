import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BaseResumeRecord, BaseResumeSummary } from "@resume/contracts";
import { getBaseResumesDirectory } from "./data-paths";
import { hasDatabaseUrl } from "./db";
import {
  dbCreateBaseResume,
  dbDeleteBaseResume,
  dbListBaseResumeRecords,
  dbListBaseResumes,
  dbReadBaseResume,
  dbUpdateBaseResumeFavorite,
} from "./base-resume-store-db";
import type { CreateBaseResumeInput } from "./base-resume-store-types";

function sanitizeUsername(username: string): string {
  return (
    username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "guest"
  );
}

function userDirectory(username: string): string {
  return path.join(getBaseResumesDirectory(), sanitizeUsername(username));
}

function recordPath(username: string, id: string): string {
  return path.join(userDirectory(username), `${id}.json`);
}

function createId(): string {
  return `BR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toSummary(record: BaseResumeRecord): BaseResumeSummary {
  return {
    id: record.id,
    title: record.title,
    originalFilename: record.originalFilename,
    isFavorite: record.isFavorite,
    roleCount: record.extracted.experiences.length,
    stacks: record.extracted.stacks.slice(0, 12),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function listFromFiles(username: string): Promise<BaseResumeRecord[]> {
  const dir = userDirectory(username);
  try {
    const names = await readdir(dir);
    const records: BaseResumeRecord[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = await readFile(path.join(dir, name), "utf8");
        records.push(JSON.parse(raw) as BaseResumeRecord);
      } catch {
        // skip corrupt
      }
    }
    return records.sort((left, right) => {
      if (Number(right.isFavorite) !== Number(left.isFavorite)) {
        return Number(right.isFavorite) - Number(left.isFavorite);
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    });
  } catch {
    return [];
  }
}

export async function listBaseResumeSummaries(
  username: string,
): Promise<BaseResumeSummary[]> {
  if (hasDatabaseUrl()) return dbListBaseResumes(sanitizeUsername(username));
  return (await listFromFiles(username)).map(toSummary);
}

export async function listBaseResumeRecords(
  username: string,
): Promise<BaseResumeRecord[]> {
  if (hasDatabaseUrl()) return dbListBaseResumeRecords(sanitizeUsername(username));
  return listFromFiles(username);
}

export async function readBaseResume(
  username: string,
  id: string,
): Promise<BaseResumeRecord | null> {
  if (hasDatabaseUrl()) return dbReadBaseResume(sanitizeUsername(username), id);
  try {
    const raw = await readFile(recordPath(username, id), "utf8");
    return JSON.parse(raw) as BaseResumeRecord;
  } catch {
    return null;
  }
}

export async function createBaseResume(
  input: CreateBaseResumeInput,
): Promise<BaseResumeRecord> {
  const username = sanitizeUsername(input.username);
  const id = createId();
  if (hasDatabaseUrl()) {
    return dbCreateBaseResume({ ...input, username, id });
  }
  const now = new Date().toISOString();
  const record: BaseResumeRecord = {
    id,
    username,
    title: input.title,
    originalFilename: input.originalFilename,
    mimeType: input.mimeType,
    rawText: input.rawText,
    extracted: input.extracted,
    isFavorite: Boolean(input.isFavorite),
    createdAt: now,
    updatedAt: now,
  };
  await mkdir(userDirectory(username), { recursive: true });
  await writeFile(recordPath(username, id), JSON.stringify(record, null, 2), "utf8");
  return record;
}

export async function setBaseResumeFavorite(input: {
  username: string;
  id: string;
  isFavorite: boolean;
}): Promise<BaseResumeRecord | null> {
  const username = sanitizeUsername(input.username);
  if (hasDatabaseUrl()) {
    return dbUpdateBaseResumeFavorite({ ...input, username });
  }
  const existing = await readBaseResume(username, input.id);
  if (!existing) return null;
  const updated: BaseResumeRecord = {
    ...existing,
    isFavorite: input.isFavorite,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(recordPath(username, input.id), JSON.stringify(updated, null, 2), "utf8");
  return updated;
}

export async function deleteBaseResume(
  username: string,
  id: string,
): Promise<boolean> {
  const safeUser = sanitizeUsername(username);
  if (hasDatabaseUrl()) return dbDeleteBaseResume(safeUser, id);
  try {
    await unlink(recordPath(safeUser, id));
    return true;
  } catch {
    return false;
  }
}
