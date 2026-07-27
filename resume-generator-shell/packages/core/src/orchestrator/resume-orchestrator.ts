import type {
  EngineExecutionTelemetry,
  EngineOutputBase,
  FinalResumeData,
  ResumeGenerationRequest,
  ResumeOrchestrationTelemetry,
} from "@resume/contracts";
import { assertContextMatch } from "../context/assert-context-match";
import { createGenerationContext } from "../context/create-generation-context";
import type {
  FinalResumeAssembler,
} from "../assembly/final-resume-assembler";
import { deepFreeze } from "../assembly/stable-serialization";
import {
  ResumeWordedReadinessEngine,
  type ResumeReadinessEvaluator,
} from "../readiness/resume-worded-readiness-engine";
import { ImmutableFinalResumeAssembler } from "../assembly/final-resume-assembler";
import type { EngineRegistry } from "../registry/engine-registry";

export class ResumeEngineRejectedError extends Error {
  readonly rejectedEngines: string[];

  constructor(outputs: EngineOutputBase[]) {
    const rejected = outputs.filter((output) => output.status !== "approved");
    super(
      `Resume generation stopped because these engines were not approved: ${rejected
        .map((output) => output.engineName)
        .join(", ")}.`,
    );
    this.name = "ResumeEngineRejectedError";
    this.rejectedEngines = rejected.map((output) => output.engineName);
  }
}

interface TimedEngineResult<T extends EngineOutputBase> {
  output: T;
  telemetry: EngineExecutionTelemetry;
}

async function executeTimed<T extends EngineOutputBase>(
  operation: () => Promise<T>,
): Promise<TimedEngineResult<T>> {
  const started = performance.now();
  const output = await operation();
  return {
    output,
    telemetry: {
      engineName: output.engineName,
      engineVersion: output.engineVersion,
      status: output.status,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
    },
  };
}

export class ResumeOrchestrator {
  constructor(
    private readonly engines: EngineRegistry,
    private readonly assembler: FinalResumeAssembler =
      new ImmutableFinalResumeAssembler(),
    private readonly readinessEvaluator: ResumeReadinessEvaluator =
      new ResumeWordedReadinessEngine(),
  ) {}

  async generate(request: ResumeGenerationRequest): Promise<FinalResumeData> {
    const safeRequest = structuredClone(request);
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const context = createGenerationContext(
      safeRequest.profile.profileId,
      safeRequest.jobDescription,
    );
    context.locale = safeRequest.locale;

    const [experienceResult, summaryResult, skillsResult, templateResult] =
      await Promise.all([
        executeTimed(() =>
          this.engines.experience.execute({
            context,
            jobDescription: safeRequest.jobDescription,
            careerHistory: structuredClone(safeRequest.profile.careerHistory),
          }),
        ),
        executeTimed(() =>
          this.engines.summary.execute({
            context,
            jobDescription: safeRequest.jobDescription,
            profile: structuredClone(safeRequest.profile),
          }),
        ),
        executeTimed(() =>
          this.engines.skills.execute({
            context,
            jobDescription: safeRequest.jobDescription,
            profile: structuredClone(safeRequest.profile),
          }),
        ),
        executeTimed(() =>
          this.engines.template.execute({
            context,
            jobDescription: safeRequest.jobDescription,
            profile: structuredClone(safeRequest.profile),
          }),
        ),
      ]);

    const outputs = [
      experienceResult.output,
      summaryResult.output,
      skillsResult.output,
      templateResult.output,
    ];
    outputs.forEach((output) => assertContextMatch(context, output));
    if (outputs.some((output) => output.status !== "approved")) {
      throw new ResumeEngineRejectedError(outputs);
    }

    const orchestration: ResumeOrchestrationTelemetry = {
      startedAt,
      finishedAt: new Date().toISOString(),
      totalDurationMs: Math.max(0, Math.round(performance.now() - started)),
      engines: [
        experienceResult.telemetry,
        summaryResult.telemetry,
        skillsResult.telemetry,
        templateResult.telemetry,
      ],
    };

    const assembled = this.assembler.assemble({
      context,
      jobDescription: safeRequest.jobDescription,
      profile: safeRequest.profile,
      summary: summaryResult.output,
      skills: skillsResult.output,
      experience: experienceResult.output,
      template: templateResult.output,
      orchestration,
    });
    const readiness = this.readinessEvaluator.assess(assembled);
    return deepFreeze({
      ...assembled,
      readiness,
    });
  }
}
