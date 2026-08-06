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
        const isSoftResidualMessage = (message: string): boolean =>
          /ownership or leadership scope does not match|lacks architecture, leadership, mentoring|below the preferred strength|repeats or overloads JD keywords|metric measure pattern is repeated|action scope is cloned|residual repetition risk|avoidable passive voice|residual passive voice/i.test(
            message,
          );
        const issueMessages =
          validation?.issues
            ?.filter(
              (issue) =>
                (issue as { severity?: string }).severity !== "warning",
            )
            .map((issue) => issue.message)
            .filter((message): message is string => Boolean(message))
            .filter((message) => !isSoftResidualMessage(message))
            .slice(0, 5) ?? [];
        const diagnosticMessages =
          validation?.diagnostics
            ?.filter((item) => item.errors.length > 0)
            .map((item) => {
              const hardErrors = item.errors.filter(
                (error) => !isSoftResidualMessage(error),
              );
              if (hardErrors.length === 0) return null;
              return `${item.bulletId}: ${hardErrors.join(" ")}`;
            })
            .filter((message): message is string => Boolean(message))
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

    const [experienceResult, summaryResult, templateResult] =
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
          this.engines.template.execute({
            context,
            jobDescription: safeRequest.jobDescription,
            profile: structuredClone(safeRequest.profile),
          }),
        ),
      ]);

    // Skills wait for experience so bullet keywords can evidence JD skills in
    // the Skills section without inventing technologies absent from the JD.
    const experienceKeywordHints: string[] = [];
    const seenHints = new Set<string>();
    for (const experience of experienceResult.output.experiences) {
      for (const bullet of experience.bullets) {
        for (const keyword of [
          ...bullet.directKeywords,
          ...bullet.supportingKeywords,
          ...bullet.outcomeKeywords,
          bullet.finalBullet,
        ]) {
          const cleaned = keyword.replace(/\s+/g, " ").trim();
          const key = cleaned.toLocaleLowerCase();
          if (!cleaned || seenHints.has(key)) continue;
          seenHints.add(key);
          experienceKeywordHints.push(cleaned);
        }
      }
    }

    const skillsResult = await executeTimed(() =>
      this.engines.skills.execute({
        context,
        jobDescription: safeRequest.jobDescription,
        profile: structuredClone(safeRequest.profile),
        experienceKeywordHints,
      }),
    );

    const outputs = [
      experienceResult.output,
      summaryResult.output,
      skillsResult.output,
      templateResult.output,
    ];
    outputs.forEach((output) => assertContextMatch(context, output));
    const approvalPolicy = safeRequest.approvalPolicy ?? "strict";
    const blockingOutputs = outputs.filter((output) => {
      if (output.status === "approved") return false;
      // Preserve-tailor overwrites summary/skills and only needs JD bullet
      // candidates from experience — do not hard-stop on those engines.
      if (approvalPolicy === "preserve-tailor") {
        return output.engineName === "template-engine";
      }
      return true;
    });
    if (blockingOutputs.length > 0) {
      throw new ResumeEngineRejectedError(blockingOutputs);
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

    // Preserve-tailor assembly overwrites summary/skills/bullets. Coerce
    // non-blocking engine statuses so the assembler gate does not hard-stop
    // after a weak JD bullet candidate was rejected.
    const allowUnapprovedContentEngines = approvalPolicy === "preserve-tailor";
    const summaryForAssembly =
      allowUnapprovedContentEngines && summaryResult.output.status !== "approved"
        ? { ...summaryResult.output, status: "approved" as const }
        : summaryResult.output;
    const skillsForAssembly =
      allowUnapprovedContentEngines && skillsResult.output.status !== "approved"
        ? { ...skillsResult.output, status: "approved" as const }
        : skillsResult.output;
    const experienceForAssembly =
      allowUnapprovedContentEngines && experienceResult.output.status !== "approved"
        ? { ...experienceResult.output, status: "approved" as const }
        : experienceResult.output;

    const assembled = this.assembler.assemble({
      context,
      jobDescription: safeRequest.jobDescription,
      profile: safeRequest.profile,
      summary: summaryForAssembly,
      skills: skillsForAssembly,
      experience: experienceForAssembly,
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
