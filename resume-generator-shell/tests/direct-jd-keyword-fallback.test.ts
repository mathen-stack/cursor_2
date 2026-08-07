import { describe, expect, it } from "vitest";
import { createJobDescription } from "@resume/core";
import { DirectJDKeywordEngine } from "../packages/engines/src/experience/keywords/direct-jd-keyword-engine";
import type { BulletPlanItem } from "../packages/engines/src/experience/types/bullet-plan";
import type { JDRequirement } from "../packages/engines/src/experience/types/requirement";

function plan(bulletId: string, requirementId: string): BulletPlanItem {
  return {
    bulletId,
    experienceId: "EXP-001",
    sequence: 5,
    requirementId,
    supportingRequirementIds: [],
    requirementAllocationKind: "primary",
    achievementDimension: "implementation-integration",
    achievementTheme: "Delivery",
    roleFocusArea: "Delivery",
    communicationFocused: false,
    leadershipFocused: false,
    planningRationale: "test",
  };
}

function requirement(sourceText: string): JDRequirement {
  return {
    requirementId: "REQ-SOFT",
    sourceText,
    normalizedText: sourceText,
    category: "communication",
    priority: "medium",
    necessity: "preferred",
    evidence: [
      {
        sourceText,
        startIndex: 0,
        endIndex: Math.max(1, sourceText.length),
      },
    ],
  };
}

describe("direct JD keyword ultimate grounded fallback", () => {
  it("allocates a JD-grounded keyword instead of throwing when patterns miss", () => {
    // Soft-skill / marketing copy is rejected by finalizeKeywordPhrase, and this
    // JD has no curated action-object/tool patterns — previously hard-failed for
    // late bullets such as EXP-001-B-005.
    const jobDescription = createJobDescription(
      "Job 1 | Target Company\nLooking for a proven track record and strong communication skills.",
    );
    const req = requirement(
      "Looking for a proven track record and strong communication skills.",
    );
    const selection = new DirectJDKeywordEngine().select({
      jobDescription,
      plan: plan("EXP-001-B-005", req.requirementId),
      requirementsById: new Map([[req.requirementId, req]]),
      usedCanonicalKeys: new Set<string>(),
      maximumKeywords: 2,
    });

    expect(selection.keywords.length).toBeGreaterThan(0);
    for (const keyword of selection.keywords) {
      expect(jobDescription.rawText.toLocaleLowerCase()).toContain(
        keyword.toLocaleLowerCase(),
      );
    }
    for (const evidence of selection.evidence) {
      expect(
        jobDescription.rawText.slice(evidence.startIndex, evidence.endIndex),
      ).toBe(evidence.keyword);
    }
  });
});
