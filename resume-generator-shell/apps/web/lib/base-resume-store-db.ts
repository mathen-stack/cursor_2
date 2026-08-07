import type { BaseResumeExtracted, BaseResumeRecord, BaseResumeSummary } from "@resume/contracts";
import { ensureDatabaseSchema } from "./db";
import type { CreateBaseResumeInput } from "./base-resume-store-types";

type Row = {
  id: string;
  username: string;
  title: string;
  original_filename: string;
  mime_type: string;
  raw_text: string;
  extracted: unknown;
  is_favorite: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

function toIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function mapRow(row: Row): BaseResumeRecord {
  return {
    id: row.id,
    username: row.username,
    title: row.title,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    rawText: row.raw_text,
    extracted: row.extracted as BaseResumeExtracted,
    isFavorite: Boolean(row.is_favorite),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
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

export async function dbListBaseResumes(
  username: string,
): Promise<BaseResumeSummary[]> {
  const sql = await ensureDatabaseSchema();
  const rows = (await sql`
    SELECT id, username, title, original_filename, mime_type, raw_text, extracted,
           is_favorite, created_at, updated_at
    FROM resume_base_resumes
    WHERE username = ${username}
    ORDER BY is_favorite DESC, updated_at DESC
  `) as Row[];
  return rows.map((row) => toSummary(mapRow(row)));
}

export async function dbListBaseResumeRecords(
  username: string,
): Promise<BaseResumeRecord[]> {
  const sql = await ensureDatabaseSchema();
  const rows = (await sql`
    SELECT id, username, title, original_filename, mime_type, raw_text, extracted,
           is_favorite, created_at, updated_at
    FROM resume_base_resumes
    WHERE username = ${username}
    ORDER BY is_favorite DESC, updated_at DESC
  `) as Row[];
  return rows.map(mapRow);
}

export async function dbReadBaseResume(
  username: string,
  id: string,
): Promise<BaseResumeRecord | null> {
  const sql = await ensureDatabaseSchema();
  const rows = (await sql`
    SELECT id, username, title, original_filename, mime_type, raw_text, extracted,
           is_favorite, created_at, updated_at
    FROM resume_base_resumes
    WHERE username = ${username} AND id = ${id}
    LIMIT 1
  `) as Row[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function dbCreateBaseResume(
  input: CreateBaseResumeInput & { id: string },
): Promise<BaseResumeRecord> {
  const sql = await ensureDatabaseSchema();
  const now = new Date().toISOString();
  const isFavorite = Boolean(input.isFavorite);
  await sql`
    INSERT INTO resume_base_resumes (
      id, username, title, original_filename, mime_type, raw_text, extracted,
      is_favorite, created_at, updated_at
    ) VALUES (
      ${input.id},
      ${input.username},
      ${input.title},
      ${input.originalFilename},
      ${input.mimeType},
      ${input.rawText},
      ${input.extracted},
      ${isFavorite},
      ${now},
      ${now}
    )
  `;
  return {
    id: input.id,
    username: input.username,
    title: input.title,
    originalFilename: input.originalFilename,
    mimeType: input.mimeType,
    rawText: input.rawText,
    extracted: input.extracted,
    isFavorite,
    createdAt: now,
    updatedAt: now,
  };
}

export async function dbUpdateBaseResumeFavorite(input: {
  username: string;
  id: string;
  isFavorite: boolean;
}): Promise<BaseResumeRecord | null> {
  const sql = await ensureDatabaseSchema();
  const now = new Date().toISOString();
  await sql`
    UPDATE resume_base_resumes
    SET is_favorite = ${input.isFavorite}, updated_at = ${now}
    WHERE username = ${input.username} AND id = ${input.id}
  `;
  return dbReadBaseResume(input.username, input.id);
}

export async function dbDeleteBaseResume(
  username: string,
  id: string,
): Promise<boolean> {
  const sql = await ensureDatabaseSchema();
  const rows = (await sql`
    DELETE FROM resume_base_resumes
    WHERE username = ${username} AND id = ${id}
    RETURNING id
  `) as Array<{ id: string }>;
  return rows.length > 0;
}
