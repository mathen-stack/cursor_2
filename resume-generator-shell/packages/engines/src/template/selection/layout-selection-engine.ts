import type {
  GenerationContext,
  TemplateAlignment,
  TemplateAtsSafeguards,
  TemplateContentEstimate,
  TemplateDensity,
  TemplateMargins,
  TemplatePageSize,
  TemplateRoleAnalysis,
  TemplateSpacing,
  TemplateTypography,
  UserProfile,
} from "@resume/contracts";

export interface LayoutSelectionInput {
  context: GenerationContext;
  profile: UserProfile;
  roleAnalysis: TemplateRoleAnalysis;
  pageSize: TemplatePageSize;
  explicitSkillEstimate: number;
}

export interface LayoutSelectionOutput {
  context: GenerationContext;
  pageTarget: 1 | 2;
  density: TemplateDensity;
  typography: TemplateTypography;
  margins: TemplateMargins;
  spacing: TemplateSpacing;
  alignment: TemplateAlignment;
  atsSafeguards: TemplateAtsSafeguards;
  contentEstimate: TemplateContentEstimate;
}

function bulletsForExperience(index: number): number {
  return index === 0 ? 6 : 5;
}

function lineCapacity(pageSize: TemplatePageSize): number {
  return pageSize === "a4" ? 58 : 56;
}

function estimateLines(
  careerEntries: number,
  educationEntries: number,
  skillCount: number,
): { bulletCount: number; renderedLines: number } {
  let bulletCount = 0;
  let experienceLines = 0;
  for (let index = 0; index < careerEntries; index += 1) {
    const bullets = bulletsForExperience(index);
    bulletCount += bullets;
    experienceLines += 2 + bullets * 2.25;
  }

  const contactLines = 3;
  const summaryLines = 6;
  const skillLines = 2 + Math.ceil(skillCount / 6) * 1.35;
  const educationLines = educationEntries === 0 ? 0 : 1.5 + educationEntries * 2.25;
  const sectionSpacingLines = 5;
  return {
    bulletCount,
    renderedLines: Math.ceil(
      contactLines +
        summaryLines +
        skillLines +
        experienceLines +
        educationLines +
        sectionSpacingLines,
    ),
  };
}

function determinePageTarget(
  careerEntryCount: number,
  estimatedLines: number,
  capacity: number,
  seniority: TemplateRoleAnalysis["seniority"],
): 1 | 2 {
  const senior = ["senior", "lead", "staff", "principal", "manager"].includes(seniority);
  if (careerEntryCount >= 2 || estimatedLines > capacity * 0.92 || (senior && estimatedLines > capacity * 0.82)) {
    return 2;
  }
  return 1;
}

function determineDensity(pageTarget: 1 | 2, utilizationRatio: number): TemplateDensity {
  if (pageTarget === 1 && utilizationRatio >= 0.82) {
    return "compact";
  }
  if (utilizationRatio <= 0.58) {
    return "spacious";
  }
  return "balanced";
}

function typographyForDensity(density: TemplateDensity): TemplateTypography {
  if (density === "compact") {
    return {
      fontFamily: "Arial",
      bodySizePt: 10.25,
      bodyLineHeight: 1.05,
      nameSizePt: 17,
      sectionHeadingSizePt: 11.25,
      roleHeadingSizePt: 10.75,
      contactSizePt: 9.75,
      sectionHeadingCase: "uppercase",
    };
  }
  if (density === "spacious") {
    return {
      fontFamily: "Arial",
      bodySizePt: 11,
      bodyLineHeight: 1.12,
      nameSizePt: 19,
      sectionHeadingSizePt: 12,
      roleHeadingSizePt: 11.25,
      contactSizePt: 10.25,
      sectionHeadingCase: "uppercase",
    };
  }
  return {
    fontFamily: "Arial",
    bodySizePt: 10.5,
    bodyLineHeight: 1.08,
    nameSizePt: 18,
    sectionHeadingSizePt: 11.5,
    roleHeadingSizePt: 11,
    contactSizePt: 10,
    sectionHeadingCase: "uppercase",
  };
}

function marginsForDensity(density: TemplateDensity): TemplateMargins {
  const value = density === "compact" ? 0.5 : density === "spacious" ? 0.72 : 0.62;
  return {
    topInches: value,
    rightInches: value,
    bottomInches: value,
    leftInches: value,
  };
}

function spacingForDensity(density: TemplateDensity): TemplateSpacing {
  if (density === "compact") {
    return {
      sectionGapPt: 5,
      entryGapPt: 4,
      bulletGapPt: 1.2,
      paragraphGapPt: 2,
      bulletIndentInches: 0.18,
      hangingIndentInches: 0.13,
    };
  }
  if (density === "spacious") {
    return {
      sectionGapPt: 8,
      entryGapPt: 6,
      bulletGapPt: 2.5,
      paragraphGapPt: 4,
      bulletIndentInches: 0.22,
      hangingIndentInches: 0.15,
    };
  }
  return {
    sectionGapPt: 6,
    entryGapPt: 5,
    bulletGapPt: 1.8,
    paragraphGapPt: 3,
    bulletIndentInches: 0.2,
    hangingIndentInches: 0.14,
  };
}

export class LayoutSelectionEngine {
  readonly name = "layout-selection-engine";

  execute(input: LayoutSelectionInput): LayoutSelectionOutput {
    const careerEntryCount = input.profile.careerHistory.length;
    const educationEntryCount = input.profile.education.length;
    const estimate = estimateLines(
      careerEntryCount,
      educationEntryCount,
      input.explicitSkillEstimate,
    );
    const capacity = lineCapacity(input.pageSize);
    const pageTarget = determinePageTarget(
      careerEntryCount,
      estimate.renderedLines,
      capacity,
      input.roleAnalysis.seniority,
    );
    const estimatedLinesPerPage = estimate.renderedLines / pageTarget;
    const pageUtilizationRatio = Number((estimatedLinesPerPage / capacity).toFixed(3));
    const density = determineDensity(pageTarget, pageUtilizationRatio);

    return {
      context: input.context,
      pageTarget,
      density,
      typography: typographyForDensity(density),
      margins: marginsForDensity(density),
      spacing: spacingForDensity(density),
      alignment: {
        contact: "center",
        dates: "right",
        sectionHeadings: "left",
        body: "left",
      },
      atsSafeguards: {
        singleColumn: true,
        usesTablesForCoreContent: false,
        usesTextBoxes: false,
        usesIcons: false,
        usesGraphics: false,
        coreContentInHeaderOrFooter: false,
        selectableTextRequired: true,
        standardBulletsRequired: true,
        readingOrder: "top-to-bottom",
        standardSectionHeadings: true,
      },
      contentEstimate: {
        careerEntryCount,
        educationEntryCount,
        estimatedBulletCount: estimate.bulletCount,
        estimatedSkillCount: input.explicitSkillEstimate,
        estimatedSummaryWords: 65,
        estimatedRenderedLines: estimate.renderedLines,
        estimatedLinesPerPage: Number(estimatedLinesPerPage.toFixed(1)),
        pageUtilizationRatio,
      },
    };
  }
}
