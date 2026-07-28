import type {
  ExperienceEngine,
  ExperienceGenerationListResult,
  ExperienceGenerationRequest,
  ExperienceGenerationRunRecord,
} from "@resume/contracts";
import { ExperienceGenerationRequestSchema } from "@resume/contracts";
import {
  createGenerationContext,
  createJobDescription,
} from "../context/create-generation-context";
import type { GenerationLogger } from "../observability/generation-logger";
import { SilentGenerationLogger } from "../observability/generation-logger";
import type { ExperienceGenerationRunStore } from "../store/experience-generation-run-store";

export interface ExperienceGenerationServiceOptions {
  engine: ExperienceEngine;
  store: ExperienceGenerationRunStore;
  providerName: string;
  logger?: GenerationLogger;
  now?: () => Date;
}

export class ExperienceGenerationService {
  private readonly logger: GenerationLogger;
  private readonly now: () => Date;

  constructor(private readonly options: ExperienceGenerationServiceOptions) {
    this.logger = options.logger ?? new SilentGenerationLogger();
    this.now = options.now ?? (() => new Date());
  }

  async generate(
    rawRequest: ExperienceGenerationRequest,
  ): Promise<ExperienceGenerationRunRecord> {
    const request = ExperienceGenerationRequestSchema.parse(rawRequest);
    const jobDescription = createJobDescription(request.jobDescriptionText);
    const context = createGenerationContext(request.profileId, jobDescription);
    context.locale = request.locale;

    const createdAt = this.now().toISOString();
    const record: ExperienceGenerationRunRecord = {
      context,
      request: structuredClone(request),
      status: "created",
      createdAt,
      updatedAt: createdAt,
      telemetry: {
        providerName: this.options.providerName,
        engineName: this.options.engine.name,
        engineVersion: this.options.engine.version,
        startedAt: createdAt,
      },
    };

    await this.options.store.create(record);
    record.status = "running";
    record.updatedAt = this.now().toISOString();
    await this.options.store.save(record);

    const startTime = performance.now();
    this.logger.info({
      event: "experience-generation-started",
      generationId: context.generationId,
      status: record.status,
    });

    try {
      const output = await this.options.engine.execute({
        context,
        jobDescription,
        careerHistory: structuredClone(request.careerHistory),
      });

      const bullets = output.experiences.flatMap(
        (experience) => experience.bullets,
      );
      const finishedAt = this.now().toISOString();

      record.output = output;
      record.status = output.status === "approved" ? "completed" : "rejected";
      record.updatedAt = finishedAt;
      record.telemetry = {
        ...record.telemetry,
        finishedAt,
        totalDurationMs: Math.max(0, Math.round(performance.now() - startTime)),
        roleCount: output.experiences.length,
        bulletCount: bullets.length,
        approvedBulletCount: bullets.filter(
          (bullet) => bullet.status === "approved",
        ).length,
        rejectedBulletCount: bullets.filter(
          (bullet) => bullet.status === "rejected",
        ).length,
        regenerationAttempts: output.validation.regeneration?.attempts ?? 0,
      };
      await this.options.store.save(record);

      const completedLog = {
        event: "experience-generation-finished",
        generationId: context.generationId,
        status: record.status,
        details: {
          roles: record.telemetry.roleCount ?? 0,
          bullets: record.telemetry.bulletCount ?? 0,
        },
        ...(record.telemetry.totalDurationMs !== undefined
          ? { durationMs: record.telemetry.totalDurationMs }
          : {}),
      };
      this.logger.info(completedLog);

      return structuredClone(record);
    } catch (error) {
      const finishedAt = this.now().toISOString();
      record.status = "failed";
      record.updatedAt = finishedAt;
      record.error = {
        code: error instanceof Error ? error.name : "GENERATION_ERROR",
        message: error instanceof Error ? error.message : "Unknown generation error.",
      };
      record.telemetry = {
        ...record.telemetry,
        finishedAt,
        totalDurationMs: Math.max(0, Math.round(performance.now() - startTime)),
      };
      await this.options.store.save(record);
      const failedLog = {
        event: "experience-generation-failed",
        generationId: context.generationId,
        status: record.status,
        details: { message: record.error.message },
        ...(record.telemetry.totalDurationMs !== undefined
          ? { durationMs: record.telemetry.totalDurationMs }
          : {}),
      };
      this.logger.error(failedLog);
      return structuredClone(record);
    }
  }

  async getRun(generationId: string): Promise<ExperienceGenerationRunRecord | null> {
    return this.options.store.get(generationId);
  }

  async listRuns(
    limitOrOptions: number | { limit?: number; profileId?: string } = 20,
  ): Promise<ExperienceGenerationListResult> {
    const options =
      typeof limitOrOptions === "number"
        ? { limit: limitOrOptions }
        : {
            limit: limitOrOptions.limit ?? 20,
            ...(limitOrOptions.profileId
              ? { profileId: limitOrOptions.profileId }
              : {}),
          };
    const runs = await this.options.store.list(options);
    return { runs, total: runs.length };
  }
}
