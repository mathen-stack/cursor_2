import type {
  TemplateDefinition,
  TemplateEngine,
  TemplateEngineInput,
  TemplateEngineOutput,
} from "@resume/contracts";
import { TemplateContextAnalyzer } from "./analysis/template-context-analyzer";
import { LayoutSelectionEngine } from "./selection/layout-selection-engine";
import { SectionSelectionEngine } from "./selection/section-selection-engine";
import { assertTemplateContextMatch } from "./types/context";
import { TemplateValidator } from "./validation/template-validator";

export interface TemplateEngineDependencies {
  contextAnalyzer: TemplateContextAnalyzer;
  sectionSelectionEngine: SectionSelectionEngine;
  layoutSelectionEngine: LayoutSelectionEngine;
  validator: TemplateValidator;
}

export interface DefaultTemplateEngineOptions {
  engineVersion?: string;
  minimumReadinessScore?: number;
}

export class DefaultTemplateEngine implements TemplateEngine {
  readonly name = "template-engine";
  readonly version: string;
  private readonly minimumReadinessScore: number;

  constructor(
    private readonly dependencies: TemplateEngineDependencies,
    options: DefaultTemplateEngineOptions = {},
  ) {
    this.version = options.engineVersion ?? "1.0.0";
    this.minimumReadinessScore = options.minimumReadinessScore ?? 90;
    if (this.minimumReadinessScore < 70 || this.minimumReadinessScore > 100) {
      throw new Error("Template minimumReadinessScore must be between 70 and 100.");
    }
  }

  async execute(input: TemplateEngineInput): Promise<TemplateEngineOutput> {
    this.assertInput(input);

    const analysis = this.dependencies.contextAnalyzer.execute({
      context: input.context,
      jobDescription: input.jobDescription,
      profile: input.profile,
    });
    assertTemplateContextMatch(
      input.context,
      analysis.context,
      this.dependencies.contextAnalyzer.name,
    );

    const sectionSelection = this.dependencies.sectionSelectionEngine.execute({
      context: input.context,
      profile: input.profile,
    });
    assertTemplateContextMatch(
      input.context,
      sectionSelection.context,
      this.dependencies.sectionSelectionEngine.name,
    );

    const layout = this.dependencies.layoutSelectionEngine.execute({
      context: input.context,
      profile: input.profile,
      roleAnalysis: analysis.roleAnalysis,
      pageSize: analysis.pageSize,
      explicitSkillEstimate: analysis.explicitSkillEstimate,
    });
    assertTemplateContextMatch(
      input.context,
      layout.context,
      this.dependencies.layoutSelectionEngine.name,
    );

    const templateId = `ATS-SC-${analysis.pageSize.toUpperCase()}-${layout.pageTarget}P-${layout.density.toUpperCase()}-V1`;
    const template: TemplateDefinition = {
      templateId,
      templateName: `ATS Single-Column ${layout.pageTarget}-Page ${layout.density[0]?.toUpperCase() ?? "B"}${layout.density.slice(1)}`,
      sectionOrder: sectionSelection.sectionOrder,
      sections: sectionSelection.sections,
      layout: "single-column",
      columns: 1,
      pageTarget: layout.pageTarget,
      pageSize: analysis.pageSize,
      density: layout.density,
      typography: layout.typography,
      margins: layout.margins,
      spacing: layout.spacing,
      alignment: layout.alignment,
      atsSafeguards: layout.atsSafeguards,
      contentEstimate: layout.contentEstimate,
    };

    const validation = this.dependencies.validator.validate({
      template,
      roleAnalysis: analysis.roleAnalysis,
      profile: input.profile,
    });
    const approved =
      validation.overallStatus === "approved" &&
      validation.resumeWordedReadinessScore >= this.minimumReadinessScore;

    return {
      context: input.context,
      engineName: this.name,
      engineVersion: this.version,
      status: approved ? "approved" : "rejected",
      roleAnalysis: analysis.roleAnalysis,
      template,
      validation: approved
        ? validation
        : {
            ...validation,
            overallStatus: "rejected",
            issues:
              validation.resumeWordedReadinessScore < this.minimumReadinessScore
                ? [
                    ...validation.issues,
                    {
                      issueCode: "READINESS_SCORE",
                      severity: "error",
                      message: `Template readiness score ${validation.resumeWordedReadinessScore} is below ${this.minimumReadinessScore}.`,
                    },
                  ]
                : validation.issues,
          },
    };
  }

  private assertInput(input: TemplateEngineInput): void {
    const matches =
      input.context.jdId === input.jobDescription.jdId &&
      input.context.jdHash === input.jobDescription.contentHash &&
      input.context.profileId === input.profile.profileId;
    if (!matches) {
      throw new Error(
        "Template Engine input context does not match the supplied JD and profile.",
      );
    }
  }
}
