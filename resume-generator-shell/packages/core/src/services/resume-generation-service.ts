import type {
  FinalResumeData,
  ResumeGenerationSubmission,
} from "@resume/contracts";
import { ResumeGenerationSubmissionSchema } from "@resume/contracts";
import { createJobDescription } from "../context/create-generation-context";
import type { ResumeOrchestrator } from "../orchestrator/resume-orchestrator";

export class ResumeGenerationService {
  constructor(private readonly orchestrator: ResumeOrchestrator) {}

  async generate(
    rawSubmission: ResumeGenerationSubmission,
  ): Promise<FinalResumeData> {
    const submission = ResumeGenerationSubmissionSchema.parse(rawSubmission);
    const jobDescription = createJobDescription(submission.jobDescriptionText);
    return this.orchestrator.generate({
      jobDescription,
      profile: structuredClone(submission.profile),
      locale: submission.locale,
    });
  }
}
