import type { BulletPlanItem } from "../types/bullet-plan";
import type { JDRequirement } from "../types/requirement";
import type { RoleAssignment } from "../types/role-assignment";
import {
  ACTION_VERBS_BY_CATEGORY,
  ACTION_VERBS_BY_DIMENSION,
} from "./keyword-taxonomy";
import { canonicalActionVerbKey } from "./keyword-normalizer";

export interface ActionVerbSelection {
  actionVerb: string;
  canonicalKey: string;
  rationale: string;
}

const GLOBAL_FALLBACKS = [
  "Architected",
  "Implemented",
  "Optimized",
  "Automated",
  "Scaled",
  "Stabilized",
  "Led",
  "Spearheaded",
  "Mentored",
  "Integrated",
  "Engineered",
  "Delivered",
  "Orchestrated",
  "Established",
  "Directed",
  "Facilitated",
  "Secured",
  "Validated",
  "Modernized",
  "Transformed",
] as const;

function seniorityRank(seniority: RoleAssignment["seniority"]): number {
  switch (seniority) {
    case "entry":
      return 0;
    case "junior":
      return 1;
    case "mid":
      return 2;
    case "senior":
      return 3;
    case "lead":
    case "manager":
      return 4;
    case "staff":
      return 5;
    case "principal":
      return 6;
  }
}

function suitableForSeniority(
  verb: string,
  assignment: RoleAssignment,
  plan: BulletPlanItem,
): boolean {
  const rank = seniorityRank(assignment.seniority);
  if (/^(Spearheaded|Directed|Championed)$/.test(verb)) {
    return rank >= 3 || plan.leadershipFocused;
  }
  if (/^(Mentored|Coached)$/.test(verb)) {
    return rank >= 2 || plan.leadershipFocused;
  }
  return true;
}

export class ActionVerbEngine {
  select(input: {
    plan: BulletPlanItem;
    requirement: JDRequirement;
    assignment: RoleAssignment;
    usedCanonicalKeys: ReadonlySet<string>;
  }): ActionVerbSelection {
    const effectiveDimension = input.plan.leadershipFocused
      ? "technical-leadership"
      : input.plan.communicationFocused
        ? "cross-functional-alignment"
        : input.plan.achievementDimension;
    const dimensionPreferred = ACTION_VERBS_BY_DIMENSION[effectiveDimension];
    const categoryPreferred = ACTION_VERBS_BY_CATEGORY[input.requirement.category];
    const useCategoryFirst =
      !input.plan.communicationFocused &&
      !input.plan.leadershipFocused &&
      (effectiveDimension === "implementation-integration" ||
        effectiveDimension === "customer-business-impact");
    const candidates = useCategoryFirst
      ? [...categoryPreferred, ...dimensionPreferred, ...GLOBAL_FALLBACKS]
      : [...dimensionPreferred, ...categoryPreferred, ...GLOBAL_FALLBACKS];

    for (const actionVerb of candidates) {
      const canonicalKey = canonicalActionVerbKey(actionVerb);
      if (input.usedCanonicalKeys.has(canonicalKey)) {
        continue;
      }
      if (!suitableForSeniority(actionVerb, input.assignment, input.plan)) {
        continue;
      }
      return {
        actionVerb,
        canonicalKey,
        rationale: [
          `Matches the ${effectiveDimension} achievement dimension.`,
          input.plan.leadershipFocused
            ? "Signals senior-level ownership for the reserved leadership achievement."
            : "Uses an ownership-focused verb appropriate to the assigned role.",
        ].join(" "),
      };
    }

    throw new Error(
      `No unused action verb remains for ${input.plan.bulletId} in ${input.assignment.experienceId}.`,
    );
  }
}
