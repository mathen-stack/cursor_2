import { describe, expect, it } from "vitest";
import type { ExperienceEngineInput } from "@resume/contracts";
import {
  createGenerationContext,
  createJobDescription,
} from "@resume/core";
import {
  RealBulletPlanner,
  RealKeywordAllocator,
  RealRequirementExtractor,
  RealRoleAssignmentEngine,
  RuleBasedRequirementModel,
  DirectJDKeywordEngine,
  canonicalKeywordKey,
  createMilestone5ExperienceEngine,
  hasCommunicationAllocationSignal,
} from "@resume/engines";
import {
  SOFTWARE_MIND_SENIOR_FRONTEND_JD,
  softwareMindCareerProfile,
} from "./fixtures/software-mind-senior-frontend";

const REFERENCE_DATE = new Date("2026-07-27T00:00:00.000Z");

async function createRealAllocation() {
  const jobDescription = createJobDescription(
    "Senior Machine Learning Engineer. Design scalable machine learning architecture. Deploy machine learning models to production using Docker and Kubernetes. Monitor model performance with MLflow and Prometheus. Optimize inference latency and throughput. Build reliable data pipelines with Airflow and Spark. Collaborate with product and platform stakeholders. Lead technical strategy and architecture decisions. Improve customer-facing AI reliability.",
  );
  const context = createGenerationContext("PROFILE-KEYWORDS", jobDescription);
  const careerHistory = [
    {
      experienceId: "EXP-CURRENT",
      companyName: "Example AI",
      startDate: "2022-01",
      endDate: "Present",
    },
    {
      experienceId: "EXP-PAST",
      companyName: "Example Software",
      startDate: "2018-01",
      endDate: "2021-12",
    },
  ];
  const extractor = new RealRequirementExtractor({
    model: new RuleBasedRequirementModel(),
  });
  const extracted = await extractor.execute({ context, jobDescription });
  const roleEngine = new RealRoleAssignmentEngine({ referenceDate: REFERENCE_DATE });
  const roles = await roleEngine.execute({
    context,
    jobDescription,
    careerHistory,
    requirements: extracted.requirements,
  });
  const plans = await new RealBulletPlanner().execute({
    context,
    jobDescription,
    assignments: roles.assignments,
    requirements: extracted.requirements,
    minimumBulletsPerRole: 5,
  });
  const input = {
    context,
    jobDescription,
    assignments: roles.assignments,
    requirements: extracted.requirements,
    plans: plans.plans,
  };
  const output = await new RealKeywordAllocator().execute(input);
  return { input, output };
}

describe("Real global keyword allocation", () => {
  it("allocates every planned bullet and grounds every direct keyword in the original JD", async () => {
    const { input, output } = await createRealAllocation();

    expect(output.packages).toHaveLength(input.plans.length);
    expect(output.validation?.allDirectKeywordsGroundedInJD).toBe(true);
    expect(output.validation?.overallStatus).toBe("approved");

    for (const keywordPackage of output.packages) {
      for (const evidence of keywordPackage.directKeywordEvidence) {
        expect(
          input.jobDescription.rawText.slice(
            evidence.startIndex,
            evidence.endIndex,
          ).toLowerCase(),
        ).toBe(evidence.keyword.toLowerCase());
      }
    }
  });

  it("keeps action verbs, supporting keywords, and outcomes distinct within each role", async () => {
    const { output } = await createRealAllocation();

    expect(output.validation?.actionVerbsUniqueWithinRoles).toBe(true);
    expect(output.validation?.supportingKeywordsDistinctWithinRoles).toBe(true);
    expect(output.validation?.outcomeKeywordsDistinctWithinRoles).toBe(true);
    expect(output.validation?.keywordConceptsDistinctAcrossKindsWithinRoles).toBe(true);

    for (const experienceId of new Set(output.packages.map((item) => item.experienceId))) {
      const rolePackages = output.packages.filter(
        (item) => item.experienceId === experienceId,
      );
      expect(new Set(rolePackages.map((item) => item.actionVerbCanonicalKey)).size).toBe(
        rolePackages.length,
      );
    }
  });

  it("keeps action verbs, supporting keywords, and outcomes unique across the whole generation", async () => {
    const { output } = await createRealAllocation();

    expect(new Set(output.packages.map((item) => item.actionVerbCanonicalKey)).size).toBe(
      output.packages.length,
    );
    expect(
      new Set(
        output.packages.flatMap((item) =>
          item.supportingKeywordDetails.map((detail) => detail.canonicalKey),
        ),
      ).size,
    ).toBe(
      output.packages.flatMap((item) => item.supportingKeywordDetails).length,
    );
    expect(
      new Set(
        output.packages.flatMap((item) =>
          item.outcomeKeywordDetails.map((detail) => detail.canonicalKey),
        ),
      ).size,
    ).toBe(output.packages.flatMap((item) => item.outcomeKeywordDetails).length);
  });

  it("does not reuse a current direct or supporting concept as the bullet outcome", async () => {
    const { output } = await createRealAllocation();

    for (const keywordPackage of output.packages) {
      const directAndSupporting = new Set([
        ...keywordPackage.directKeywords.map(canonicalKeywordKey),
        ...keywordPackage.supportingKeywordDetails.map((item) => item.canonicalKey),
      ]);
      for (const outcome of keywordPackage.outcomeKeywordDetails) {
        expect(directAndSupporting.has(outcome.canonicalKey)).toBe(false);
      }
    }
  });

  it("allocates relevant communication and leadership packages", async () => {
    const { input, output } = await createRealAllocation();
    const packagesByBullet = new Map(
      output.packages.map((keywordPackage) => [keywordPackage.bulletId, keywordPackage]),
    );

    const communicationPlans = input.plans.filter((plan) => plan.communicationFocused);
    expect(communicationPlans.length).toBeGreaterThan(0);
    for (const plan of communicationPlans) {
      const keywordPackage = packagesByBullet.get(plan.bulletId);
      expect(keywordPackage).toBeDefined();
      expect(
        hasCommunicationAllocationSignal(
          [
            ...(keywordPackage?.directKeywords ?? []),
            ...(keywordPackage?.supportingKeywords ?? []),
            ...(keywordPackage?.outcomeKeywords ?? []),
            keywordPackage?.actionVerb ?? "",
          ].join(" "),
        ),
      ).toBe(true);
    }

    expect(output.validation?.communicationPackagesRelevant).toBe(true);
    expect(output.validation?.leadershipPackagesRelevant).toBe(true);
  });

  it("keeps SoftMind EXP-003 communication allocation relevant without relying on reused direct JD phrases", async () => {
    const profile = softwareMindCareerProfile("PROFILE-SOFTWARE-MIND-KEYWORDS");
    const jobDescription = createJobDescription(SOFTWARE_MIND_SENIOR_FRONTEND_JD);
    const context = createGenerationContext(profile.profileId, jobDescription);
    const extractor = new RealRequirementExtractor({
      model: new RuleBasedRequirementModel(),
    });
    const extracted = await extractor.execute({ context, jobDescription });
    const roles = await new RealRoleAssignmentEngine({
      referenceDate: REFERENCE_DATE,
    }).execute({
      context,
      jobDescription,
      careerHistory: profile.careerHistory,
      requirements: extracted.requirements,
    });
    const plans = await new RealBulletPlanner().execute({
      context,
      jobDescription,
      assignments: roles.assignments,
      requirements: extracted.requirements,
      minimumBulletsPerRole: 5,
    });
    const output = await new RealKeywordAllocator().execute({
      context,
      jobDescription,
      assignments: roles.assignments,
      requirements: extracted.requirements,
      plans: plans.plans,
    });

    expect(output.validation?.overallStatus).toBe("approved");
    expect(output.validation?.communicationPackagesRelevant).toBe(true);
    expect(output.validation?.communicationPackageErrors).toEqual([]);

    const communicationPlans = plans.plans.filter((plan) => plan.communicationFocused);
    expect(communicationPlans.map((plan) => plan.bulletId)).toEqual([
      "EXP-001-B-005",
      "EXP-002-B-005",
      "EXP-003-B-005",
    ]);

    for (const plan of communicationPlans) {
      const keywordPackage = output.packages.find(
        (item) => item.bulletId === plan.bulletId,
      );
      expect(keywordPackage).toBeDefined();
      // Communication relevance must survive even if controlled direct-JD reuse
      // does not supply a communication stem for this bullet.
      const withoutDirect = [
        keywordPackage?.actionVerb ?? "",
        ...(keywordPackage?.supportingKeywords ?? []),
        ...(keywordPackage?.outcomeKeywords ?? []),
      ].join(" ");
      expect(
        hasCommunicationAllocationSignal(withoutDirect),
        `${plan.bulletId} lost communication signal outside direct keywords: ${withoutDirect}`,
      ).toBe(true);
      expect(
        (keywordPackage?.supportingKeywords ?? []).some((keyword) =>
          hasCommunicationAllocationSignal(keyword),
        ),
        `${plan.bulletId} supporting keywords lack a communication signal`,
      ).toBe(true);
    }
  });

  it("never allocates Resume Worded soft-skill buzzphrases as direct keywords", async () => {
    const jobDescription = createJobDescription(
      `Senior Frontend Engineer
Build scalable front-end applications with React.js and TypeScript.
Collaborate with product and engineering stakeholders on delivery priorities.
Strong verbal and written communication skills in English, with the ability to clearly explain technical concepts.`,
    );
    const context = createGenerationContext("PROFILE-SOFT-SKILL", jobDescription);
    const careerHistory = [
      {
        experienceId: "EXP-CURRENT",
        companyName: "Example Frontend",
        startDate: "2022-01",
        endDate: "Present",
      },
      {
        experienceId: "EXP-PAST",
        companyName: "Example Software",
        startDate: "2018-01",
        endDate: "2021-12",
      },
    ];
    const extractor = new RealRequirementExtractor({
      model: new RuleBasedRequirementModel(),
    });
    const extracted = await extractor.execute({ context, jobDescription });
    const roleEngine = new RealRoleAssignmentEngine({ referenceDate: REFERENCE_DATE });
    const roles = await roleEngine.execute({
      context,
      jobDescription,
      careerHistory,
      requirements: extracted.requirements,
    });
    const plans = await new RealBulletPlanner().execute({
      context,
      jobDescription,
      assignments: roles.assignments,
      requirements: extracted.requirements,
      minimumBulletsPerRole: 5,
    });
    const output = await new RealKeywordAllocator().execute({
      context,
      jobDescription,
      assignments: roles.assignments,
      requirements: extracted.requirements,
      plans: plans.plans,
    });

    for (const keywordPackage of output.packages) {
      for (const keyword of [
        ...keywordPackage.directKeywords,
        ...keywordPackage.supportingKeywords,
        ...keywordPackage.outcomeKeywords,
      ]) {
        expect(keyword).not.toMatch(/\b(?:verbal and written\s+)?communication skills\b/i);
        expect(keyword).not.toMatch(/\b(?:soft skills|interpersonal skills|people skills)\b/i);
      }
    }
  });

  it("does not mutate requirements, plans, assignments, or the JD", async () => {
    const { input } = await createRealAllocation();
    const snapshot = structuredClone(input);
    await new RealKeywordAllocator().execute(input);
    expect(input).toEqual(snapshot);
  });

  it("rejects a generation context belonging to another JD", async () => {
    const { input } = await createRealAllocation();
    const otherJd = createJobDescription(
      "Senior Data Engineer. Build scalable data pipelines and data products. Collaborate with analytics stakeholders.",
    );

    await expect(
      new RealKeywordAllocator().execute({
        ...input,
        context: createGenerationContext("PROFILE-KEYWORDS", otherJd),
      }),
    ).rejects.toThrow(/does not match the supplied JD/);
  });

  it("keeps simultaneous JD allocation state isolated", async () => {
    const first = await createRealAllocation();
    const second = await createRealAllocation();
    const secondJd = createJobDescription(
      "Senior Data Engineer. Architect cloud data platforms on AWS. Build ETL pipelines using Spark and Airflow. Optimize Snowflake performance. Monitor data quality. Collaborate with analytics stakeholders. Lead data architecture decisions.",
    );
    const secondContext = createGenerationContext("PROFILE-DATA", secondJd);
    const extractor = new RealRequirementExtractor({ model: new RuleBasedRequirementModel() });
    const requirements = await extractor.execute({
      context: secondContext,
      jobDescription: secondJd,
    });
    const roles = await new RealRoleAssignmentEngine({ referenceDate: REFERENCE_DATE }).execute({
      context: secondContext,
      jobDescription: secondJd,
      careerHistory: [
        {
          experienceId: "DATA-EXP",
          companyName: "Data Company",
          startDate: "2021-01",
          endDate: "Present",
        },
      ],
      requirements: requirements.requirements,
    });
    const plans = await new RealBulletPlanner().execute({
      context: secondContext,
      jobDescription: secondJd,
      assignments: roles.assignments,
      requirements: requirements.requirements,
      minimumBulletsPerRole: 5,
    });

    const [outputA, outputB] = await Promise.all([
      new RealKeywordAllocator().execute(first.input),
      new RealKeywordAllocator().execute({
        context: secondContext,
        jobDescription: secondJd,
        assignments: roles.assignments,
        requirements: requirements.requirements,
        plans: plans.plans,
      }),
    ]);

    expect(outputA.context.generationId).not.toBe(outputB.context.generationId);
    expect(outputA.packages.some((item) => item.experienceId === "DATA-EXP")).toBe(false);
    expect(outputB.packages.some((item) => item.experienceId === "EXP-CURRENT")).toBe(false);
    expect(second.output.context.generationId).not.toBe(first.output.context.generationId);
  });
});

describe("Milestone 5 integration", () => {
  it("uses the real keyword allocator while STAR generation and final validation remain mocked", async () => {
    const jobDescription = createJobDescription(
      "Senior Data Engineer role. Build scalable data pipelines using Spark and Airflow. Develop ETL workflows on AWS. Optimize Snowflake warehouse performance. Monitor data quality. Collaborate with analytics and product stakeholders. Lead data architecture decisions. Improve delivery reliability.",
    );
    const input: ExperienceEngineInput = {
      context: createGenerationContext("PROFILE-M5", jobDescription),
      jobDescription,
      careerHistory: [
        {
          experienceId: "EXP-001",
          companyName: "Example Company",
          startDate: "2022-01",
          endDate: "Present",
        },
      ],
    };

    const result = await createMilestone5ExperienceEngine({
      role: { referenceDate: REFERENCE_DATE },
    }).execute(input);

    expect(result.status).toBe("approved");
    expect(result.experiences[0]?.assignedRole).toBe("Senior Data Engineer");
    expect(result.experiences[0]?.bullets).toHaveLength(6);
    expect(new Set(result.experiences[0]?.bullets.map((bullet) => bullet.actionVerb)).size).toBe(6);
    expect(result.validation.communicationCoverage).toBe(true);
  });
});

describe("direct keyword phrase integrity", () => {
  it("does not allocate mid-word truncated or weak-adverb JD fragments", async () => {
    const { output } = await createRealAllocation();
    for (const keywordPackage of output.packages) {
      for (const keyword of keywordPackage.directKeywords) {
        expect(keyword.endsWith(",")).toBe(false);
        expect(/\b(?:successfully|effectively)\b/i.test(keyword)).toBe(false);
        expect(keyword.split(/\s+/).length).toBeLessThanOrEqual(8);
        expect(/\s(?:in|to|and|with|of|for|the|a)$/i.test(keyword.trim())).toBe(false);
        expect(keyword.includes("polished user in")).toBe(false);
      }
    }
  });

  it("allows controlled reuse when document-wide unique JD phrases are exhausted", async () => {
    const jobDescription = createJobDescription(
      "Senior Frontend Engineer. Develop front-end applications using React.js and Next.js. Implement user interfaces with Tailwind CSS. Collaborate with cross-functional engineering teams. Experience with TypeScript and WebSockets is required.",
    );
    const context = createGenerationContext("PROFILE-REUSE", jobDescription);
    const extractor = new RealRequirementExtractor({
      model: new RuleBasedRequirementModel(),
    });
    const extracted = await extractor.execute({ context, jobDescription });
    const primary = extracted.requirements[0];
    expect(primary).toBeTruthy();

    const requirementsById = new Map(
      extracted.requirements.map((requirement) => [
        requirement.requirementId,
        requirement,
      ]),
    );
    const plan = {
      bulletId: "EXP-001-B-006",
      experienceId: "EXP-001",
      requirementId: primary!.requirementId,
      supportingRequirementIds: [],
      sequence: 6,
      achievementTheme: "component engineering",
      achievementDimension: "production-delivery" as const,
      roleFocusArea: "frontend delivery",
      communicationFocused: false,
      leadershipFocused: false,
      targetSeniority: "senior" as const,
      chronologyRank: 1,
    };

    // First pass discovers every grounded candidate, then we lock those keys to
    // simulate inventory exhaustion on a later bullet (EXP-001-B-006).
    const probe = new DirectJDKeywordEngine().select({
      jobDescription,
      plan,
      requirementsById,
      usedCanonicalKeys: new Set<string>(),
      maximumKeywords: 8,
    });
    const usedCanonicalKeys = new Set(
      probe.keywords.map((keyword) => canonicalKeywordKey(keyword)).filter(Boolean),
    );
    // Also lock JD-wide curated phrases so the unused-fallback path is empty.
    for (const requirement of extracted.requirements) {
      usedCanonicalKeys.add(canonicalKeywordKey(requirement.normalizedText));
    }

    const selection = new DirectJDKeywordEngine().select({
      jobDescription,
      plan,
      requirementsById,
      usedCanonicalKeys,
      maximumKeywords: 2,
    });

    expect(selection.keywords.length).toBeGreaterThan(0);
    expect(selection.controlledReuse.length).toBeGreaterThan(0);
    for (const evidence of selection.evidence) {
      expect(
        jobDescription.rawText
          .slice(evidence.startIndex, evidence.endIndex)
          .toLocaleLowerCase(),
      ).toBe(evidence.keyword.toLocaleLowerCase());
    }
  });
});
