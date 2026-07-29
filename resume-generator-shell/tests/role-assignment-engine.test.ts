import { describe, expect, it } from "vitest";
import type {
  CareerEntry,
  ExperienceEngineInput,
  JobDescription,
} from "@resume/contracts";
import {
  createGenerationContext,
  createJobDescription,
} from "@resume/core";
import {
  analyzeTargetRole,
  createMilestone3ExperienceEngine,
  RealRoleAssignmentEngine,
} from "@resume/engines";
import type { JDRequirement } from "../packages/engines/src/experience/types/requirement";

const REFERENCE_DATE = new Date("2026-07-27T00:00:00Z");

function requirement(
  requirementId: string,
  normalizedText: string,
  category: JDRequirement["category"] = "technical-responsibility",
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

function makeRoleInput(
  jdText: string,
  careerHistory: CareerEntry[],
  requirements: JDRequirement[],
) {
  const jobDescription = createJobDescription(jdText);
  return {
    context: createGenerationContext("PROFILE-ROLE-TEST", jobDescription),
    jobDescription,
    careerHistory,
    requirements,
  };
}

const standardRequirements = [
  requirement("REQ-001", "Build production machine learning systems."),
  requirement("REQ-002", "Deploy models to production.", "deployment", "critical"),
  requirement("REQ-003", "Monitor model performance.", "monitoring"),
  requirement("REQ-004", "Improve inference latency.", "performance"),
  requirement("REQ-005", "Collaborate with product teams.", "collaboration"),
  requirement("REQ-006", "Lead architecture decisions.", "architecture"),
];

describe("Target role analysis", () => {
  it("detects an explicit senior machine learning title", () => {
    const jobDescription = createJobDescription(
      "Senior Machine Learning Engineer role responsible for production machine learning systems, deployment, monitoring, optimization, and cross-functional collaboration with product and platform teams.",
    );

    const result = analyzeTargetRole(jobDescription, standardRequirements);

    expect(result.targetRole).toBe("Senior Machine Learning Engineer");
    expect(result.roleFamily).toBe("machine-learning");
    expect(result.seniority).toBe("senior");
    expect(result.explicitTitleFound).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it("does not treat state management wording as Engineering Manager seniority", () => {
    const jobDescription = createJobDescription(
      [
        "Senior Frontend Engineer",
        "React.js (4+ years): Understanding of React.js fundamentals, including component life-cycles, hooks, state management strategies, and performance optimizations.",
        "Collaborate with cross-functional engineering teams and ship production user interfaces.",
      ].join("\n"),
    );
    const requirements = [
      requirement("REQ-001", "Build React.js user interfaces.", "technical-responsibility", "critical"),
      requirement("REQ-002", "Collaborate with cross-functional teams.", "collaboration", "high"),
      requirement("REQ-003", "Experience with TypeScript.", "technical-skill", "high"),
    ];

    const result = analyzeTargetRole(jobDescription, requirements);

    expect(result.roleFamily).toBe("frontend-engineering");
    expect(result.seniority).toBe("senior");
    expect(result.targetRole).toBe("Senior Frontend Engineer");
    expect(result.explicitTitleFound).toBe(true);
  });

  it("infers a data engineering role when the JD omits a formal title", () => {
    const jobDescription = createJobDescription(
      "Build reliable batch and streaming data pipelines, develop ETL workflows with Spark and Airflow, optimize a cloud data warehouse, and partner with analytics stakeholders to improve data quality.",
    );
    const requirements = [
      requirement("REQ-001", "Build data pipelines.", "data", "critical"),
      requirement("REQ-002", "Develop ETL workflows.", "data"),
      requirement("REQ-003", "Optimize a data warehouse.", "performance"),
    ];

    const result = analyzeTargetRole(jobDescription, requirements);

    expect(result.targetRole).toBe("Data Engineer");
    expect(result.roleFamily).toBe("data-engineering");
    expect(result.explicitTitleFound).toBe(false);
  });

  it("preserves staff-level seniority and normalizes ML abbreviations", () => {
    const jobDescription = createJobDescription(
      "Staff ML Engineer needed to define machine learning architecture, guide model deployment strategy, mentor engineers, and own production reliability across a large-scale platform.",
    );

    const result = analyzeTargetRole(jobDescription, standardRequirements);

    expect(result.targetRole).toBe("Staff Machine Learning Engineer");
    expect(result.seniority).toBe("staff");
  });
});

describe("Real automatic role assignment", () => {
  it("assigns a natural role progression using actual career chronology", async () => {
    const input = makeRoleInput(
      "Senior Machine Learning Engineer role responsible for production machine learning systems, model deployment, monitoring, performance optimization, technical leadership, and collaboration with product teams.",
      [
        {
          experienceId: "EXP-OLD",
          companyName: "Old Company",
          startDate: "2017-01",
          endDate: "2019-12",
        },
        {
          experienceId: "EXP-CURRENT",
          companyName: "Current Company",
          startDate: "2023-01",
          endDate: "Present",
        },
        {
          experienceId: "EXP-MIDDLE",
          companyName: "Middle Company",
          startDate: "2020-01",
          endDate: "2022-12",
        },
      ],
      standardRequirements,
    );
    const snapshot = structuredClone(input);

    const output = await new RealRoleAssignmentEngine({
      referenceDate: REFERENCE_DATE,
    }).execute(input);

    expect(output.validation?.overallStatus).toBe("approved");
    expect(output.targetRoleAnalysis?.targetRole).toBe(
      "Senior Machine Learning Engineer",
    );

    const current = output.assignments.find(
      (assignment) => assignment.experienceId === "EXP-CURRENT",
    );
    const middle = output.assignments.find(
      (assignment) => assignment.experienceId === "EXP-MIDDLE",
    );
    const old = output.assignments.find(
      (assignment) => assignment.experienceId === "EXP-OLD",
    );

    expect(current).toMatchObject({
      assignedRole: "Senior Machine Learning Engineer",
      seniority: "senior",
      chronologyRank: 1,
      isMostRecent: true,
    });
    expect(middle).toMatchObject({
      assignedRole: "Machine Learning Engineer",
      seniority: "mid",
      chronologyRank: 2,
    });
    expect(old).toMatchObject({
      assignedRole: "Software Engineer",
      seniority: "mid",
      chronologyRank: 3,
    });
    expect(output.assignments.every((assignment) => assignment.focusAreas.length > 0)).toBe(true);
    expect(input).toEqual(snapshot);
  });

  it("prefers manually provided career roles over JD auto-detection", async () => {
    const input = makeRoleInput(
      "Senior Machine Learning Engineer role responsible for production machine learning systems, model deployment, monitoring, performance optimization, technical leadership, and collaboration with product teams.",
      [
        {
          experienceId: "EXP-CURRENT",
          companyName: "Current Company",
          role: "Staff Platform Engineer",
          startDate: "2023-01",
          endDate: "Present",
        },
        {
          experienceId: "EXP-OLD",
          companyName: "Old Company",
          role: "Backend Engineer",
          startDate: "2019-01",
          endDate: "2022-12",
        },
      ],
      standardRequirements,
    );

    const output = await new RealRoleAssignmentEngine({
      referenceDate: REFERENCE_DATE,
    }).execute(input);

    expect(output.validation?.overallStatus).toBe("approved");
    expect(output.assignments.find((a) => a.experienceId === "EXP-CURRENT")).toMatchObject({
      assignedRole: "Staff Platform Engineer",
      seniority: "staff",
      isMostRecent: true,
    });
    expect(output.assignments.find((a) => a.experienceId === "EXP-OLD")).toMatchObject({
      assignedRole: "Backend Engineer",
      seniority: "mid",
    });
    expect(
      output.assignments.find((a) => a.experienceId === "EXP-CURRENT")?.rationale,
    ).toMatch(/provided on the career entry/i);
  });

  it("auto-detects roles only for experiences without a manual title", async () => {
    const input = makeRoleInput(
      "Senior Machine Learning Engineer role responsible for production machine learning systems, model deployment, monitoring, performance optimization, technical leadership, and collaboration with product teams.",
      [
        {
          experienceId: "EXP-CURRENT",
          companyName: "Current Company",
          role: "Applied Scientist",
          startDate: "2023-01",
          endDate: "Present",
        },
        {
          experienceId: "EXP-OLD",
          companyName: "Old Company",
          startDate: "2019-01",
          endDate: "2022-12",
        },
      ],
      standardRequirements,
    );

    const output = await new RealRoleAssignmentEngine({
      referenceDate: REFERENCE_DATE,
    }).execute(input);

    expect(output.validation?.overallStatus).toBe("approved");
    expect(output.assignments.find((a) => a.experienceId === "EXP-CURRENT")?.assignedRole).toBe(
      "Applied Scientist",
    );
    expect(output.assignments.find((a) => a.experienceId === "EXP-OLD")?.assignedRole).toBe(
      "Machine Learning Engineer",
    );
  });

  it("creates a deeper progression for staff-level JDs", async () => {
    const input = makeRoleInput(
      "Staff Machine Learning Engineer role owning model architecture, production deployment, platform reliability, technical strategy, and mentorship across engineering teams.",
      [
        { experienceId: "E1", companyName: "A", startDate: "2024-01", endDate: "Present" },
        { experienceId: "E2", companyName: "B", startDate: "2021-01", endDate: "2023-12" },
        { experienceId: "E3", companyName: "C", startDate: "2018-01", endDate: "2020-12" },
        { experienceId: "E4", companyName: "D", startDate: "2015-01", endDate: "2017-12" },
      ],
      standardRequirements,
    );

    const output = await new RealRoleAssignmentEngine({ referenceDate: REFERENCE_DATE }).execute(input);
    const byRank = [...output.assignments].sort((a, b) => a.chronologyRank - b.chronologyRank);

    expect(byRank.map((assignment) => assignment.assignedRole)).toEqual([
      "Staff Machine Learning Engineer",
      "Senior Machine Learning Engineer",
      "Machine Learning Engineer",
      "Software Engineer",
    ]);
  });

  it("rejects malformed career dates instead of guessing", async () => {
    const input = makeRoleInput(
      "Senior Data Engineer role building cloud data pipelines and collaborating with analytics teams to improve reliable access to business data.",
      [
        {
          experienceId: "EXP-BAD",
          companyName: "Example",
          startDate: "Spring 2022",
          endDate: "Present",
        },
      ],
      [requirement("REQ-001", "Build data pipelines.", "data")],
    );

    await expect(
      new RealRoleAssignmentEngine({ referenceDate: REFERENCE_DATE }).execute(input),
    ).rejects.toThrow(/Unsupported career date/);
  });

  it("keeps concurrent JDs and assigned role families isolated", async () => {
    const engine = new RealRoleAssignmentEngine({ referenceDate: REFERENCE_DATE });
    const careerA = [
      { experienceId: "ML-1", companyName: "A", startDate: "2022-01", endDate: "Present" },
    ];
    const careerB = [
      { experienceId: "DE-1", companyName: "B", startDate: "2022-01", endDate: "Present" },
    ];
    const inputA = makeRoleInput(
      "Senior Machine Learning Engineer role building and deploying production machine learning systems with model monitoring and optimization.",
      careerA,
      standardRequirements,
    );
    const inputB = makeRoleInput(
      "Senior Data Engineer role building scalable data pipelines, ETL workflows, cloud warehouses, and reliable analytics data products.",
      careerB,
      [
        requirement("REQ-101", "Build data pipelines.", "data"),
        requirement("REQ-102", "Develop ETL workflows.", "data"),
      ],
    );

    const [outputA, outputB] = await Promise.all([
      engine.execute(inputA),
      engine.execute(inputB),
    ]);

    expect(outputA.context.generationId).not.toBe(outputB.context.generationId);
    expect(outputA.targetRoleAnalysis?.roleFamily).toBe("machine-learning");
    expect(outputB.targetRoleAnalysis?.roleFamily).toBe("data-engineering");
    expect(outputA.assignments[0]?.assignedRole).toBe("Senior Machine Learning Engineer");
    expect(outputB.assignments[0]?.assignedRole).toBe("Senior Data Engineer");
  });
});

describe("Milestone 3 integration", () => {
  it("uses real requirement extraction and real role assignment while downstream stages remain mocked", async () => {
    const jobDescription: JobDescription = createJobDescription(
      "Senior Data Engineer role. Build scalable data pipelines. Develop ETL workflows using Spark. Optimize cloud warehouse performance. Collaborate with analytics and product stakeholders. Improve data quality and delivery reliability.",
    );
    const input: ExperienceEngineInput = {
      context: createGenerationContext("PROFILE-INTEGRATION", jobDescription),
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

    const result = await createMilestone3ExperienceEngine({
      referenceDate: REFERENCE_DATE,
    }).execute(input);

    expect(result.status).toBe("approved");
    expect(result.experiences[0]?.assignedRole).toBe("Senior Data Engineer");
    expect(result.experiences[0]?.bullets.length).toBeGreaterThanOrEqual(5);
  });
});
