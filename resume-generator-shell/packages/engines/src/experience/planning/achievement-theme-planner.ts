import type { JobDescription } from "@resume/contracts";
import type {
  AchievementDimension,
  BulletPlanItem,
  RequirementAllocationKind,
  RequirementRoleAllocation,
} from "../types/bullet-plan";
import type { JDRequirement, RequirementCategory } from "../types/requirement";
import type { RoleAssignment } from "../types/role-assignment";
import {
  isCommunicationCategory,
  isExperienceAchievementRequirement,
  isExperienceEligible,
  requirementPlanningOrder,
  requirementRoleFitScore,
  seniorityLevel,
  tokenOverlapScore,
} from "./planning-utils";

const DIMENSION_LABELS: Record<AchievementDimension, string> = {
  "architecture-design": "Scalable architecture and system design",
  "production-delivery": "Production implementation and delivery",
  "performance-optimization": "Performance and latency optimization",
  "reliability-observability": "Reliability, monitoring, and observability",
  "quality-automation": "Quality engineering and workflow automation",
  "scalability-capacity": "Scalability and capacity growth",
  "cost-efficiency": "Cost and resource efficiency",
  "security-governance": "Security, governance, and risk controls",
  "data-quality": "Data quality and pipeline integrity",
  "customer-business-impact": "Customer and business impact",
  "cross-functional-alignment": "Cross-functional communication and alignment",
  "technical-leadership": "Technical leadership and strategic ownership",
  "mentoring-knowledge-sharing": "Mentoring and knowledge sharing",
  "implementation-integration": "Technical implementation and systems integration",
};

const GENERAL_FALLBACK_DIMENSIONS: AchievementDimension[] = [
  "implementation-integration",
  "architecture-design",
  "production-delivery",
  "performance-optimization",
  "reliability-observability",
  "quality-automation",
  "scalability-capacity",
  "data-quality",
  "cost-efficiency",
  "security-governance",
  "customer-business-impact",
  "cross-functional-alignment",
  "technical-leadership",
  "mentoring-knowledge-sharing",
];

const CATEGORY_DIMENSIONS: Record<RequirementCategory, AchievementDimension[]> = {
  "technical-responsibility": [
    "implementation-integration",
    "architecture-design",
    "production-delivery",
    "performance-optimization",
  ],
  "technical-skill": [
    "implementation-integration",
    "quality-automation",
    "performance-optimization",
  ],
  "tool-or-platform": [
    "implementation-integration",
    "production-delivery",
    "quality-automation",
  ],
  architecture: [
    "architecture-design",
    "scalability-capacity",
    "technical-leadership",
  ],
  deployment: [
    "production-delivery",
    "quality-automation",
    "reliability-observability",
  ],
  monitoring: [
    "reliability-observability",
    "quality-automation",
    "customer-business-impact",
  ],
  performance: [
    "performance-optimization",
    "cost-efficiency",
    "scalability-capacity",
  ],
  data: [
    "data-quality",
    "quality-automation",
    "scalability-capacity",
    "implementation-integration",
  ],
  security: [
    "security-governance",
    "reliability-observability",
    "quality-automation",
  ],
  communication: [
    "cross-functional-alignment",
    "customer-business-impact",
  ],
  collaboration: [
    "cross-functional-alignment",
    "customer-business-impact",
    "production-delivery",
  ],
  leadership: [
    "technical-leadership",
    "mentoring-knowledge-sharing",
    "cross-functional-alignment",
  ],
  "business-outcome": [
    "customer-business-impact",
    "cost-efficiency",
    "quality-automation",
  ],
  education: ["mentoring-knowledge-sharing"],
  experience: ["technical-leadership"],
  other: [
    "implementation-integration",
    "customer-business-impact",
  ],
};

export interface AchievementThemePlannerInput {
  jobDescription: JobDescription;
  assignment: RoleAssignment;
  targetBulletCount: number;
  requirements: JDRequirement[];
  allocations: RequirementRoleAllocation[];
}

interface RequirementSelection {
  requirement: JDRequirement;
  allocationKind: RequirementAllocationKind;
  allocationRationale: string;
}

export class AchievementThemePlanner {
  plan(input: AchievementThemePlannerInput): BulletPlanItem[] {
    if (input.targetBulletCount < 5) {
      throw new Error("Achievement planning requires at least five bullets per role.");
    }

    const eligibleRequirements = input.requirements
      .filter(isExperienceEligible)
      .sort(requirementPlanningOrder);
    if (eligibleRequirements.length === 0) {
      throw new Error("Achievement planning found no experience-eligible requirements.");
    }
    const achievementRequirements = eligibleRequirements.filter(
      isExperienceAchievementRequirement,
    );
    const planningRequirements =
      achievementRequirements.length > 0
        ? achievementRequirements
        : eligibleRequirements;

    const requirementById = new Map(
      planningRequirements.map((requirement) => [
        requirement.requirementId,
        requirement,
      ]),
    );
    const roleAllocations = input.allocations.filter(
      (allocation) => allocation.experienceId === input.assignment.experienceId,
    );
    const selected = this.selectGroundingRequirements(
      input,
      roleAllocations,
      requirementById,
      planningRequirements,
    );
    const communicationRequirement = planningRequirements.find((requirement) =>
      isCommunicationCategory(requirement.category),
    );
    const leadershipRequirement = planningRequirements.find(
      (requirement) => requirement.category === "leadership",
    );
    const needsLeadership = seniorityLevel(input.assignment.seniority) >= 3;
    const communicationSlot = Math.min(4, input.targetBulletCount - 1);
    const leadershipSlot = needsLeadership
      ? input.targetBulletCount - 1
      : -1;

    if (communicationRequirement) {
      this.reserveRequirementAtSlot(
        selected,
        communicationRequirement,
        communicationSlot,
        "Reserved the JD's communication or collaboration requirement for the dedicated collaboration achievement.",
      );
    }
    if (
      leadershipRequirement &&
      leadershipSlot >= 0 &&
      leadershipSlot !== communicationSlot
    ) {
      this.reserveRequirementAtSlot(
        selected,
        leadershipRequirement,
        leadershipSlot,
        "Reserved the JD's leadership requirement for the dedicated senior-level ownership achievement.",
      );
    }

    const usedDimensions = new Set<AchievementDimension>();

    return Array.from({ length: input.targetBulletCount }, (_, index) => {
      const selection = selected[index];
      if (!selection) {
        throw new Error(
          `Missing requirement selection ${index + 1} for ${input.assignment.experienceId}.`,
        );
      }

      const communicationFocused = index === communicationSlot;
      const leadershipFocused = index === leadershipSlot;
      const supportingRequirementIds: string[] = [];

      let preferredCategory = selection.requirement.category;
      if (communicationFocused) {
        preferredCategory = communicationRequirement?.category ?? "collaboration";
        if (
          communicationRequirement &&
          communicationRequirement.requirementId !== selection.requirement.requirementId
        ) {
          supportingRequirementIds.push(communicationRequirement.requirementId);
        }
      }

      if (leadershipFocused && leadershipRequirement) {
        preferredCategory = "leadership";
        if (
          leadershipRequirement.requirementId !== selection.requirement.requirementId &&
          !supportingRequirementIds.includes(leadershipRequirement.requirementId)
        ) {
          supportingRequirementIds.push(leadershipRequirement.requirementId);
        }
      }

      const dimension = this.selectDimension(
        preferredCategory,
        usedDimensions,
        communicationFocused,
        leadershipFocused,
      );
      usedDimensions.add(dimension);

      const roleFocusArea = this.selectRoleFocusArea(
        input.assignment,
        selection.requirement,
      );
      const theme = this.buildTheme(
        dimension,
        selection.requirement,
        roleFocusArea,
      );
      const sequence = index + 1;

      return {
        bulletId: `${input.assignment.experienceId}-B-${String(sequence).padStart(3, "0")}`,
        experienceId: input.assignment.experienceId,
        sequence,
        requirementId: selection.requirement.requirementId,
        supportingRequirementIds,
        coverageRequirementIds: [],
        requirementAllocationKind: selection.allocationKind,
        achievementDimension: dimension,
        achievementTheme: theme,
        roleFocusArea,
        communicationFocused,
        leadershipFocused,
        planningRationale: [
          selection.allocationRationale,
          `Uses the distinct ${dimension} achievement dimension.`,
          communicationFocused
            ? "Reserved as this role's communication and collaboration achievement."
            : "",
          leadershipFocused
            ? "Reserved to demonstrate senior-level ownership or leadership."
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      };
    });
  }


  private reserveRequirementAtSlot(
    selections: RequirementSelection[],
    requirement: JDRequirement,
    slot: number,
    rationale: string,
  ): void {
    const target = selections[slot];
    if (!target) {
      return;
    }

    const existingIndex = selections.findIndex(
      (selection) =>
        selection.requirement.requirementId === requirement.requirementId,
    );
    if (existingIndex === slot) {
      return;
    }

    const reserved: RequirementSelection = {
      requirement,
      allocationKind:
        existingIndex >= 0
          ? selections[existingIndex]?.allocationKind ?? "supporting"
          : "supporting",
      allocationRationale:
        existingIndex >= 0
          ? selections[existingIndex]?.allocationRationale ?? rationale
          : rationale,
    };

    if (existingIndex >= 0) {
      selections[existingIndex] = target;
    }
    selections[slot] = reserved;
  }

  private selectGroundingRequirements(
    input: AchievementThemePlannerInput,
    roleAllocations: RequirementRoleAllocation[],
    requirementById: Map<string, JDRequirement>,
    eligibleRequirements: JDRequirement[],
  ): RequirementSelection[] {
    const selections: RequirementSelection[] = [];
    const selectedIds = new Set<string>();

    const allocatedRequirements = roleAllocations
      .map((allocation) => ({
        allocation,
        requirement: requirementById.get(allocation.requirementId),
      }))
      .filter(
        (
          item,
        ): item is {
          allocation: RequirementRoleAllocation;
          requirement: JDRequirement;
        } => Boolean(item.requirement),
      )
      .sort((left, right) => {
        const leftCritical = left.requirement.priority === "critical" ? 1 : 0;
        const rightCritical = right.requirement.priority === "critical" ? 1 : 0;
        if (leftCritical !== rightCritical) {
          return rightCritical - leftCritical;
        }
        const scoreDifference = right.allocation.score - left.allocation.score;
        if (scoreDifference !== 0) {
          return scoreDifference;
        }
        return requirementPlanningOrder(left.requirement, right.requirement);
      });

    for (const item of allocatedRequirements) {
      if (selections.length >= input.targetBulletCount) {
        break;
      }
      if (selectedIds.has(item.requirement.requirementId)) {
        continue;
      }
      selectedIds.add(item.requirement.requirementId);
      selections.push({
        requirement: item.requirement,
        allocationKind: "primary",
        allocationRationale: item.allocation.rationale,
      });
    }

    const bestAdditionalRequirements = [...eligibleRequirements].sort(
      (left, right) => {
        const leftCritical = left.priority === "critical" ? 1 : 0;
        const rightCritical = right.priority === "critical" ? 1 : 0;
        if (leftCritical !== rightCritical) {
          return rightCritical - leftCritical;
        }
        const fitDifference =
          requirementRoleFitScore(right, input.assignment) -
          requirementRoleFitScore(left, input.assignment);
        if (fitDifference !== 0) {
          return fitDifference;
        }
        return requirementPlanningOrder(left, right);
      },
    );

    for (const requirement of bestAdditionalRequirements) {
      if (selections.length >= input.targetBulletCount) {
        break;
      }
      if (selectedIds.has(requirement.requirementId)) {
        continue;
      }
      selectedIds.add(requirement.requirementId);
      selections.push({
        requirement,
        allocationKind: "supporting",
        allocationRationale:
          "Added as a strongly matched JD requirement to complete distinct role coverage after primary global allocation.",
      });
    }

    const reusableTechnicalRequirements = bestAdditionalRequirements.filter(
      (requirement) =>
        !isCommunicationCategory(requirement.category) &&
        requirement.category !== "leadership",
    );
    const reusePool =
      reusableTechnicalRequirements.length > 0
        ? reusableTechnicalRequirements
        : bestAdditionalRequirements;
    let cursor = 0;
    while (selections.length < input.targetBulletCount) {
      const requirement = reusePool[cursor % reusePool.length];
      if (!requirement) {
        throw new Error(
          `Unable to complete bullet planning for ${input.assignment.experienceId}.`,
        );
      }
      selections.push({
        requirement,
        allocationKind: "reused-grounding",
        allocationRationale:
          "Reuses a JD-grounded technical requirement because the target bullet count exceeds the number of distinct experience requirements; the achievement dimension remains unique.",
      });
      cursor += 1;
    }

    return selections;
  }

  private selectDimension(
    category: RequirementCategory,
    usedDimensions: Set<AchievementDimension>,
    communicationFocused: boolean,
    leadershipFocused: boolean,
  ): AchievementDimension {
    const preferred: AchievementDimension[] = [];

    if (communicationFocused) {
      preferred.push("cross-functional-alignment");
    }
    if (leadershipFocused) {
      preferred.push("technical-leadership", "mentoring-knowledge-sharing");
    }
    preferred.push(...CATEGORY_DIMENSIONS[category], ...GENERAL_FALLBACK_DIMENSIONS);

    const available = preferred.find((dimension) => !usedDimensions.has(dimension));
    if (!available) {
      throw new Error("No distinct achievement dimension remains for this role.");
    }
    return available;
  }

  private selectRoleFocusArea(
    assignment: RoleAssignment,
    requirement: JDRequirement,
  ): string {
    const rankedFocusAreas = [...assignment.focusAreas].sort((left, right) => {
      const scoreDifference =
        tokenOverlapScore(requirement.normalizedText, right) -
        tokenOverlapScore(requirement.normalizedText, left);
      if (scoreDifference !== 0) {
        return scoreDifference;
      }
      return left.localeCompare(right);
    });

    return rankedFocusAreas[0] ?? assignment.assignedRole;
  }

  private buildTheme(
    dimension: AchievementDimension,
    requirement: JDRequirement,
    roleFocusArea: string,
  ): string {
    const requirementText = requirement.normalizedText
      .replace(/[.;:]+$/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 10)
      .join(" ");
    const focus = roleFocusArea
      .replace(/[.;:]+$/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 8)
      .join(" ");
    return `${DIMENSION_LABELS[dimension]} for ${focus}: ${requirementText}`;
  }
}
