import type { JDRequirement, RequirementCategory } from "../types/requirement";
import type { RoleAssignment } from "../types/role-assignment";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "of",
  "on",
  "or",
  "our",
  "the",
  "their",
  "to",
  "using",
  "with",
]);

export const EXPERIENCE_EXCLUDED_CATEGORIES = new Set<RequirementCategory>([
  "education",
  "experience",
]);

export function normalizePlanningText(value: string): string {
  return value
    .toLowerCase()
    .replace(/machine learning/g, "machine-learning")
    .replace(/cross[ -]functional/g, "cross-functional")
    .replace(/[^a-z0-9+#./-]+/g, " ")
    .trim();
}

export function tokenizePlanningText(value: string): Set<string> {
  return new Set(
    normalizePlanningText(value)
      .split(/\s+/)
      .map((token) => token.replace(/^-+|-+$/g, ""))
      .filter((token) => token.length >= 2 && !STOP_WORDS.has(token)),
  );
}

export function tokenOverlapScore(left: string, right: string): number {
  const leftTokens = tokenizePlanningText(left);
  const rightTokens = tokenizePlanningText(right);
  let overlap = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap;
}

export function isExperienceEligible(requirement: JDRequirement): boolean {
  return !EXPERIENCE_EXCLUDED_CATEGORIES.has(requirement.category);
}

export function isExperienceAchievementRequirement(
  requirement: JDRequirement,
): boolean {
  return (
    isExperienceEligible(requirement) &&
    requirement.category !== "technical-skill" &&
    requirement.category !== "tool-or-platform"
  );
}

export function priorityWeight(requirement: JDRequirement): number {
  switch (requirement.priority) {
    case "critical":
      return 40;
    case "high":
      return 28;
    case "medium":
      return 16;
    case "low":
      return 8;
  }
}

export function necessityWeight(requirement: JDRequirement): number {
  switch (requirement.necessity) {
    case "required":
      return 10;
    case "preferred":
      return 4;
    case "implied":
      return 1;
  }
}

export function categoryDeliveryWeight(category: RequirementCategory): number {
  switch (category) {
    case "architecture":
    case "deployment":
    case "monitoring":
    case "performance":
    case "data":
    case "security":
    case "technical-responsibility":
      return 10;
    case "business-outcome":
    case "leadership":
    case "collaboration":
    case "communication":
      return 8;
    case "technical-skill":
    case "tool-or-platform":
      return 5;
    case "other":
      return 2;
    case "education":
    case "experience":
      return -100;
  }
}

export function seniorityLevel(seniority: RoleAssignment["seniority"]): number {
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

export function isLeadershipCategory(category: RequirementCategory): boolean {
  return category === "leadership" || category === "architecture";
}

export function isCommunicationCategory(category: RequirementCategory): boolean {
  return category === "communication" || category === "collaboration";
}

export function requirementRoleFitScore(
  requirement: JDRequirement,
  assignment: RoleAssignment,
): number {
  let score = priorityWeight(requirement) + necessityWeight(requirement);
  score += categoryDeliveryWeight(requirement.category);

  if (assignment.sourceRequirementIds.includes(requirement.requirementId)) {
    score += 32;
  }

  const focusText = assignment.focusAreas.join(" ");
  score += tokenOverlapScore(requirement.normalizedText, focusText) * 7;
  score += tokenOverlapScore(requirement.normalizedText, assignment.assignedRole) * 5;

  const seniority = seniorityLevel(assignment.seniority);
  const recency = Math.max(0, 7 - assignment.chronologyRank);

  if (requirement.priority === "critical") {
    score += recency * 4;
  } else if (requirement.priority === "high") {
    score += recency * 2;
  }

  if (isLeadershipCategory(requirement.category)) {
    score += seniority * 6;
  }

  if (isCommunicationCategory(requirement.category)) {
    score += Math.max(2, recency);
  }

  if (
    requirement.category === "technical-skill" ||
    requirement.category === "tool-or-platform"
  ) {
    score += Math.max(0, 5 - seniority);
  }

  if (assignment.isMostRecent) {
    score += 5;
  }

  return score;
}

export function requirementPlanningOrder(
  left: JDRequirement,
  right: JDRequirement,
): number {
  const leftScore =
    priorityWeight(left) + necessityWeight(left) + categoryDeliveryWeight(left.category);
  const rightScore =
    priorityWeight(right) + necessityWeight(right) + categoryDeliveryWeight(right.category);

  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  return left.requirementId.localeCompare(right.requirementId);
}
