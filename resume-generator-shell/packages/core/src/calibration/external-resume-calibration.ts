import type {
  CalibrationIssueMapping,
  ExternalResumeFeedbackCategory,
  ExternalResumeTestInput,
  ExternalResumeTestRecord,
  ResumeReadinessCategoryId,
  ResumeReadinessOwner,
} from "@resume/contracts";
import { ExternalResumeTestInputSchema } from "@resume/contracts";
import { createHash, randomUUID } from "node:crypto";

interface MappingRule {
  owner: ResumeReadinessOwner;
  readinessCategoryId: ResumeReadinessCategoryId;
  action: string;
}

const RULES: Record<ExternalResumeFeedbackCategory, MappingRule> = {
  impact: {
    owner: "experience",
    readinessCategoryId: "impact",
    action: "Review Result and Metric generation for the affected bullets.",
  },
  brevity: {
    owner: "experience",
    readinessCategoryId: "brevity",
    action: "Tighten only affected bullet compositions or the Summary output.",
  },
  style: {
    owner: "summary",
    readinessCategoryId: "ats-and-formatting",
    action: "Route the exact style issue to Summary or Experience sentence validation.",
  },
  sections: {
    owner: "template",
    readinessCategoryId: "section-completeness",
    action: "Review Template section selection without adding unsupported profile data.",
  },
  ats: {
    owner: "rendering",
    readinessCategoryId: "ats-and-formatting",
    action: "Inspect template and exported artifact parsing while preserving content.",
  },
  "keyword-relevance": {
    owner: "orchestrator",
    readinessCategoryId: "jd-relevance",
    action: "Map missing JD requirements to the responsible isolated content engine.",
  },
  leadership: {
    owner: "experience",
    readinessCategoryId: "leadership-and-growth",
    action: "Add or strengthen one distinct senior-scope achievement where required.",
  },
  growth: {
    owner: "experience",
    readinessCategoryId: "leadership-and-growth",
    action: "Review automatic role progression and scope distribution across roles.",
  },
  repetition: {
    owner: "experience",
    readinessCategoryId: "repetition-control",
    action: "Selectively regenerate only repeated bullets while preserving approved content.",
  },
  formatting: {
    owner: "template",
    readinessCategoryId: "ats-and-formatting",
    action: "Adjust layout parameters only; do not rewrite resume content.",
  },
  other: {
    owner: "orchestrator",
    readinessCategoryId: "jd-relevance",
    action: "Review the feedback manually and route it to one isolated engine.",
  },
};

function hashId(input: ExternalResumeTestInput): string {
  return createHash("sha256")
    .update(
      [
        input.generationId,
        input.documentFingerprint,
        input.overallScore,
        input.relevancyScore ?? "none",
        input.testedAt ?? "now",
        randomUUID(),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 20);
}

export class ExternalCalibrationContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalCalibrationContextError";
  }
}

export class ExternalResumeCalibrationAnalyzer {
  createRecord(rawInput: ExternalResumeTestInput): ExternalResumeTestRecord {
    const input = ExternalResumeTestInputSchema.parse(rawInput);
    if (!input.generationId.startsWith("GEN-")) {
      throw new ExternalCalibrationContextError(
        "External test results must reference a valid generation ID.",
      );
    }
    const mappedIssues: CalibrationIssueMapping[] = input.feedback.map((item) => {
      const rule = RULES[item.category];
      return {
        feedbackCategory: item.category,
        owner: rule.owner,
        readinessCategoryId: rule.readinessCategoryId,
        confidence: item.category === "other" ? 0.55 : 0.95,
        feedbackMessage: item.message,
        recommendedEngineAction: rule.action,
      };
    });
    return {
      calibrationId: `CAL-${hashId(input)}`,
      platform: input.platform,
      generationId: input.generationId,
      jdId: input.jdId,
      jdHash: input.jdHash,
      documentFingerprint: input.documentFingerprint,
      internalReadinessScore: input.internalReadinessScore,
      externalOverallScore: input.overallScore,
      ...(input.relevancyScore !== undefined
        ? { externalRelevancyScore: input.relevancyScore }
        : {}),
      overallScoreDelta: Math.round((input.overallScore - input.internalReadinessScore) * 10) / 10,
      ...(input.relevancyScore !== undefined
        ? {
            relevancyScoreDelta:
              Math.round((input.relevancyScore - input.internalReadinessScore) * 10) / 10,
          }
        : {}),
      feedback: structuredClone(input.feedback),
      mappedIssues,
      ...(input.notes ? { notes: input.notes } : {}),
      testedAt: input.testedAt ?? new Date().toISOString(),
      recordedAt: new Date().toISOString(),
      isolationPolicy: "generation-scoped",
    };
  }
}
