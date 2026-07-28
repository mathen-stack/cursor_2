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
  RealStarGenerator,
  RuleBasedRequirementModel,
  createMilestone6ExperienceEngine,
} from "@resume/engines";

const REFERENCE_DATE = new Date("2026-07-27T00:00:00.000Z");

async function createRealStarInput(jdText?: string) {
  const jobDescription = createJobDescription(
    jdText ??
      "Senior Machine Learning Engineer. Design scalable machine learning architecture. Deploy machine learning models to production using Docker and Kubernetes. Monitor model performance with MLflow and Prometheus. Optimize inference latency and throughput. Build reliable data pipelines with Airflow and Spark. Collaborate with product and platform stakeholders. Lead technical strategy and architecture decisions. Improve customer-facing AI reliability.",
  );
  const context = createGenerationContext("PROFILE-STAR", jobDescription);
  const careerHistory = [
    {
      experienceId: "EXP-CURRENT",
      companyName: "Example AI",
      startDate: "2022-01",
      endDate: "Present",
    },
  ];
  const extractor = new RealRequirementExtractor({
    model: new RuleBasedRequirementModel(),
  });
  const extracted = await extractor.execute({ context, jobDescription });
  const roles = await new RealRoleAssignmentEngine({
    referenceDate: REFERENCE_DATE,
  }).execute({
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
  const keywords = await new RealKeywordAllocator().execute({
    context,
    jobDescription,
    assignments: roles.assignments,
    requirements: extracted.requirements,
    plans: plans.plans,
  });
  return {
    input: {
      context,
      jobDescription,
      assignments: roles.assignments,
      requirements: extracted.requirements,
      plans: plans.plans,
      keywordPackages: keywords.packages,
    },
  };
}

describe("Real STAR generation", () => {
  it("generates one coherent STAR story and plausible metric for every bullet plan", async () => {
    const { input } = await createRealStarInput();
    const output = await new RealStarGenerator().execute(input);

    expect(output.stories).toHaveLength(input.plans.length);
    expect(output.validation?.overallStatus).toBe("approved");
    expect(output.validation?.allStoriesCoherent).toBe(true);
    expect(output.validation?.allMetricsPlausible).toBe(true);

    for (const story of output.stories) {
      expect(story.situation.length).toBeGreaterThan(30);
      expect(story.task.length).toBeGreaterThan(20);
      expect(story.action.length).toBeGreaterThan(30);
      expect(story.result.length).toBeGreaterThan(25);
      expect(story.metrics).toHaveLength(1);
      expect(story.coherenceScore).toBeGreaterThanOrEqual(8);
      expect(story.metricPlausibilityScore).toBeGreaterThanOrEqual(8);
      expect(story.status).toBe("approved");
      expect(story.metrics[0]?.provenance).toBe("generated-hypothetical");
    }
  });

  it("uses the allocated action verb, direct JD language, supporting methods, and outcomes", async () => {
    const { input } = await createRealStarInput();
    const output = await new RealStarGenerator().execute(input);
    const packagesByBullet = new Map(
      input.keywordPackages.map((item) => [item.bulletId, item]),
    );

    for (const story of output.stories) {
      const keywordPackage = packagesByBullet.get(story.bulletId);
      expect(keywordPackage).toBeDefined();
      expect(story.action.toLowerCase()).toContain(
        keywordPackage?.actionVerb.toLowerCase(),
      );
      expect(
        keywordPackage?.directKeywords.some((keyword) =>
          `${story.task} ${story.action}`
            .toLowerCase()
            .includes(keyword.toLowerCase()),
        ),
      ).toBe(true);
      for (const keyword of keywordPackage?.supportingKeywords ?? []) {
        expect(story.action.toLowerCase()).toContain(keyword.toLowerCase());
      }
      for (const keyword of keywordPackage?.outcomeKeywords ?? []) {
        expect(
          `${story.result} ${story.metrics.map((metric) => metric.outcomeKeyword).join(" ")}`
            .toLowerCase()
            .includes(keyword.toLowerCase()),
        ).toBe(true);
      }
    }
  });

  it("creates distinct measured outcomes within a role", async () => {
    const { input } = await createRealStarInput();
    const output = await new RealStarGenerator().execute(input);
    const fingerprints = output.stories.flatMap((story) =>
      story.metrics.map(
        (metric) =>
          `${story.experienceId}:${metric.metricType}:${metric.direction}:${metric.unit}:${metric.measure.toLowerCase()}`,
      ),
    );
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
    expect(output.validation?.metricPatternsDistinctWithinRoles).toBe(true);
  });

  it("creates meaningful communication and leadership stories", async () => {
    const { input } = await createRealStarInput();
    const output = await new RealStarGenerator().execute(input);
    const plansByBullet = new Map(
      input.plans.map((plan) => [plan.bulletId, plan]),
    );

    const communicationStories = output.stories.filter(
      (story) => plansByBullet.get(story.bulletId)?.communicationFocused,
    );
    const leadershipStories = output.stories.filter(
      (story) => plansByBullet.get(story.bulletId)?.leadershipFocused,
    );

    expect(communicationStories.length).toBeGreaterThan(0);
    expect(
      communicationStories.every((story) =>
        /stakeholder|cross-functional|product|business|alignment/i.test(
          `${story.situation} ${story.task} ${story.action} ${story.result}`,
        ),
      ),
    ).toBe(true);
    expect(leadershipStories.length).toBeGreaterThan(0);
    expect(
      leadershipStories.every((story) =>
        /direction|strategy|design review|coordinat|owned/i.test(
          `${story.task} ${story.action} ${story.result}`,
        ),
      ),
    ).toBe(true);
    expect(output.validation?.communicationStoriesRelevant).toBe(true);
    expect(output.validation?.leadershipStoriesRelevant).toBe(true);
  });

  it("does not mutate the original JD, plans, assignments, requirements, or keyword packages", async () => {
    const { input } = await createRealStarInput();
    const snapshot = structuredClone(input);
    await new RealStarGenerator().execute(input);
    expect(input).toEqual(snapshot);
  });

  it("rejects a generation context belonging to another JD", async () => {
    const { input } = await createRealStarInput();
    const otherJd = createJobDescription(
      "Senior Data Engineer. Build cloud data platforms and collaborate with analytics stakeholders.",
    );

    await expect(
      new RealStarGenerator().execute({
        ...input,
        context: createGenerationContext("PROFILE-STAR", otherJd),
      }),
    ).rejects.toThrow(/does not match the supplied JD/);
  });

  it("keeps simultaneous JD STAR state isolated", async () => {
    const first = await createRealStarInput();
    const second = await createRealStarInput(
      "Senior Data Engineer. Architect cloud data platforms on AWS. Build ETL pipelines using Spark and Airflow. Optimize Snowflake performance. Monitor data quality. Collaborate with analytics stakeholders. Lead data architecture decisions.",
    );

    const [outputA, outputB] = await Promise.all([
      new RealStarGenerator().execute(first.input),
      new RealStarGenerator().execute(second.input),
    ]);

    expect(outputA.context.generationId).not.toBe(outputB.context.generationId);
    expect(outputA.context.jdHash).not.toBe(outputB.context.jdHash);
    expect(outputA.stories.map((story) => story.action).join(" ")).toMatch(
      /Docker|Kubernetes|MLflow|Prometheus/i,
    );
    expect(outputA.stories.map((story) => story.action).join(" ")).not.toMatch(
      /Snowflake/i,
    );
    expect(outputB.stories.map((story) => story.action).join(" ")).toMatch(
      /AWS|Spark|Airflow|Snowflake/i,
    );
  });
});

describe("Milestone 6 integration", () => {
  it("uses the real STAR generator while final composition and Experience validation remain mocked", async () => {
    const jobDescription = createJobDescription(
      "Senior Data Engineer role. Build scalable data pipelines using Spark and Airflow. Develop ETL workflows on AWS. Optimize Snowflake warehouse performance. Monitor data quality. Collaborate with analytics and product stakeholders. Lead data architecture decisions. Improve delivery reliability.",
    );
    const input: ExperienceEngineInput = {
      context: createGenerationContext("PROFILE-M6", jobDescription),
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

    const result = await createMilestone6ExperienceEngine({
      role: { referenceDate: REFERENCE_DATE },
    }).execute(input);

    expect(result.status).toBe("approved");
    expect(result.engineVersion).toBe("0.6.0");
    expect(result.experiences[0]?.assignedRole).toBe("Senior Data Engineer");
    expect(result.experiences[0]?.bullets).toHaveLength(6);
    expect(
      result.experiences[0]?.bullets.every((bullet) =>
        /%|\d(?:\.\d)?x/.test(bullet.result),
      ),
    ).toBe(true);
    expect(result.validation.communicationCoverage).toBe(true);
  });
});
