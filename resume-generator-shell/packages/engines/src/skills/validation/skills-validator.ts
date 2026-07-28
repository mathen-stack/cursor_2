import type {
  GeneratedSkill,
  JobDescription,
  SkillCategory,
  SkillsValidationIssue,
} from "@resume/contracts";
import {
  SKILL_CATEGORY_ORDER,
  SKILL_DEFINITION_BY_KEY,
} from "../skill-taxonomy";
import type { SkillCandidate } from "../types/skill-candidate";

export interface SkillsValidationInput {
  jobDescription: JobDescription;
  explicitCandidates: SkillCandidate[];
  selected: GeneratedSkill[];
  categories: SkillCategory[];
  minimumSkills: number;
  maximumSkills: number;
}

export interface SkillsValidationResult {
  explicitSkillsCovered: boolean;
  noDuplicateSkills: boolean;
  categoryStructureApproved: boolean;
  inferredSkillsGrounded: boolean;
  skillDensityApproved: boolean;
  totalSkillCount: number;
  explicitSkillCount: number;
  inferredSkillCount: number;
  issues: SkillsValidationIssue[];
  overallStatus: "approved" | "rejected";
}

function issue(
  issueCode: string,
  severity: "warning" | "error",
  message: string,
  skillIds: string[] = [],
): SkillsValidationIssue {
  return { issueCode, severity, message, skillIds };
}

export class SkillsValidator {
  readonly name = "skills-validator";

  validate(input: SkillsValidationInput): SkillsValidationResult {
    const issues: SkillsValidationIssue[] = [];
    const selectedKeys = new Set(input.selected.map((skill) => skill.normalizedKey));
    const requiredExplicit = input.explicitCandidates.filter(
      (candidate) => candidate.priority === "critical" || candidate.priority === "high",
    );
    const missingRequired = requiredExplicit.filter(
      (candidate) => !selectedKeys.has(candidate.key),
    );
    if (missingRequired.length > 0) {
      issues.push(
        issue(
          "MISSING_HIGH_PRIORITY_EXPLICIT_SKILLS",
          "error",
          `High-priority JD skills were omitted: ${missingRequired
            .map((candidate) => candidate.name)
            .join(", ")}.`,
        ),
      );
    }

    const seenKeys = new Set<string>();
    const duplicateIds: string[] = [];
    for (const skill of input.selected) {
      if (seenKeys.has(skill.normalizedKey)) duplicateIds.push(skill.skillId);
      seenKeys.add(skill.normalizedKey);
    }
    if (duplicateIds.length > 0) {
      issues.push(
        issue(
          "DUPLICATE_SKILLS",
          "error",
          "Duplicate or alias-equivalent skills remain in the Skills section.",
          duplicateIds,
        ),
      );
    }

    const explicitKeys = new Set(input.explicitCandidates.map((candidate) => candidate.key));
    const ungroundedInferred = input.selected.filter(
      (skill) =>
        skill.source === "inferred" &&
        (skill.inferredFrom.length === 0 ||
          !skill.inferredFrom.some((key) => explicitKeys.has(key))),
    );
    if (ungroundedInferred.length > 0) {
      issues.push(
        issue(
          "UNGROUNDED_INFERRED_SKILLS",
          "error",
          "One or more inferred supporting skills do not have an explicit JD trigger.",
          ungroundedInferred.map((skill) => skill.skillId),
        ),
      );
    }

    const invalidEvidence = input.selected.filter((skill) => {
      if (skill.source !== "explicit" || skill.evidence.length === 0) return skill.source === "explicit";
      return skill.evidence.some(
        (evidence) =>
          input.jobDescription.rawText.slice(evidence.startIndex, evidence.endIndex) !==
          evidence.sourceText,
      );
    });
    if (invalidEvidence.length > 0) {
      issues.push(
        issue(
          "INVALID_SKILL_EVIDENCE",
          "error",
          "Explicit skill evidence does not match the immutable JD.",
          invalidEvidence.map((skill) => skill.skillId),
        ),
      );
    }

    const categoryNames = new Set<string>();
    const invalidCategoryIds: string[] = [];
    for (const category of input.categories) {
      if (categoryNames.has(category.name) || category.skills.length === 0) {
        invalidCategoryIds.push(
          ...input.selected
            .filter((skill) => skill.category === category.name)
            .map((skill) => skill.skillId),
        );
      }
      categoryNames.add(category.name);
      if (!SKILL_CATEGORY_ORDER.includes(category.name as (typeof SKILL_CATEGORY_ORDER)[number])) {
        invalidCategoryIds.push(
          ...input.selected
            .filter((skill) => skill.category === category.name)
            .map((skill) => skill.skillId),
        );
      }
    }
    for (const skill of input.selected) {
      const definition = SKILL_DEFINITION_BY_KEY.get(skill.normalizedKey);
      if (!definition || definition.category !== skill.category) {
        invalidCategoryIds.push(skill.skillId);
      }
    }
    if (invalidCategoryIds.length > 0 || input.categories.length > SKILL_CATEGORY_ORDER.length) {
      issues.push(
        issue(
          "INVALID_SKILL_CATEGORIES",
          "error",
          "Skill categories are duplicated, empty, unsupported, or inconsistent.",
          [...new Set(invalidCategoryIds)],
        ),
      );
    }

    const skillCount = input.selected.length;
    const densityApproved =
      skillCount >= input.minimumSkills && skillCount <= input.maximumSkills;
    if (!densityApproved) {
      issues.push(
        issue(
          "SKILL_DENSITY_OUT_OF_RANGE",
          skillCount < 4 || skillCount > input.maximumSkills ? "error" : "warning",
          `Generated ${skillCount} skills; the target range is ${input.minimumSkills}-${input.maximumSkills}.`,
        ),
      );
    }

    const inferredCount = input.selected.filter((skill) => skill.source === "inferred").length;
    const inferredRatio = skillCount === 0 ? 0 : inferredCount / skillCount;
    if (inferredRatio > 0.4) {
      issues.push(
        issue(
          "EXCESSIVE_INFERRED_SKILLS",
          "warning",
          "More than 40% of selected skills are inferred rather than directly stated in the JD.",
          input.selected
            .filter((skill) => skill.source === "inferred")
            .map((skill) => skill.skillId),
        ),
      );
    }

    const hasErrors = issues.some((item) => item.severity === "error");
    return {
      explicitSkillsCovered: missingRequired.length === 0,
      noDuplicateSkills: duplicateIds.length === 0,
      categoryStructureApproved:
        invalidCategoryIds.length === 0 &&
        input.categories.length <= SKILL_CATEGORY_ORDER.length,
      inferredSkillsGrounded: ungroundedInferred.length === 0,
      skillDensityApproved: densityApproved,
      totalSkillCount: skillCount,
      explicitSkillCount: input.selected.filter((skill) => skill.source === "explicit").length,
      inferredSkillCount: inferredCount,
      issues,
      overallStatus: hasErrors ? "rejected" : "approved",
    };
  }
}
