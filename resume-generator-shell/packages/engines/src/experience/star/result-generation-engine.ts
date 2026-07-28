import type { JobDescription } from "@resume/contracts";
import type { BulletPlanItem } from "../types/bullet-plan";
import type { KeywordPackage } from "../types/keyword-package";
import type { JDRequirement } from "../types/requirement";
import type { RoleAssignment } from "../types/role-assignment";
import type { StarMetric } from "../types/star-story";
import { STAR_DIMENSION_PROFILES } from "./star-taxonomy";
import { joinNatural, sentence } from "./star-utils";
import { canonicalKeywordKey } from "../keywords/keyword-normalizer";

export interface GeneratedResult {
  result: string;
  technicalImpact: string;
  businessImpact: string;
  businessImpactKey: string;
}

function impactKey(value: string): string {
  return canonicalKeywordKey(value.replace(/[.:;!?]+/g, " "));
}

export class ResultGenerationEngine {
  generate(input: {
    jobDescription: JobDescription;
    plan: BulletPlanItem;
    keywordPackage: KeywordPackage;
    requirement: JDRequirement;
    assignment: RoleAssignment;
    metrics: StarMetric[];
    usedBusinessImpactKeys?: ReadonlySet<string>;
  }): GeneratedResult {
    void input.jobDescription;
    void input.requirement;
    void input.assignment;
    const profile = STAR_DIMENSION_PROFILES[input.plan.achievementDimension];
    const metricText = joinNatural(input.metrics.map((metric) => metric.displayText));
    const outcomes = joinNatural(input.keywordPackage.outcomeKeywords);
    const used = input.usedBusinessImpactKeys ?? new Set<string>();
    const impactCandidates = [
      ...new Set([profile.businessImpact, ...profile.businessImpactAlternates]),
    ];
    const selectedImpact =
      impactCandidates.find((candidate) => !used.has(impactKey(candidate))) ??
      `${profile.businessImpact} for ${input.plan.roleFocusArea || input.assignment.assignedRole}`;
    const firstImpactVerb = /^improved\s+/i.test(selectedImpact)
      ? "strengthened"
      : "improved";
    const result = sentence(
      `${metricText}, which ${firstImpactVerb} ${outcomes || profile.technicalImpact}`,
    );

    return {
      result,
      technicalImpact: sentence(profile.technicalImpact),
      businessImpact: sentence(selectedImpact),
      businessImpactKey: impactKey(selectedImpact),
    };
  }
}
