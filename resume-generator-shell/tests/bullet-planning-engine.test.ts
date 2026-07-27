import { describe, expect, it } from "vitest";
import type {
  ExperienceEngineInput,
  JobDescription,
} from "@resume/contracts";
import {
  createGenerationContext,
  createJobDescription,
} from "@resume/core";
import {
  RealBulletPlanner,
  createMilestone4ExperienceEngine,
  type JDRequirement,
  type RoleAssignment,
} from "@resume/engines";

const REFERENCE_DATE = new Date("2026-07-27T00:00:00.000Z");

function requirement(
  requirementId: string,
  normalizedText: string,
  category: JDRequirement["category"],
  priority: JDRequirement["priority"] = "high",
): JDRequirement {
  return {
    requirementId,
    sourceText: normalizedText,
    normalizedText,
    category,
    priority,
    necessity: "required",
    evidence: [
      {
        sourceText: normalizedText,
        startIndex: 0,
        endIndex: normalizedText.length,
      },
    ],
  };
}

const planningRequirements: JDRequirement[] = [
  requirement("REQ-001", "Design scalable machine learning architecture.", "architecture", "critical"),
  requirement("REQ-002", "Deploy machine learning models to production.", "deployment", "critical"),
  requirement("REQ-003", "Monitor production model performance.", "monitoring"),
  requirement("REQ-004", "Optimize inference latency and throughput.", "performance"),
  requirement("REQ-005", "Build reliable data pipelines.", "data"),
  requirement("REQ-006", "Collaborate with product and platform stakeholders.", "collaboration"),
  requirement("REQ-007", "Lead technical strategy and architecture decisions.", "leadership"),
  requirement("REQ-008", "Improve customer-facing AI reliability.", "business-outcome"),
  requirement("REQ-009", "Use Kubernetes for container orchestration.", "tool-or-platform", "medium"),
  requirement("REQ-010", "Bachelor's degree in Computer Science.", "education", "medium"),
];

const assignments: RoleAssignment[] = [
  {
    experienceId: "EXP-CURRENT",
    assignedRole: "Senior Machine Learning Engineer",
    seniority: "senior",
    focusAreas: [
      "production machine learning",
      "model deployment",
      "technical leadership",
    ],
    sourceRequirementIds: ["REQ-001", "REQ-002", "REQ-003", "REQ-007"],
    chronologyRank: 1,
    durationMonths: 43,
    isMostRecent: true,
    rationale: "Current target-aligned role.",
  },
  {
    experienceId: "EXP-PAST",
    assignedRole: "Machine Learning Engineer",
    seniority: "mid",
    focusAreas: ["model development", "data pipelines", "performance"],
    sourceRequirementIds: ["REQ-004", "REQ-005", "REQ-009"],
    chronologyRank: 2,
    durationMonths: 36,
    isMostRecent: false,
    rationale: "Earlier technical role.",
  },
];

function createPlannerInput() {
  const jobDescription = createJobDescription(
    "Senior Machine Learning Engineer. Design scalable machine learning architecture. Deploy machine learning models to production. Monitor production model performance. Optimize inference latency and throughput. Build reliable data pipelines. Collaborate with product and platform stakeholders. Lead technical strategy and architecture decisions. Improve customer-facing AI reliability. Use Kubernetes for container orchestration. Bachelor's degree in Computer Science.",
  );

  return {
    context: createGenerationContext("PROFILE-PLAN", jobDescription),
    jobDescription,
    assignments,
    requirements: planningRequirements,
    minimumBulletsPerRole: 5,
  };
}

describe("Real requirement allocation and bullet planning", () => {
  it("plans six distinct bullets for the most recent role and at least five for every role", async () => {
    const input = createPlannerInput();
    const snapshot = structuredClone(input);
    const output = await new RealBulletPlanner().execute(input);

    const currentPlans = output.plans.filter(
      (plan) => plan.experienceId === "EXP-CURRENT",
    );
    const pastPlans = output.plans.filter(
      (plan) => plan.experienceId === "EXP-PAST",
    );

    expect(currentPlans).toHaveLength(6);
    expect(pastPlans.length).toBeGreaterThanOrEqual(5);
    expect(output.validation?.overallStatus).toBe("approved");
    expect(output.validation?.minimumBulletsSatisfied).toBe(true);
    expect(input).toEqual(snapshot);
  });

  it("creates unique achievement dimensions and communication coverage in every role", async () => {
    const output = await new RealBulletPlanner().execute(createPlannerInput());

    for (const assignment of assignments) {
      const rolePlans = output.plans.filter(
        (plan) => plan.experienceId === assignment.experienceId,
      );
      expect(rolePlans.some((plan) => plan.communicationFocused)).toBe(true);
      expect(new Set(rolePlans.map((plan) => plan.achievementDimension)).size).toBe(
        rolePlans.length,
      );
    }

    const seniorPlans = output.plans.filter(
      (plan) => plan.experienceId === "EXP-CURRENT",
    );
    expect(seniorPlans.some((plan) => plan.leadershipFocused)).toBe(true);
  });

  it("covers critical experience requirements and never uses education as a bullet's primary requirement", async () => {
    const output = await new RealBulletPlanner().execute(createPlannerInput());
    const primaryRequirementIds = new Set(
      output.plans.map((plan) => plan.requirementId),
    );

    expect(primaryRequirementIds.has("REQ-001")).toBe(true);
    expect(primaryRequirementIds.has("REQ-002")).toBe(true);
    expect(primaryRequirementIds.has("REQ-010")).toBe(false);
    expect(output.validation?.criticalRequirementCoverage).toBe(true);
  });

  it("uses explicit reused-grounding plans only when the JD has too few distinct experience requirements", async () => {
    const jobDescription = createJobDescription(
      "Senior Backend Engineer. Build reliable APIs. Collaborate with product stakeholders.",
    );
    const context = createGenerationContext("PROFILE-SMALL-JD", jobDescription);
    const output = await new RealBulletPlanner().execute({
      context,
      jobDescription,
      assignments: [
        {
          experienceId: "EXP-ONLY",
          assignedRole: "Senior Backend Engineer",
          seniority: "senior",
          focusAreas: ["API development", "reliability"],
          sourceRequirementIds: ["REQ-001", "REQ-002"],
          chronologyRank: 1,
          durationMonths: 48,
          isMostRecent: true,
          rationale: "Single-role test.",
        },
      ],
      requirements: [
        requirement("REQ-001", "Build reliable APIs.", "technical-responsibility", "critical"),
        requirement("REQ-002", "Collaborate with product stakeholders.", "collaboration"),
      ],
      minimumBulletsPerRole: 5,
    });

    expect(output.plans).toHaveLength(6);
    expect(
      output.plans.some(
        (plan) => plan.requirementAllocationKind === "reused-grounding",
      ),
    ).toBe(true);
    expect(new Set(output.plans.map((plan) => plan.achievementDimension)).size).toBe(6);
    expect(output.validation?.warnings.some((warning) => /reused/i.test(warning))).toBe(true);
  });

  it("rejects a context from a different JD", async () => {
    const input = createPlannerInput();
    const otherJd = createJobDescription(
      "Senior Data Engineer building cloud data pipelines and data products.",
    );

    await expect(
      new RealBulletPlanner().execute({
        ...input,
        context: createGenerationContext("PROFILE-PLAN", otherJd),
      }),
    ).rejects.toThrow(/does not match the supplied JD/);
  });

  it("keeps concurrent planning state isolated", async () => {
    const planner = new RealBulletPlanner();
    const inputA = createPlannerInput();
    const inputB = createPlannerInput();
    const jdB = createJobDescription(
      "Senior Data Engineer. Build data pipelines. Optimize warehouse performance. Collaborate with analytics stakeholders. Lead data architecture. Monitor data quality.",
    );
    inputB.context = createGenerationContext("PROFILE-B", jdB);
    inputB.jobDescription = jdB;
    inputB.assignments = inputB.assignments.map((assignment) => ({
      ...assignment,
      experienceId: `B-${assignment.experienceId}`,
      assignedRole: assignment.isMostRecent ? "Senior Data Engineer" : "Data Engineer",
    }));

    const [outputA, outputB] = await Promise.all([
      planner.execute(inputA),
      planner.execute(inputB),
    ]);

    expect(outputA.context.generationId).not.toBe(outputB.context.generationId);
    expect(
      outputA.plans.some((planA) =>
        outputB.plans.some((planB) => planA.bulletId === planB.bulletId),
      ),
    ).toBe(false);
  });
});

describe("Milestone 4 integration", () => {
  it("uses real extraction, role assignment, and planning while downstream stages remain mocked", async () => {
    const jobDescription: JobDescription = createJobDescription(
      "Senior Data Engineer role. Build scalable data pipelines. Develop ETL workflows using Spark. Optimize cloud warehouse performance. Monitor data quality. Collaborate with analytics and product stakeholders. Lead data architecture decisions. Improve delivery reliability.",
    );
    const input: ExperienceEngineInput = {
      context: createGenerationContext("PROFILE-M4", jobDescription),
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

    const result = await createMilestone4ExperienceEngine({
      referenceDate: REFERENCE_DATE,
    }).execute(input);

    expect(result.status).toBe("approved");
    expect(result.experiences[0]?.assignedRole).toBe("Senior Data Engineer");
    expect(result.experiences[0]?.bullets).toHaveLength(6);
    expect(result.validation.communicationCoverage).toBe(true);
  });
});
