import { z } from "zod";
import { CareerEntrySchema } from "../common/profile";
import type { GenerationContext } from "../common/generation-context";
import type { ExperienceEngineOutput } from "../engines/experience";

export const ExperienceGenerationRequestSchema = z.object({
  profileId: z.string().min(1),
  jobDescriptionText: z.string().min(50),
  careerHistory: z.array(CareerEntrySchema).min(1),
  locale: z.string().min(2).default("en-US"),
});

export type ExperienceGenerationRequest = z.infer<
  typeof ExperienceGenerationRequestSchema
>;

export const ExperienceGenerationStatusSchema = z.enum([
  "created",
  "running",
  "completed",
  "rejected",
  "failed",
]);

export type ExperienceGenerationStatus = z.infer<
  typeof ExperienceGenerationStatusSchema
>;

export interface ExperienceGenerationTelemetry {
  providerName: string;
  engineName: string;
  engineVersion: string;
  startedAt: string;
  finishedAt?: string;
  totalDurationMs?: number;
  roleCount?: number;
  bulletCount?: number;
  approvedBulletCount?: number;
  rejectedBulletCount?: number;
  regenerationAttempts?: number;
}

export interface ExperienceGenerationFailure {
  code: string;
  message: string;
}

export interface ExperienceGenerationRunRecord {
  context: GenerationContext;
  status: ExperienceGenerationStatus;
  request: ExperienceGenerationRequest;
  createdAt: string;
  updatedAt: string;
  output?: ExperienceEngineOutput;
  error?: ExperienceGenerationFailure;
  telemetry: ExperienceGenerationTelemetry;
}

export interface ExperienceGenerationRunSummary {
  generationId: string;
  profileId: string;
  jdId: string;
  jdHash: string;
  status: ExperienceGenerationStatus;
  createdAt: string;
  updatedAt: string;
  providerName: string;
  engineVersion: string;
  roleCount?: number;
  bulletCount?: number;
}

export interface ExperienceGenerationListResult {
  runs: ExperienceGenerationRunSummary[];
  total: number;
}
