import type { ExperienceGenerationRunRecord } from "@resume/contracts";
import type { ExperienceGenerationRunStore } from "./experience-generation-run-store";
import { summarizeExperienceRun } from "./experience-generation-run-store";

function cloneRecord(
  record: ExperienceGenerationRunRecord,
): ExperienceGenerationRunRecord {
  return structuredClone(record);
}

export class InMemoryExperienceGenerationRunStore
  implements ExperienceGenerationRunStore
{
  private readonly records = new Map<string, ExperienceGenerationRunRecord>();

  async create(record: ExperienceGenerationRunRecord): Promise<void> {
    const generationId = record.context.generationId;
    if (this.records.has(generationId)) {
      throw new Error(`Generation run ${generationId} already exists.`);
    }
    this.records.set(generationId, cloneRecord(record));
  }

  async get(generationId: string): Promise<ExperienceGenerationRunRecord | null> {
    const record = this.records.get(generationId);
    return record ? cloneRecord(record) : null;
  }

  async save(record: ExperienceGenerationRunRecord): Promise<void> {
    const generationId = record.context.generationId;
    if (!this.records.has(generationId)) {
      throw new Error(`Generation run ${generationId} does not exist.`);
    }
    this.records.set(generationId, cloneRecord(record));
  }

  async list(limit = 20) {
    return [...this.records.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, Math.max(0, limit))
      .map((record) => summarizeExperienceRun(record));
  }
}
