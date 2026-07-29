import type { JDRequirement } from "../types/requirement";
import type {
  CareerSeniority,
  RoleAssignment,
  RoleAssignmentEngine,
  RoleAssignmentInput,
  RoleAssignmentOutput,
  TargetRoleAnalysis,
} from "../types/role-assignment";
import {
  buildCareerTimeline,
  calculateNonOverlappingExperienceMonths,
  type ParsedCareerEntry,
} from "./career-timeline";
import {
  formatRoleTitle,
  ROLE_DEFINITIONS,
  type RoleDefinition,
} from "./role-taxonomy";
import { analyzeTargetRole } from "./target-role-analyzer";
import { validateRoleAssignments } from "./role-assignment-validator";

export interface RealRoleAssignmentEngineOptions {
  referenceDate?: Date;
  focusAreasPerRole?: number;
}

interface PlannedRole {
  title: string;
  seniority: CareerSeniority;
}

const PRIORITY_RANK: Readonly<Record<JDRequirement["priority"], number>> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function findDefinition(analysis: TargetRoleAnalysis): RoleDefinition {
  const definition = ROLE_DEFINITIONS.find(
    (candidate) => candidate.family === analysis.roleFamily,
  );
  if (!definition) {
    throw new Error(`Unsupported role family ${analysis.roleFamily}.`);
  }
  return definition;
}

function juniorTitle(title: string): string {
  return title.startsWith("Junior ") ? title : `Junior ${title}`;
}

function buildRoleProgression(
  analysis: TargetRoleAnalysis,
  definition: RoleDefinition,
): PlannedRole[] {
  const target: PlannedRole = {
    title: analysis.targetRole,
    seniority: analysis.seniority,
  };
  const practitioner: PlannedRole = {
    title: definition.progression.practitioner,
    seniority: "mid",
  };
  const senior: PlannedRole = {
    title: formatRoleTitle(analysis.baseRole, "senior"),
    seniority: "senior",
  };
  const foundational: PlannedRole = {
    title: definition.progression.foundational,
    seniority: "mid",
  };
  const juniorFoundational: PlannedRole = {
    title: juniorTitle(definition.progression.foundational),
    seniority: "junior",
  };

  switch (analysis.seniority) {
    case "principal":
    case "staff":
      return [target, senior, practitioner, foundational, juniorFoundational];
    case "lead":
    case "manager":
      return [target, senior, practitioner, foundational, juniorFoundational];
    case "senior":
      return [target, practitioner, foundational, juniorFoundational];
    case "mid":
      return [target, foundational, juniorFoundational];
    case "junior":
      return [target, juniorFoundational];
    case "entry":
      return [target, { ...foundational, seniority: "entry" }];
  }
}

function roleForRank(
  progression: readonly PlannedRole[],
  chronologyRank: number,
): PlannedRole {
  const index = Math.min(chronologyRank - 1, progression.length - 1);
  const planned = progression[index];
  if (!planned) {
    throw new Error(`Unable to plan role for chronology rank ${chronologyRank}.`);
  }
  return planned;
}

function sortRequirementsForFocus(
  requirements: readonly JDRequirement[],
): JDRequirement[] {
  const categoryWeight = (requirement: JDRequirement): number => {
    if (["technical-responsibility", "architecture", "deployment"].includes(requirement.category)) {
      return 4;
    }
    if (["monitoring", "performance", "data", "security"].includes(requirement.category)) {
      return 3;
    }
    if (["leadership", "communication", "collaboration"].includes(requirement.category)) {
      return 2;
    }
    return 1;
  };

  return [...requirements].sort((left, right) => {
    const priorityDifference =
      PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority];
    if (priorityDifference !== 0) return priorityDifference;

    const categoryDifference = categoryWeight(right) - categoryWeight(left);
    if (categoryDifference !== 0) return categoryDifference;

    return left.requirementId.localeCompare(right.requirementId);
  });
}

function selectFocusRequirements(
  requirements: readonly JDRequirement[],
  chronologyRank: number,
  focusAreasPerRole: number,
): JDRequirement[] {
  if (requirements.length === 0) {
    throw new Error("Role assignment requires extracted JD requirements.");
  }

  const sorted = sortRequirementsForFocus(requirements);
  const count = Math.min(focusAreasPerRole, sorted.length);
  const offset = ((chronologyRank - 1) * count) % sorted.length;
  const selected: JDRequirement[] = [];

  for (let index = 0; index < count; index += 1) {
    const requirement = sorted[(offset + index) % sorted.length];
    if (requirement) selected.push(requirement);
  }

  return selected;
}

function inferSeniorityFromTitle(title: string): CareerSeniority {
  const lower = title.toLowerCase();
  if (/\bprincipal\b/.test(lower)) return "principal";
  if (/\bstaff\b/.test(lower)) return "staff";
  if (
    /\bengineering manager\b/.test(lower) ||
    /\b(?:people|engineering|product|project|hiring)\s+manager\b/.test(lower)
  ) {
    return "manager";
  }
  if (/\btechnical lead\b|\bteam lead\b|\blead engineer\b|\blead\b/.test(lower)) {
    return "lead";
  }
  if (/\bsenior\b|\bsr\.\b/.test(lower)) return "senior";
  if (/\bjunior\b|\bjr\.\b/.test(lower)) return "junior";
  if (/\bentry[- ]level\b|\bnew grad\b|\bintern\b/.test(lower)) return "entry";
  return "mid";
}

function manualRoleFromEntry(entry: ParsedCareerEntry["entry"]): PlannedRole | null {
  const title = entry.role?.trim();
  if (!title) return null;
  return {
    title,
    seniority: inferSeniorityFromTitle(title),
  };
}

function createRationale(input: {
  item: ParsedCareerEntry;
  role: PlannedRole;
  analysis: TargetRoleAnalysis;
  totalExperienceMonths: number;
  manual: boolean;
}): string {
  if (input.manual) {
    return `Used the role title provided on the career entry (“${input.role.title}”).`;
  }

  const totalYears = Math.floor(input.totalExperienceMonths / 12);
  if (input.item.isMostRecent) {
    return `Assigned the JD target role to the most recent experience, aligned with the ${input.analysis.roleFamily} role family and approximately ${totalYears} years of career history.`;
  }

  return `Assigned a chronological predecessor role in the ${input.analysis.roleFamily} career path to preserve a natural progression toward ${input.analysis.targetRole}.`;
}

export class RealRoleAssignmentEngine implements RoleAssignmentEngine {
  readonly name = "real-role-assignment-engine";

  private readonly referenceDate: Date;
  private readonly focusAreasPerRole: number;

  constructor(options: RealRoleAssignmentEngineOptions = {}) {
    this.referenceDate = options.referenceDate
      ? new Date(options.referenceDate.getTime())
      : new Date();
    this.focusAreasPerRole = options.focusAreasPerRole ?? 4;

    if (this.focusAreasPerRole < 1) {
      throw new Error("focusAreasPerRole must be at least 1.");
    }
  }

  async execute(input: RoleAssignmentInput): Promise<RoleAssignmentOutput> {
    this.assertInput(input);

    const timeline = buildCareerTimeline(input.careerHistory, this.referenceDate);
    const totalExperienceMonths = calculateNonOverlappingExperienceMonths(timeline);
    const targetRoleAnalysis = analyzeTargetRole(
      input.jobDescription,
      input.requirements,
    );
    const definition = findDefinition(targetRoleAnalysis);
    const progression = buildRoleProgression(targetRoleAnalysis, definition);

    const assignments: RoleAssignment[] = timeline.map((item) => {
      const manualRole = manualRoleFromEntry(item.entry);
      const role = manualRole ?? roleForRank(progression, item.chronologyRank);
      const focusRequirements = selectFocusRequirements(
        input.requirements,
        item.chronologyRank,
        this.focusAreasPerRole,
      );

      return {
        experienceId: item.entry.experienceId,
        assignedRole: role.title,
        seniority: role.seniority,
        focusAreas: focusRequirements.map(
          (requirement) => requirement.normalizedText,
        ),
        sourceRequirementIds: focusRequirements.map(
          (requirement) => requirement.requirementId,
        ),
        chronologyRank: item.chronologyRank,
        durationMonths: item.durationMonths,
        isMostRecent: item.isMostRecent,
        rationale: createRationale({
          item,
          role,
          analysis: targetRoleAnalysis,
          totalExperienceMonths,
          manual: Boolean(manualRole),
        }),
      };
    });

    const validation = validateRoleAssignments({
      jobDescription: input.jobDescription,
      careerHistory: input.careerHistory,
      requirements: input.requirements,
      targetRoleAnalysis,
      assignments,
    });

    if (validation.overallStatus === "rejected") {
      throw new Error(
        `Automatic role assignment rejected: ${validation.errors.join(" ")}`,
      );
    }

    return {
      context: input.context,
      targetRoleAnalysis,
      assignments,
      validation,
    };
  }

  private assertInput(input: RoleAssignmentInput): void {
    if (
      input.context.jdId !== input.jobDescription.jdId ||
      input.context.jdHash !== input.jobDescription.contentHash
    ) {
      throw new Error(
        "Role Assignment Engine input context does not match the supplied JD.",
      );
    }

    if (input.careerHistory.length === 0) {
      throw new Error("Role Assignment Engine requires at least one career entry.");
    }

    if (input.requirements.length === 0) {
      throw new Error("Role Assignment Engine requires at least one JD requirement.");
    }

    const careerIds = input.careerHistory.map((entry) => entry.experienceId);
    if (new Set(careerIds).size !== careerIds.length) {
      throw new Error("Career history contains duplicate experience IDs.");
    }
  }
}
