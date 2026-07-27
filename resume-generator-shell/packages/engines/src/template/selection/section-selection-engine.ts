import type {
  GenerationContext,
  TemplateSectionDefinition,
  TemplateSectionId,
  UserProfile,
} from "@resume/contracts";

export interface SectionSelectionInput {
  context: GenerationContext;
  profile: UserProfile;
}

export interface SectionSelectionOutput {
  context: GenerationContext;
  sectionOrder: TemplateSectionId[];
  sections: TemplateSectionDefinition[];
}

const HEADING_BY_SECTION: Record<TemplateSectionId, string> = {
  contact: "CONTACT",
  "professional-summary": "PROFESSIONAL SUMMARY",
  skills: "SKILLS",
  "professional-experience": "PROFESSIONAL EXPERIENCE",
  education: "EDUCATION",
  certifications: "CERTIFICATIONS",
  projects: "PROJECTS",
  publications: "PUBLICATIONS",
  awards: "AWARDS",
};

export class SectionSelectionEngine {
  readonly name = "section-selection-engine";

  execute(input: SectionSelectionInput): SectionSelectionOutput {
    const sectionOrder: TemplateSectionId[] = [
      "contact",
      "professional-summary",
      "skills",
      "professional-experience",
    ];
    if (input.profile.education.length > 0) {
      sectionOrder.push("education");
    }

    const sections = sectionOrder.map((id, index): TemplateSectionDefinition => ({
      id,
      heading: HEADING_BY_SECTION[id],
      required: id !== "education",
      keepTogether: id !== "professional-experience",
      pageBreakBefore: false,
      spacingBeforePt: index === 0 ? 0 : id === "professional-experience" ? 7 : 6,
      spacingAfterPt: id === "contact" ? 5 : 3,
    }));

    return {
      context: input.context,
      sectionOrder,
      sections,
    };
  }
}
