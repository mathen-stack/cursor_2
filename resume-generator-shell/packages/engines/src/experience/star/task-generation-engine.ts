import type { JobDescription } from "@resume/contracts";
import type { BulletPlanItem } from "../types/bullet-plan";
import type { KeywordPackage } from "../types/keyword-package";
import type { JDRequirement } from "../types/requirement";
import type { RoleAssignment } from "../types/role-assignment";
import { STAR_DIMENSION_PROFILES } from "./star-taxonomy";
import { taskObjective } from "./star-language";
import { lowerFirst, sentence } from "./star-utils";

export class TaskGenerationEngine {
  generate(input: {
    jobDescription: JobDescription;
    plan: BulletPlanItem;
    keywordPackage: KeywordPackage;
    requirement: JDRequirement;
    assignment: RoleAssignment;
  }): string {
    void input.jobDescription;
    const profile = STAR_DIMENSION_PROFILES[input.plan.achievementDimension];
    const ownership = input.plan.leadershipFocused
      ? "Owned the technical direction and cross-team execution required to"
      : input.plan.communicationFocused
        ? "Owned stakeholder alignment and delivery coordination required to"
        : input.assignment.seniority === "entry" || input.assignment.seniority === "junior"
          ? "Took responsibility to"
          : "Owned the effort to";
    const primaryKeyword = input.keywordPackage.directKeywords[0] ?? input.requirement.normalizedText;
    return sentence(
      `${ownership} ${taskObjective(primaryKeyword)} and ${lowerFirst(profile.taskOwnership)}`,
    );
  }
}
