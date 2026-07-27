import type { JobDescription } from "@resume/contracts";
import type { BulletPlanItem } from "../types/bullet-plan";
import type { KeywordPackage } from "../types/keyword-package";
import type { JDRequirement } from "../types/requirement";
import type { RoleAssignment } from "../types/role-assignment";
import { STAR_DIMENSION_PROFILES } from "./star-taxonomy";
import { cleanScope } from "./star-language";
import { sentence } from "./star-utils";

export class SituationGenerationEngine {
  generate(input: {
    jobDescription: JobDescription;
    plan: BulletPlanItem;
    keywordPackage: KeywordPackage;
    requirement: JDRequirement;
    assignment: RoleAssignment;
  }): string {
    void input.jobDescription;
    const profile = STAR_DIMENSION_PROFILES[input.plan.achievementDimension];
    const scope = cleanScope(input.plan.roleFocusArea || input.requirement.normalizedText);
    return sentence(
      `${profile.situationProblem} for initiatives involving ${scope}, creating a clear need for ${input.keywordPackage.outcomeKeywords[0] ?? "measurable improvement"}`,
    );
  }
}
