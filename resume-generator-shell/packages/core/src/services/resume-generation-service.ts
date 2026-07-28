import type {
  ExperienceGenerationRunRecord,
  FinalResumeData,
  ResumeGenerationSubmission,
} from "@resume/contracts";
import { ResumeGenerationSubmissionSchema } from "@resume/contracts";
import { createJobDescription } from "../context/create-generation-context";
import type { ResumeOrchestrator } from "../orchestrator/resume-orchestrator";
import type { ExperienceGenerationRunStore } from "../store/experience-generation-run-store";

export interface ResumeGenerationServiceOptions {
  store?: ExperienceGenerationRunStore;
  providerName?: string;
  now?: () => Date;
}

export class ResumeGenerationService {
  private readonly store: ExperienceGenerationRunStore | undefined;
  private readonly providerName: string;
  private readonly now: () => Date;

  constructor(
    private readonly orchestrator: ResumeOrchestrator,
    options: ResumeGenerationServiceOptions = {},
  ) {
    this.store = options.store;
    this.providerName = options.providerName ?? "rule-based";
    this.now = options.now ?? (() => new Date());
  }

  async generate(
    rawSubmission: ResumeGenerationSubmission,
  ): Promise<FinalResumeData> {
    const submission = ResumeGenerationSubmissionSchema.parse(rawSubmission);
    const jobDescription = createJobDescription(submission.jobDescriptionText);
    const startedAt = this.now().toISOString();
    const startTime = performance.now();
    const resume = await this.orchestrator.generate({
      jobDescription,
      profile: structuredClone(submission.profile),
      locale: submission.locale,
    });

    if (this.store) {
      const finishedAt = this.now().toISOString();
      const bullets = resume.experience.experiences.flatMap(
        (experience) => experience.bullets,
      );
      const record: ExperienceGenerationRunRecord = {
        context: resume.context,
        request: {
          profileId: submission.profile.profileId,
          jobDescriptionText: submission.jobDescriptionText,
          careerHistory: structuredClone(submission.profile.careerHistory),
          locale: submission.locale ?? "en-US",
        },
        status: resume.experience.status === "approved" ? "completed" : "rejected",
        createdAt: startedAt,
        updatedAt: finishedAt,
        output: resume.experience,
        telemetry: {
          providerName: this.providerName,
          engineName: "resume-orchestrator",
          engineVersion: "1.0.0",
          startedAt,
          finishedAt,
          totalDurationMs: Math.max(0, Math.round(performance.now() - startTime)),
          roleCount: resume.experience.experiences.length,
          bulletCount: bullets.length,
          approvedBulletCount: bullets.filter((bullet) => bullet.status === "approved")
            .length,
          rejectedBulletCount: bullets.filter((bullet) => bullet.status === "rejected")
            .length,
          regenerationAttempts:
            resume.experience.validation.regeneration?.attempts ?? 0,
        },
      };
      await this.store.create(record);
    }

    return resume;
  }
}
