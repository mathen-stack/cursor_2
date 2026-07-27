import { describe, expect, it } from "vitest";
import type {
  ExperienceEngineInput,
  GenerationContext,
  JobDescription,
} from "@resume/contracts";
import {
  createJobDescription,
  createGenerationContext,
} from "@resume/core";
import {
  createMockExperienceEngine,
  DefaultExperienceEngine,
  mockBulletComposer,
  mockBulletPlanner,
  mockExperienceValidator,
  mockKeywordAllocator,
  mockRequirementExtractor,
  mockRoleAssignmentEngine,
  mockStarGenerator,
} from "@resume/engines";

function createInput(jdText: string, experienceId = "EXP-001"): ExperienceEngineInput {
  const jobDescription = createJobDescription(jdText);
  const context = createGenerationContext("PROFILE-001", jobDescription);

  return {
    context,
    jobDescription,
    careerHistory: [
      {
        experienceId,
        companyName: "Example Company",
        startDate: "2022-01",
        endDate: "Present",
      },
    ],
  };
}

const mlJd =
  "Senior Machine Learning Engineer role requiring production machine learning systems, model deployment, monitoring, optimization, and cross-functional collaboration with product and platform teams.";

describe("Experience Engine shell", () => {
  it("returns an assigned role and at least five valid mock bullets", async () => {
    const input = createInput(mlJd);
    const engine = createMockExperienceEngine();

    const result = await engine.execute(input);

    expect(result.status).toBe("approved");
    expect(result.experiences).toHaveLength(1);
    expect(result.experiences[0]?.assignedRole).toBe(
      "Senior Machine Learning Engineer",
    );
    expect(result.experiences[0]?.bullets.length).toBeGreaterThanOrEqual(5);
    expect(result.validation.minimumBulletsSatisfied).toBe(true);
    expect(result.validation.communicationCoverage).toBe(true);
  });

  it("does not mutate the original JD, context, or career history", async () => {
    const input = createInput(mlJd);
    const snapshot = structuredClone(input);

    await createMockExperienceEngine().execute(input);

    expect(input).toEqual(snapshot);
  });

  it("rejects a sub-engine result from another generation context", async () => {
    const input = createInput(mlJd);
    const otherInput = createInput(
      "Senior Data Engineer role requiring scalable data pipelines, warehouse modeling, cloud infrastructure, and stakeholder collaboration across analytics and product teams.",
      "EXP-002",
    );

    const engine = new DefaultExperienceEngine({
      requirementExtractor: {
        ...mockRequirementExtractor,
        async execute(extractorInput) {
          const normal = await mockRequirementExtractor.execute(extractorInput);
          return { ...normal, context: otherInput.context };
        },
      },
      roleAssignmentEngine: mockRoleAssignmentEngine,
      bulletPlanner: mockBulletPlanner,
      keywordAllocator: mockKeywordAllocator,
      starGenerator: mockStarGenerator,
      bulletComposer: mockBulletComposer,
      experienceValidator: mockExperienceValidator,
    });

    await expect(engine.execute(input)).rejects.toThrow(
      /Cross-JD or cross-run output rejected/,
    );
  });

  it("keeps concurrent JD runs isolated", async () => {
    const engine = createMockExperienceEngine();
    const inputA = createInput(mlJd, "EXP-A");
    const inputB = createInput(
      "Senior Data Engineer role requiring scalable data pipelines, warehouse optimization, cloud systems, and cross-functional collaboration with analytics stakeholders.",
      "EXP-B",
    );

    const [resultA, resultB] = await Promise.all([
      engine.execute(inputA),
      engine.execute(inputB),
    ]);

    expect(resultA.context.generationId).not.toBe(resultB.context.generationId);
    expect(resultA.context.jdHash).not.toBe(resultB.context.jdHash);
    expect(resultA.experiences[0]?.assignedRole).toBe(
      "Senior Machine Learning Engineer",
    );
    expect(resultB.experiences[0]?.assignedRole).toBe("Senior Data Engineer");

    const bulletIdsA = resultA.experiences.flatMap((experience) =>
      experience.bullets.map((bullet) => bullet.bulletId),
    );
    const bulletIdsB = resultB.experiences.flatMap((experience) =>
      experience.bullets.map((bullet) => bullet.bulletId),
    );

    expect(bulletIdsA.some((id) => bulletIdsB.includes(id))).toBe(false);
  });

  it("rejects an Experience Engine input whose context does not match its JD", async () => {
    const input = createInput(mlJd);
    const mismatchedJd: JobDescription = createJobDescription(
      "Senior Backend Engineer role requiring distributed systems, API design, observability, and collaboration with product teams in a high-scale production environment.",
    );
    const mismatchedContext: GenerationContext = {
      ...input.context,
      jdId: mismatchedJd.jdId,
      jdHash: mismatchedJd.contentHash,
    };

    await expect(
      createMockExperienceEngine().execute({
        ...input,
        context: mismatchedContext,
      }),
    ).rejects.toThrow(/does not match the supplied JD/);
  });
});
