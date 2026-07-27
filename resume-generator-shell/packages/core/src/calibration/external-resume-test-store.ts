import type {
  ExternalResumeTestListResult,
  ExternalResumeTestRecord,
} from "@resume/contracts";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface ExternalResumeTestStore {
  save(record: ExternalResumeTestRecord): Promise<void>;
  listByGeneration(generationId: string): Promise<ExternalResumeTestListResult>;
  get(calibrationId: string): Promise<ExternalResumeTestRecord | null>;
}

export class InMemoryExternalResumeTestStore implements ExternalResumeTestStore {
  private readonly records = new Map<string, ExternalResumeTestRecord>();

  async save(record: ExternalResumeTestRecord): Promise<void> {
    this.records.set(record.calibrationId, structuredClone(record));
  }

  async listByGeneration(generationId: string): Promise<ExternalResumeTestListResult> {
    const records = [...this.records.values()]
      .filter((record) => record.generationId === generationId)
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
      .map((record) => structuredClone(record));
    return { records, total: records.length };
  }

  async get(calibrationId: string): Promise<ExternalResumeTestRecord | null> {
    const record = this.records.get(calibrationId);
    return record ? structuredClone(record) : null;
  }
}

interface PersistedCalibrationData {
  version: 1;
  records: ExternalResumeTestRecord[];
}

export class JsonFileExternalResumeTestStore implements ExternalResumeTestStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async save(record: ExternalResumeTestRecord): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const data = await this.readData();
      const remaining = data.records.filter(
        (existing) => existing.calibrationId !== record.calibrationId,
      );
      remaining.push(structuredClone(record));
      await this.writeData({ version: 1, records: remaining });
    });
    await this.writeQueue;
  }

  async listByGeneration(generationId: string): Promise<ExternalResumeTestListResult> {
    await this.writeQueue;
    const data = await this.readData();
    const records = data.records
      .filter((record) => record.generationId === generationId)
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
    return { records: structuredClone(records), total: records.length };
  }

  async get(calibrationId: string): Promise<ExternalResumeTestRecord | null> {
    await this.writeQueue;
    const data = await this.readData();
    const record = data.records.find(
      (candidate) => candidate.calibrationId === calibrationId,
    );
    return record ? structuredClone(record) : null;
  }

  private async readData(): Promise<PersistedCalibrationData> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(content) as PersistedCalibrationData;
      return parsed.version === 1 && Array.isArray(parsed.records)
        ? parsed
        : { version: 1, records: [] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, records: [] };
      }
      throw error;
    }
  }

  private async writeData(data: PersistedCalibrationData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
  }
}
