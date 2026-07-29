import type {
  FinalResumeData,
  FinalResumeDocument,
  FinalResumeSection,
  GenerationContext,
  JobDescription,
  ExperienceEngineOutput,
  ResumeOrchestrationTelemetry,
  SkillsEngineOutput,
  SummaryEngineOutput,
  TemplateEngineOutput,
  TemplateSectionId,
  UserProfile,
} from "@resume/contracts";
import { FinalResumeAssemblyValidator } from "./final-resume-assembly-validator";
import { deepFreeze, fingerprint } from "./stable-serialization";

export interface FinalResumeAssemblyInput {
  context: GenerationContext;
  jobDescription: JobDescription;
  profile: UserProfile;
  summary: SummaryEngineOutput;
  skills: SkillsEngineOutput;
  experience: ExperienceEngineOutput;
  template: TemplateEngineOutput;
  orchestration: ResumeOrchestrationTelemetry;
}

export interface FinalResumeAssembler {
  assemble(input: FinalResumeAssemblyInput): FinalResumeData;
}

function headingFor(
  template: TemplateEngineOutput,
  sectionId: TemplateSectionId,
): string {
  const definition = template.template.sections.find(
    (section) => section.id === sectionId,
  );
  if (!definition) {
    throw new Error(`Template section ${sectionId} has no definition.`);
  }
  return definition.heading;
}

export class ImmutableFinalResumeAssembler implements FinalResumeAssembler {
  constructor(
    private readonly validator = new FinalResumeAssemblyValidator(),
  ) {}

  assemble(input: FinalResumeAssemblyInput): FinalResumeData {
    const sourceFingerprints = {
      profile: fingerprint(input.profile),
      summary: fingerprint(input.summary),
      skills: fingerprint(input.skills),
      experience: fingerprint(input.experience),
      template: fingerprint(input.template),
    };

    const sections = input.template.template.sectionOrder.map((sectionId) =>
      this.buildSection(sectionId, input),
    );

    const documentWithoutFingerprint = {
      documentId: `RESUME-${input.context.generationId}`,
      templateId: input.template.template.templateId,
      sectionOrder: structuredClone(input.template.template.sectionOrder),
      sections,
      sourceFingerprints,
    };
    const document: FinalResumeDocument = {
      ...documentWithoutFingerprint,
      contentFingerprint: fingerprint(documentWithoutFingerprint),
    };

    const assemblyValidation = this.validator.validate({
      ...input,
      document,
      sourceFingerprintsBefore: sourceFingerprints,
    });
    if (assemblyValidation.overallStatus !== "approved") {
      const messages = assemblyValidation.issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.message)
        .join(" ");
      throw new Error(`Final resume assembly rejected. ${messages}`.trim());
    }

    return deepFreeze({
      context: structuredClone(input.context),
      jobDescription: structuredClone(input.jobDescription),
      profile: structuredClone(input.profile),
      summary: structuredClone(input.summary),
      skills: structuredClone(input.skills),
      experience: structuredClone(input.experience),
      template: structuredClone(input.template),
      document: structuredClone(document),
      assemblyValidation,
      orchestration: structuredClone(input.orchestration),
    });
  }

  private buildSection(
    sectionId: TemplateSectionId,
    input: FinalResumeAssemblyInput,
  ): FinalResumeSection {
    const heading = headingFor(input.template, sectionId);
    switch (sectionId) {
      case "contact":
        return {
          id: sectionId,
          heading,
          content: structuredClone(input.profile.personalInformation),
        };
      case "professional-summary":
        return {
          id: sectionId,
          heading,
          content: input.summary.summary,
        };
      case "skills":
        return {
          id: sectionId,
          heading,
          content: structuredClone(input.skills.categories),
        };
      case "professional-experience":
        return {
          id: sectionId,
          heading,
          content: input.experience.experiences.map((entry) => ({
            experienceId: entry.experienceId,
            companyName: entry.companyName,
            startDate: entry.startDate,
            endDate: entry.endDate,
            assignedRole: entry.assignedRole,
            bullets: entry.bullets.map((bullet: { finalBullet: string }) => bullet.finalBullet),
          })),
        };
      case "education":
        return {
          id: sectionId,
          heading,
          content: structuredClone(input.profile.education),
        };
      default:
        throw new Error(
          `Final assembler does not support template section ${sectionId}.`,
        );
    }
  }
}
