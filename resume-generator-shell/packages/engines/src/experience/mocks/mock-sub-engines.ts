import type { CareerEntry } from "@resume/contracts";
import type {
  BulletComposer,
  BulletPlanner,
  ExperienceValidator,
  KeywordAllocator,
  RequirementExtractor,
  RoleAssignmentEngine,
  StarGenerator,
} from "../sub-engines/interfaces";
import type { BulletPlanItem } from "../types/bullet-plan";
import type { ExperienceBullet } from "../types/composed-bullet";
import type { KeywordPackage } from "../types/keyword-package";
import type { JDRequirement } from "../types/requirement";
import type { RoleAssignment } from "../types/role-assignment";
import type { StarStory } from "../types/star-story";
import { canonicalActionVerbKey, canonicalKeywordKey } from "../keywords/keyword-normalizer";

const THEMES = [
  "system architecture",
  "production implementation",
  "performance optimization",
  "reliability and monitoring",
  "cross-functional collaboration",
  "technical leadership",
  "delivery improvement",
] as const;

const ACTION_VERBS = [
  "Architected",
  "Implemented",
  "Optimized",
  "Automated",
  "Led",
  "Mentored",
  "Accelerated",
] as const;

const OUTCOMES = [
  "scalability",
  "delivery speed",
  "runtime efficiency",
  "service reliability",
  "stakeholder alignment",
  "team productivity",
  "release quality",
] as const;

function inferMockRole(jdText: string): string {
  const lower = jdText.toLowerCase();

  if (lower.includes("machine learning") || lower.includes("ml engineer")) {
    return "Senior Machine Learning Engineer";
  }
  if (lower.includes("data engineer") || lower.includes("data pipeline")) {
    return "Senior Data Engineer";
  }
  if (lower.includes("artificial intelligence") || lower.includes(" ai ")) {
    return "Senior Applied AI Engineer";
  }
  return "Senior Software Engineer";
}

function makeRequirements(sourceText: string): JDRequirement[] {
  const labels = [
    "Design scalable technical solutions",
    "Deliver production-ready systems",
    "Improve application performance",
    "Strengthen operational reliability",
    "Collaborate with cross-functional stakeholders",
    "Provide technical leadership",
    "Improve engineering delivery",
  ];

  return labels.map((normalizedText, index) => ({
    requirementId: `REQ-${String(index + 1).padStart(3, "0")}`,
    sourceText,
    normalizedText,
    category:
      index === 4
        ? "collaboration"
        : index === 5
          ? "leadership"
          : index === 6
            ? "business-outcome"
            : "technical-responsibility",
    priority: index < 2 ? "critical" : index < 5 ? "high" : "medium",
    necessity: "implied",
    evidence: [
      {
        sourceText,
        startIndex: 0,
        endIndex: sourceText.length,
      },
    ],
  }));
}

export const mockRequirementExtractor: RequirementExtractor = {
  name: "mock-requirement-extractor",
  async execute(input) {
    return {
      context: input.context,
      requirements: makeRequirements(input.jobDescription.normalizedText),
    };
  },
};

export const mockRoleAssignmentEngine: RoleAssignmentEngine = {
  name: "mock-role-assignment-engine",
  async execute(input) {
    const targetRole = inferMockRole(input.jobDescription.normalizedText);
    const assignments: RoleAssignment[] = input.careerHistory.map(
      (entry, index) => ({
        experienceId: entry.experienceId,
        assignedRole:
          index === 0 ? targetRole : targetRole.replace(/^Senior /, ""),
        seniority: index === 0 ? "senior" : "mid",
        focusAreas: input.requirements
          .slice(index, index + 3)
          .map((requirement) => requirement.normalizedText),
        sourceRequirementIds: input.requirements
          .slice(index, index + 3)
          .map((requirement) => requirement.requirementId),
        chronologyRank: index + 1,
        durationMonths: 24,
        isMostRecent: index === 0,
        rationale: "Deterministic mock role assignment for orchestration testing.",
      }),
    );

    return { context: input.context, assignments };
  },
};

export const mockBulletPlanner: BulletPlanner = {
  name: "mock-bullet-planner",
  async execute(input) {
    const plans: BulletPlanItem[] = input.assignments.flatMap((assignment) =>
      Array.from({ length: input.minimumBulletsPerRole }, (_, index) => {
        const communicationRequirement = input.requirements.find(
          (item) =>
            item.category === "communication" ||
            item.category === "collaboration" ||
            /collaborat|communicat|stakeholder/i.test(item.normalizedText),
        );
        const leadershipRequirement = input.requirements.find(
          (item) =>
            item.category === "leadership" ||
            /lead|mentor|architect|strategy/i.test(item.normalizedText),
        );
        const regularRequirements = input.requirements.filter(
          (item) =>
            item !== communicationRequirement && item !== leadershipRequirement,
        );
        const fallbackRequirements =
          regularRequirements.length > 0 ? regularRequirements : input.requirements;
        const requirement =
          index === 4 && communicationRequirement
            ? communicationRequirement
            : index === 5 && leadershipRequirement
              ? leadershipRequirement
              : fallbackRequirements[index % fallbackRequirements.length];
        if (!requirement) {
          throw new Error("Mock bullet planner requires at least one requirement.");
        }

        return {
          bulletId: `${assignment.experienceId}-B-${String(index + 1).padStart(3, "0")}`,
          experienceId: assignment.experienceId,
          sequence: index + 1,
          requirementId: requirement.requirementId,
          supportingRequirementIds: [],
          requirementAllocationKind: "primary" as const,
          achievementDimension: (
            [
              "architecture-design",
              "production-delivery",
              "performance-optimization",
              "reliability-observability",
              "cross-functional-alignment",
              "technical-leadership",
              "quality-automation",
            ] as const
          )[index % 7] ?? "implementation-integration",
          achievementTheme: THEMES[index % THEMES.length] ?? "delivery",
          roleFocusArea: assignment.focusAreas[0] ?? assignment.assignedRole,
          communicationFocused: index === 4,
          leadershipFocused: index === 5,
          planningRationale: "Deterministic mock achievement plan.",
        };
      }),
    );

    return { context: input.context, plans };
  },
};

export const mockKeywordAllocator: KeywordAllocator = {
  name: "mock-keyword-allocator",
  async execute(input) {
    const requirementsById = new Map(
      input.requirements.map((requirement) => [
        requirement.requirementId,
        requirement,
      ]),
    );

    const packages: KeywordPackage[] = input.plans.map((plan, index) => {
      const requirement = requirementsById.get(plan.requirementId);
      if (!requirement) {
        throw new Error(`Missing requirement ${plan.requirementId}.`);
      }

      const actionVerb = ACTION_VERBS[index % ACTION_VERBS.length] ?? "Delivered";
      const directKeywords = [
        requirement.sourceText,
        ...plan.supportingRequirementIds
          .map((requirementId) => requirementsById.get(requirementId)?.sourceText)
          .filter((value): value is string => Boolean(value)),
      ];
      const supportingKeyword = `method-${index + 1}`;
      const outcomeKeyword = OUTCOMES[index % OUTCOMES.length] ?? "impact";
      const primaryEvidence = requirement.evidence[0];

      return {
        bulletId: plan.bulletId,
        experienceId: plan.experienceId,
        requirementId: plan.requirementId,
        achievementDimension: plan.achievementDimension,
        actionVerb,
        actionVerbCanonicalKey: canonicalActionVerbKey(actionVerb),
        directKeywords,
        directKeywordEvidence: primaryEvidence
          ? [
              {
                keyword: requirement.sourceText,
                requirementId: requirement.requirementId,
                sourceText: requirement.sourceText,
                startIndex: primaryEvidence.startIndex,
                endIndex: primaryEvidence.endIndex,
              },
            ]
          : [],
        supportingKeywords: [supportingKeyword],
        supportingKeywordDetails: [
          {
            keyword: supportingKeyword,
            canonicalKey: canonicalKeywordKey(supportingKeyword),
            origin: "strongly-inferred" as const,
            rationale: "Deterministic mock supporting keyword.",
          },
        ],
        outcomeKeywords: [outcomeKeyword],
        outcomeKeywordDetails: [
          {
            keyword: outcomeKeyword,
            canonicalKey: canonicalKeywordKey(outcomeKeyword),
            rationale: "Deterministic mock outcome keyword.",
          },
        ],
        allocationRationale: "Deterministic mock keyword allocation.",
      };
    });

    return { context: input.context, packages };
  },
};

export const mockStarGenerator: StarGenerator = {
  name: "mock-star-generator",
  async execute(input) {
    const packagesByBullet = new Map(
      input.keywordPackages.map((keywordPackage) => [
        keywordPackage.bulletId,
        keywordPackage,
      ]),
    );

    const stories: StarStory[] = input.plans.map((plan, index) => {
      const keywordPackage = packagesByBullet.get(plan.bulletId);
      if (!keywordPackage) {
        throw new Error(`Missing keyword package for ${plan.bulletId}.`);
      }

      return {
        bulletId: plan.bulletId,
        experienceId: plan.experienceId,
        requirementId: plan.requirementId,
        achievementDimension: plan.achievementDimension,
        situation: `A ${plan.achievementTheme} challenge limited delivery effectiveness.`,
        task: `Owned the effort to improve ${plan.achievementTheme}.`,
        action: `${keywordPackage.actionVerb} a focused solution using ${keywordPackage.supportingKeywords.join(", ")}.`,
        result: `Improved ${keywordPackage.outcomeKeywords.join(", ")} by ${20 + index}%.`,
        technicalImpact: `Improved ${plan.achievementTheme}.`,
        businessImpact: "Accelerated reliable delivery.",
        metrics: [
          {
            metricId: `${plan.bulletId}-M-001`,
            metricType: "percentage" as const,
            direction: "increase" as const,
            value: 20 + index,
            unit: "%" as const,
            displayText: `increased ${keywordPackage.outcomeKeywords[0] ?? "impact"} by ${20 + index}%`,
            measure: keywordPackage.outcomeKeywords[0] ?? "impact",
            outcomeKeyword: keywordPackage.outcomeKeywords[0] ?? "impact",
            rationale: "Deterministic mock metric.",
            provenance: "generated-hypothetical" as const,
          },
        ],
        coherenceScore: 8.5,
        metricPlausibilityScore: 8.5,
        status: "approved" as const,
      };
    });

    return { context: input.context, stories };
  },
};

export const mockBulletComposer: BulletComposer = {
  name: "mock-bullet-composer",
  async execute(input) {
    const packagesByBullet = new Map(
      input.keywordPackages.map((keywordPackage) => [
        keywordPackage.bulletId,
        keywordPackage,
      ]),
    );
    const storiesByBullet = new Map(
      input.stories.map((story) => [story.bulletId, story]),
    );

    const bullets: ExperienceBullet[] = input.plans.map((plan) => {
      const keywordPackage = packagesByBullet.get(plan.bulletId);
      const story = storiesByBullet.get(plan.bulletId);
      if (!keywordPackage || !story) {
        throw new Error(`Incomplete composition input for ${plan.bulletId}.`);
      }

      return {
        bulletId: plan.bulletId,
        requirementId: plan.requirementId,
        situation: story.situation,
        task: story.task,
        action: story.action,
        result: story.result,
        actionVerb: keywordPackage.actionVerb,
        directKeywords: [...keywordPackage.directKeywords],
        supportingKeywords: [...keywordPackage.supportingKeywords],
        outcomeKeywords: [...keywordPackage.outcomeKeywords],
        finalBullet: `${story.action.replace(/[.]$/, "")}, ${story.result.charAt(0).toLowerCase()}${story.result.slice(1)}`,
        strengthScore: 8.5,
        distinctivenessScore: 8.5,
        status: "approved",
      };
    });

    return { context: input.context, bullets };
  },
};

function groupBulletsByExperience(
  careerHistory: CareerEntry[],
  bullets: ExperienceBullet[],
): Map<string, ExperienceBullet[]> {
  const knownExperienceIds = new Set(
    careerHistory.map((entry) => entry.experienceId),
  );
  const grouped = new Map<string, ExperienceBullet[]>();

  for (const bullet of bullets) {
    const separatorIndex = bullet.bulletId.lastIndexOf("-B-");
    const experienceId =
      separatorIndex >= 0 ? bullet.bulletId.slice(0, separatorIndex) : "";

    if (!knownExperienceIds.has(experienceId)) {
      throw new Error(`Bullet ${bullet.bulletId} is not linked to a career entry.`);
    }

    const current = grouped.get(experienceId) ?? [];
    grouped.set(experienceId, [...current, bullet]);
  }

  return grouped;
}

export const mockExperienceValidator: ExperienceValidator = {
  name: "mock-experience-validator",
  async execute(input) {
    const roleByExperience = new Map(
      input.assignments.map((assignment) => [
        assignment.experienceId,
        assignment.assignedRole,
      ]),
    );
    const grouped = groupBulletsByExperience(input.careerHistory, input.bullets);

    const experiences = input.careerHistory.map((entry) => ({
      experienceId: entry.experienceId,
      companyName: entry.companyName,
      startDate: entry.startDate,
      endDate: entry.endDate,
      assignedRole:
        entry.roleTitle?.trim() ||
        roleByExperience.get(entry.experienceId) ||
        "Software Engineer",
      bullets: grouped.get(entry.experienceId) ?? [],
    }));

    const minimumBulletsSatisfied = experiences.every(
      (experience) =>
        experience.bullets.length >= input.minimumBulletsPerRole,
    );
    const communicationCoverage = experiences.every((experience) =>
      experience.bullets.some((bullet) =>
        bullet.directKeywords.some((keyword: string) =>
          /collaborat|communicat|stakeholder/i.test(keyword),
        ),
      ),
    );
    const allBulletIds = experiences.flatMap((experience) =>
      experience.bullets.map((bullet) => bullet.bulletId),
    );
    const duplicateBulletIds = allBulletIds.filter(
      (bulletId, index) => allBulletIds.indexOf(bulletId) !== index,
    );
    const duplicateAchievements = [...new Set(duplicateBulletIds)];
    const overallStatus =
      minimumBulletsSatisfied &&
      communicationCoverage &&
      duplicateAchievements.length === 0
        ? "approved"
        : "rejected";

    return {
      context: input.context,
      experiences,
      validation: {
        minimumBulletsSatisfied,
        communicationCoverage,
        leadershipCoverage: true,
        allBulletsStrong: overallStatus === "approved",
        allBulletsTraceable: true,
        allRolesSeniorityConsistent: true,
        allBulletsDomainCoherent: true,
        atsLanguageApproved: true,
        duplicateAchievements,
        failedBulletIds: [],
        approvedBulletIds: input.bullets.map((bullet) => bullet.bulletId),
        exactRepetitionGroups: [],
        morphologicalRepetitionGroups: [],
        semanticRepetitionGroups: [],
        structuralRepetitionGroups: [],
        metricRepetitionGroups: [],
        diagnostics: [],
        issues: [],
        overallStatus,
      },
    };
  },
};
