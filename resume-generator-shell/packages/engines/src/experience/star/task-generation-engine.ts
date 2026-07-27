import type { JobDescription } from "@resume/contracts";
import type { BulletPlanItem } from "../types/bullet-plan";
import type { KeywordPackage } from "../types/keyword-package";
import type { JDRequirement } from "../types/requirement";
import type { RoleAssignment } from "../types/role-assignment";
import { STAR_DIMENSION_PROFILES } from "./star-taxonomy";
import { taskObjective } from "./star-language";
import { lowerFirst, sentence } from "./star-utils";

const COMMUNICATION_OWNERSHIP = [
  "Owned cross-team product partnership required to",
  "Owned stakeholder communication loops required to",
  "Owned requirements discovery with partners required to",
  "Owned collaborative delivery planning required to",
] as const;

function ownershipFor(input: {
  plan: BulletPlanItem;
  assignment: RoleAssignment;
}): string {
  if (input.plan.leadershipFocused) {
    return "Owned the technical direction and cross-team execution required to";
  }
  if (input.plan.communicationFocused) {
    const index =
      Math.abs(
        [...input.plan.bulletId].reduce((hash, char) => hash + char.charCodeAt(0), 0),
      ) % COMMUNICATION_OWNERSHIP.length;
    return COMMUNICATION_OWNERSHIP[index]!;
  }
  if (input.assignment.seniority === "entry" || input.assignment.seniority === "junior") {
    return "Took responsibility to";
  }
  return "Owned the effort to";
}

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
    const ownership = ownershipFor(input);
    const primaryKeyword =
      input.keywordPackage.directKeywords[0] ?? input.requirement.normalizedText;
    return sentence(
      `${ownership} ${taskObjective(primaryKeyword)} and ${lowerFirst(profile.taskOwnership)}`,
    );
  }
}
