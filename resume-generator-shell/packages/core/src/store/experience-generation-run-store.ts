import type {
  ExperienceGenerationRunRecord,
  ExperienceGenerationRunSummary,
} from "@resume/contracts";

export interface ExperienceGenerationRunStore {
  create(record: ExperienceGenerationRunRecord): Promise<void>;
  get(generationId: string): Promise<ExperienceGenerationRunRecord | null>;
  save(record: ExperienceGenerationRunRecord): Promise<void>;
  list(limit?: number): Promise<ExperienceGenerationRunSummary[]>;
}

export function summarizeExperienceRun(
  record: ExperienceGenerationRunRecord,
): ExperienceGenerationRunSummary {
  const summary: ExperienceGenerationRunSummary = {
    generationId: record.context.generationId,
    profileId: record.context.profileId,
    jdId: record.context.jdId,
    jdHash: record.context.jdHash,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    providerName: record.telemetry.providerName,
    engineVersion: record.telemetry.engineVersion,
  };

  if (record.telemetry.roleCount !== undefined) {
    summary.roleCount = record.telemetry.roleCount;
  }
  if (record.telemetry.bulletCount !== undefined) {
    summary.bulletCount = record.telemetry.bulletCount;
  }

  return summary;
}
