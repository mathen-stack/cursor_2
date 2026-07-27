import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ExperienceGenerationRunRecord } from "@resume/contracts";
import type { ExperienceGenerationRunStore } from "./experience-generation-run-store";
import { summarizeExperienceRun } from "./experience-generation-run-store";

interface StoreFile {
  version: 1;
  records: Record<string, ExperienceGenerationRunRecord>;
}

const EMPTY_STORE: StoreFile = { version: 1, records: {} };

export class JsonFileExperienceGenerationRunStore
  implements ExperienceGenerationRunStore
{
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async create(record: ExperienceGenerationRunRecord): Promise<void> {
    await this.withLock(async () => {
      const data = await this.readStore();
      const generationId = record.context.generationId;
      if (data.records[generationId]) {
        throw new Error(`Generation run ${generationId} already exists.`);
      }
      data.records[generationId] = structuredClone(record);
      await this.writeStore(data);
    });
  }

  async get(generationId: string): Promise<ExperienceGenerationRunRecord | null> {
    await this.queue;
    const data = await this.readStore();
    const record = data.records[generationId];
    return record ? structuredClone(record) : null;
  }

  async save(record: ExperienceGenerationRunRecord): Promise<void> {
    await this.withLock(async () => {
      const data = await this.readStore();
      const generationId = record.context.generationId;
      if (!data.records[generationId]) {
        throw new Error(`Generation run ${generationId} does not exist.`);
      }
      data.records[generationId] = structuredClone(record);
      await this.writeStore(data);
    });
  }

  async list(limit = 20) {
    await this.queue;
    const data = await this.readStore();
    return Object.values(data.records)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, Math.max(0, limit))
      .map((record) => summarizeExperienceRun(record));
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async readStore(): Promise<StoreFile> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(content) as Partial<StoreFile>;
      if (parsed.version !== 1 || !parsed.records) {
        throw new Error("Unsupported generation-run store format.");
      }
      return parsed as StoreFile;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return structuredClone(EMPTY_STORE);
      }
      throw error;
    }
  }

  private async writeStore(data: StoreFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(data, null, 2), "utf8");
    await rename(temporaryPath, this.filePath);
  }
}
