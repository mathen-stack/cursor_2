import type {
  FinalResumeAssemblyIssue,
  FinalResumeAssemblyValidation,
  FinalResumeDocument,
  GenerationContext,
  JobDescription,
  ExperienceEngineOutput,
  SkillsEngineOutput,
  SummaryEngineOutput,
  TemplateEngineOutput,
  UserProfile,
} from "@resume/contracts";
import { fingerprint, structurallyEqual } from "./stable-serialization";

export interface FinalResumeValidationInput {
  context: GenerationContext;
  jobDescription: JobDescription;
  profile: UserProfile;
  summary: SummaryEngineOutput;
  skills: SkillsEngineOutput;
  experience: ExperienceEngineOutput;
  template: TemplateEngineOutput;
  document: FinalResumeDocument;
  sourceFingerprintsBefore: FinalResumeDocument["sourceFingerprints"];
}

const SUPPORTED_SECTION_IDS = new Set([
  "contact",
  "professional-summary",
  "skills",
  "professional-experience",
  "education",
]);

export class FinalResumeAssemblyValidator {
  validate(input: FinalResumeValidationInput): FinalResumeAssemblyValidation {
    const issues: FinalResumeAssemblyIssue[] = [];
    const outputs = [input.summary, input.skills, input.experience, input.template];
    const contextApproved = outputs.every((output) => {
      const actual = output.context;
      return (
        actual.generationId === input.context.generationId &&
        actual.profileId === input.context.profileId &&
        actual.jdId === input.context.jdId &&
        actual.jdHash === input.context.jdHash
      );
    });
    if (!contextApproved) {
      issues.push({
        issueCode: "CONTEXT_MISMATCH",
        severity: "error",
        message: "One or more source outputs belong to another JD or generation run.",
      });
    }

    const allEngineOutputsApproved = outputs.every(
      (output) => output.status === "approved",
    );
    if (!allEngineOutputsApproved) {
      issues.push({
        issueCode: "UNAPPROVED_ENGINE_OUTPUT",
        severity: "error",
        message: "Final assembly requires approved outputs from every resume engine.",
      });
    }

    const expectedOrder = input.template.template.sectionOrder;
    const actualOrder = input.document.sections.map((section) => section.id);
    const sectionOrderApproved = structurallyEqual(expectedOrder, actualOrder);
    if (!sectionOrderApproved) {
      issues.push({
        issueCode: "SECTION_ORDER_CHANGED",
        severity: "error",
        message: "The assembler changed the Template Engine section order.",
      });
    }

    const sectionSelectionApproved =
      new Set(actualOrder).size === actualOrder.length &&
      actualOrder.every((id) => expectedOrder.includes(id));
    if (!sectionSelectionApproved) {
      issues.push({
        issueCode: "SECTION_SELECTION_CHANGED",
        severity: "error",
        message: "The assembled document contains missing or duplicate sections.",
      });
    }

    const noUnsupportedSections = actualOrder.every((id) =>
      SUPPORTED_SECTION_IDS.has(id),
    );
    if (!noUnsupportedSections) {
      issues.push({
        issueCode: "UNSUPPORTED_SECTION",
        severity: "error",
        message: "The selected template contains a section unsupported by the current profile contract.",
      });
    }

    const contactSection = input.document.sections.find(
      (section) => section.id === "contact",
    );
    const contactPreserved =
      contactSection?.id === "contact" &&
      structurallyEqual(contactSection.content, input.profile.personalInformation);
    if (!contactPreserved) {
      issues.push({
        issueCode: "CONTACT_CHANGED",
        severity: "error",
        message: "User-entered contact information was changed during assembly.",
        sectionId: "contact",
      });
    }

    const educationSection = input.document.sections.find(
      (section) => section.id === "education",
    );
    const educationExpected = expectedOrder.includes("education");
    const educationPreserved = educationExpected
      ? educationSection?.id === "education" &&
        structurallyEqual(educationSection.content, input.profile.education)
      : educationSection === undefined;
    if (!educationPreserved) {
      issues.push({
        issueCode: "EDUCATION_CHANGED",
        severity: "error",
        message: "User-entered education information was changed during assembly.",
        sectionId: "education",
      });
    }

    const summarySection = input.document.sections.find(
      (section) => section.id === "professional-summary",
    );
    const summaryPreserved =
      summarySection?.id === "professional-summary" &&
      summarySection.content === input.summary.summary;
    if (!summaryPreserved) {
      issues.push({
        issueCode: "SUMMARY_CHANGED",
        severity: "error",
        message: "The Summary Engine output was changed during assembly.",
        sectionId: "professional-summary",
      });
    }

    const skillsSection = input.document.sections.find(
      (section) => section.id === "skills",
    );
    const skillsPreserved =
      skillsSection?.id === "skills" &&
      structurallyEqual(skillsSection.content, input.skills.categories);
    if (!skillsPreserved) {
      issues.push({
        issueCode: "SKILLS_CHANGED",
        severity: "error",
        message: "The Skills Engine categories or ordering were changed during assembly.",
        sectionId: "skills",
      });
    }

    const experienceSection = input.document.sections.find(
      (section) => section.id === "professional-experience",
    );
    const expectedExperience = input.experience.experiences.map((entry) => ({
      experienceId: entry.experienceId,
      companyName: entry.companyName,
      startDate: entry.startDate,
      endDate: entry.endDate,
      assignedRole: entry.assignedRole,
      bullets: entry.bullets.map((bullet: { finalBullet: string }) => bullet.finalBullet),
    }));
    const experiencePreserved =
      experienceSection?.id === "professional-experience" &&
      structurallyEqual(experienceSection.content, expectedExperience);
    if (!experiencePreserved) {
      issues.push({
        issueCode: "EXPERIENCE_CHANGED",
        severity: "error",
        message: "The Experience Engine roles, bullets, or ordering were changed during assembly.",
        sectionId: "professional-experience",
      });
    }

    const sourceFingerprintsAfter = {
      profile: fingerprint(input.profile),
      summary: fingerprint(input.summary),
      skills: fingerprint(input.skills),
      experience: fingerprint(input.experience),
      template: fingerprint(input.template),
    };
    const sourceOutputsUnmodified = structurallyEqual(
      input.sourceFingerprintsBefore,
      sourceFingerprintsAfter,
    );
    if (!sourceOutputsUnmodified) {
      issues.push({
        issueCode: "SOURCE_MUTATION",
        severity: "error",
        message: "A source engine output or user profile was mutated during assembly.",
      });
    }

    const approved = issues.every((issue) => issue.severity !== "error");
    return {
      contextApproved,
      allEngineOutputsApproved,
      sectionOrderApproved,
      sectionSelectionApproved,
      contactPreserved,
      educationPreserved,
      summaryPreserved,
      skillsPreserved,
      experiencePreserved,
      sourceOutputsUnmodified,
      noUnsupportedSections,
      overallStatus: approved ? "approved" : "rejected",
      issues,
    };
  }
}
