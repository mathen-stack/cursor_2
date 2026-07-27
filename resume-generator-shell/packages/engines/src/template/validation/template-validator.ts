import type {
  TemplateDefinition,
  TemplateRoleAnalysis,
  TemplateValidationIssue,
  TemplateValidationResult,
  UserProfile,
} from "@resume/contracts";

export interface TemplateValidationInput {
  template: TemplateDefinition;
  roleAnalysis: TemplateRoleAnalysis;
  profile: UserProfile;
}

const REQUIRED_ORDER_PREFIX = [
  "contact",
  "professional-summary",
  "skills",
  "professional-experience",
] as const;

function scoreBoolean(value: boolean, weight: number): number {
  return value ? weight : 0;
}

export class TemplateValidator {
  validate(input: TemplateValidationInput): TemplateValidationResult {
    const { template } = input;
    const issues: TemplateValidationIssue[] = [];

    const sectionSelectionApproved = REQUIRED_ORDER_PREFIX.every((section) =>
      template.sectionOrder.includes(section),
    ) &&
      (input.profile.education.length === 0 || template.sectionOrder.includes("education"));
    if (!sectionSelectionApproved) {
      issues.push({
        issueCode: "SECTION_SELECTION",
        severity: "error",
        message: "The template is missing a required resume section.",
      });
    }

    const prefix = template.sectionOrder.slice(0, REQUIRED_ORDER_PREFIX.length);
    const sectionOrderApproved = REQUIRED_ORDER_PREFIX.every(
      (section, index) => prefix[index] === section,
    );
    if (!sectionOrderApproved) {
      issues.push({
        issueCode: "SECTION_ORDER",
        severity: "error",
        message: "Core sections are not in the approved ATS reading order.",
      });
    }

    const singleColumnApproved = template.layout === "single-column" && template.columns === 1;
    if (!singleColumnApproved) {
      issues.push({
        issueCode: "LAYOUT_COLUMNS",
        severity: "error",
        message: "Core resume content must use a single-column layout.",
      });
    }

    const safeguards = template.atsSafeguards;
    const atsSafeguardsApproved =
      safeguards.singleColumn &&
      !safeguards.usesTablesForCoreContent &&
      !safeguards.usesTextBoxes &&
      !safeguards.usesIcons &&
      !safeguards.usesGraphics &&
      !safeguards.coreContentInHeaderOrFooter &&
      safeguards.selectableTextRequired &&
      safeguards.standardBulletsRequired &&
      safeguards.standardSectionHeadings &&
      safeguards.readingOrder === "top-to-bottom";
    if (!atsSafeguardsApproved) {
      issues.push({
        issueCode: "ATS_SAFEGUARDS",
        severity: "error",
        message: "One or more ATS parsing safeguards are disabled.",
      });
    }

    const font = template.typography;
    const typographyApproved =
      ["Arial", "Calibri", "Times New Roman"].includes(font.fontFamily) &&
      font.bodySizePt >= 10 &&
      font.bodySizePt <= 11.5 &&
      font.bodyLineHeight >= 1.0 &&
      font.bodyLineHeight <= 1.2 &&
      font.sectionHeadingSizePt > font.bodySizePt &&
      font.nameSizePt >= 16 &&
      font.nameSizePt <= 22;
    if (!typographyApproved) {
      issues.push({
        issueCode: "TYPOGRAPHY",
        severity: "error",
        message: "Typography falls outside the approved readable ATS range.",
      });
    }

    const marginValues = [
      template.margins.topInches,
      template.margins.rightInches,
      template.margins.bottomInches,
      template.margins.leftInches,
    ];
    const marginsApproved = marginValues.every((value) => value >= 0.5 && value <= 0.85);
    if (!marginsApproved) {
      issues.push({
        issueCode: "MARGINS",
        severity: "error",
        message: "Margins must remain between 0.5 and 0.85 inches.",
      });
    }

    const spacing = template.spacing;
    const spacingApproved =
      spacing.sectionGapPt >= 4 &&
      spacing.entryGapPt >= 3 &&
      spacing.bulletGapPt >= 1 &&
      spacing.bulletIndentInches >= 0.15 &&
      spacing.bulletIndentInches <= 0.3;
    if (!spacingApproved) {
      issues.push({
        issueCode: "SPACING",
        severity: "error",
        message: "Spacing is too compressed or too loose for reliable scanning.",
      });
    }

    const pageCapacity = template.pageSize === "a4" ? 58 : 56;
    const seniorProfile = ["senior", "lead", "staff", "principal", "manager"].includes(
      input.roleAnalysis.seniority,
    );
    const expectedPageTarget: 1 | 2 =
      template.contentEstimate.careerEntryCount >= 2 ||
      template.contentEstimate.estimatedRenderedLines > pageCapacity * 0.92 ||
      (seniorProfile &&
        template.contentEstimate.estimatedRenderedLines > pageCapacity * 0.82)
        ? 2
        : 1;
    const pageTargetApproved = template.pageTarget === expectedPageTarget;
    if (!pageTargetApproved) {
      issues.push({
        issueCode: "PAGE_TARGET",
        severity: "error",
        message: "The selected page target does not match the estimated content volume.",
      });
    }

    const utilization = template.contentEstimate.pageUtilizationRatio;
    const contentFitApproved = utilization >= 0.35 && utilization <= 0.96;
    if (!contentFitApproved) {
      issues.push({
        issueCode: "CONTENT_FIT",
        severity: utilization > 1 ? "error" : "warning",
        message:
          utilization > 1
            ? "Estimated content exceeds the selected page target."
            : "Estimated content may leave excessive unused space.",
      });
    }

    const expectedTemplateId = `ATS-SC-${template.pageSize.toUpperCase()}-${template.pageTarget}P-${template.density.toUpperCase()}-V1`;
    const deterministicDefinitionApproved = template.templateId === expectedTemplateId;
    if (!deterministicDefinitionApproved) {
      issues.push({
        issueCode: "TEMPLATE_ID",
        severity: "error",
        message: "Template ID is inconsistent with the selected layout definition.",
      });
    }

    const resumeWordedReadinessScore = Math.round(
      scoreBoolean(sectionSelectionApproved, 12) +
        scoreBoolean(sectionOrderApproved, 12) +
        scoreBoolean(singleColumnApproved, 12) +
        scoreBoolean(atsSafeguardsApproved, 18) +
        scoreBoolean(typographyApproved, 12) +
        scoreBoolean(marginsApproved, 8) +
        scoreBoolean(spacingApproved, 8) +
        scoreBoolean(pageTargetApproved, 8) +
        scoreBoolean(contentFitApproved, 6) +
        scoreBoolean(deterministicDefinitionApproved, 4),
    );

    const overallStatus = issues.some((issue) => issue.severity === "error")
      ? "rejected"
      : "approved";

    return {
      sectionSelectionApproved,
      sectionOrderApproved,
      singleColumnApproved,
      atsSafeguardsApproved,
      typographyApproved,
      marginsApproved,
      spacingApproved,
      pageTargetApproved,
      contentFitApproved,
      deterministicDefinitionApproved,
      resumeWordedReadinessScore,
      issues,
      overallStatus,
    };
  }
}
