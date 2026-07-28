import type {
  EngineExecutionTelemetry,
  EngineOutputBase,
  EvidenceEnhancementReport,
  ExperienceEngineOutput,
  FinalResumeData,
  JobDescription,
  ResumeGenerationRequest,
  ResumeOrchestrationTelemetry,
  SkillsEngineOutput,
  SummaryEngineOutput,
  UserProfile,
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

/** Optional additive enhancer; proposals must be pre-validated by the callee. */
export type SourceEvidenceEnhancer = (input: {
  sourceResumeText: string;
  jobDescription: JobDescription;
  profile: UserProfile;
  summary: SummaryEngineOutput;
  skills: SkillsEngineOutput;
  experience: ExperienceEngineOutput;
}) => {
  summary: SummaryEngineOutput;
  skills: SkillsEngineOutput;
  experience: ExperienceEngineOutput;
  report: EvidenceEnhancementReport;
};

export class ResumeEngineRejectedError extends Error {
  readonly rejectedEngines: string[];

  constructor(outputs: EngineOutputBase[]) {
    const rejected = outputs.filter((output) => output.status !== "approved");
    const details = rejected
      .map((output) => {
        const validation = (
          output as EngineOutputBase & {
            validation?: {
              issues?: Array<{ message?: string; issueCode?: string }>;
              failedBulletIds?: string[];
              diagnostics?: Array<{ bulletId: string; errors: string[] }>;
            };
          }
        ).validation;
        const issueMessages =
          validation?.issues
            ?.map((issue) => issue.message)
            .filter((message): message is string => Boolean(message))
            .slice(0, 5) ?? [];
        const diagnosticMessages =
          validation?.diagnostics
            ?.filter((item) => item.errors.length > 0)
            .map((item) => `${item.bulletId}: ${item.errors.join(" ")}`)
            .slice(0, 5) ?? [];
        const detailParts = [...issueMessages, ...diagnosticMessages];
        if (detailParts.length === 0) {
          return output.engineName;
        }
        return `${output.engineName} (${detailParts.join("; ")})`;
      })
      .join(", ");
    super(
      `Resume generation stopped because these engines were not approved: ${details}.`,
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
    private readonly sourceEvidenceEnhancer?: SourceEvidenceEnhancer,
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

    // Additive evidence layer: runs only after original engines approve.
    // Rejected proposals keep baseline outputs (original rules remain authoritative).
    let summaryOutput = summaryResult.output;
    let skillsOutput = skillsResult.output;
    let experienceOutput = experienceResult.output;
    let evidenceEnhancement: EvidenceEnhancementReport | undefined;
    if (
      safeRequest.sourceResumeText &&
      this.sourceEvidenceEnhancer &&
      safeRequest.sourceResumeText.trim().length >= 40
    ) {
      const enhanced = this.sourceEvidenceEnhancer({
        sourceResumeText: safeRequest.sourceResumeText,
        jobDescription: safeRequest.jobDescription,
        profile: safeRequest.profile,
        summary: summaryOutput,
        skills: skillsOutput,
        experience: experienceOutput,
      });
      if (
        enhanced.summary.status === "approved" &&
        enhanced.skills.status === "approved" &&
        enhanced.experience.status === "approved"
      ) {
        summaryOutput = enhanced.summary;
        skillsOutput = enhanced.skills;
        experienceOutput = enhanced.experience;
        evidenceEnhancement = enhanced.report;
      }
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
      summary: summaryOutput,
      skills: skillsOutput,
      experience: experienceOutput,
      template: templateResult.output,
      orchestration,
    });
    const readiness = this.readinessEvaluator.assess(assembled);
    return deepFreeze({
      ...assembled,
      readiness,
      ...(evidenceEnhancement ? { evidenceEnhancement } : {}),
    });
  }
}
