import type { JobDescription } from "@resume/contracts";
import type { BulletPlanItem } from "../types/bullet-plan";
import type { KeywordPackage } from "../types/keyword-package";
import type { JDRequirement } from "../types/requirement";
import type { RoleAssignment } from "../types/role-assignment";
import { STAR_DIMENSION_PROFILES } from "./star-taxonomy";
import { actionObject as selectActionObject } from "./star-language";
import { joinNatural, sentence } from "./star-utils";

export class ActionGenerationEngine {
  generate(input: {
    jobDescription: JobDescription;
    plan: BulletPlanItem;
    keywordPackage: KeywordPackage;
    requirement: JDRequirement;
    assignment: RoleAssignment;
  }): string {
    void input.jobDescription;
    void input.assignment;
    const profile = STAR_DIMENSION_PROFILES[input.plan.achievementDimension];
    const supporting = joinNatural(input.keywordPackage.supportingKeywords);
    const focus = selectActionObject(input.keywordPackage.directKeywords, input.requirement.normalizedText);

    const collaborationClause = input.plan.communicationFocused
      ? " while aligning product, engineering, and business stakeholders"
      : input.plan.leadershipFocused
        ? " while setting technical direction and coordinating implementation"
        : "";
    const supportClause = supporting
      ? `${/\busing\b/i.test(focus) ? " with" : " using"} ${supporting}`
      : "";

    const actionPhrase = input.plan.communicationFocused
      ? `collaboration with ${focus}`
      : focus;

    return sentence(
      `${input.keywordPackage.actionVerb} ${actionPhrase}${supportClause}, ${profile.actionMethod}${collaborationClause}`,
    );
  }
}
