import type { GenerationContext } from "@resume/contracts";

export interface GenerationRunRecord {
  context: GenerationContext;
  status: "created" | "running" | "completed" | "failed";
}

export interface GenerationRunStore {
  create(record: GenerationRunRecord): Promise<void>;
  get(generationId: string): Promise<GenerationRunRecord | null>;
  updateStatus(
    generationId: string,
    status: GenerationRunRecord["status"],
  ): Promise<void>;
}
