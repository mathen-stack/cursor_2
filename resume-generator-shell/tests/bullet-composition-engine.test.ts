import { describe, expect, it } from "vitest";
import type { ExperienceEngineInput } from "@resume/contracts";
import { createGenerationContext, createJobDescription } from "@resume/core";
import {
  RealBulletComposer,
  RealBulletPlanner,
  RealKeywordAllocator,
  RealRequirementExtractor,
  RealRoleAssignmentEngine,
  RealStarGenerator,
  RuleBasedRequirementModel,
  createMilestone7ExperienceEngine,
  sentenceCount,
  wordCount,
} from "@resume/engines";

const REFERENCE_DATE = new Date("2026-07-27T00:00:00.000Z");

async function createRealCompositionInput(jdText?: string) {
  const jobDescription = createJobDescription(
    jdText ??
      "Senior Machine Learning Engineer. Design scalable machine learning architecture. Deploy machine learning models to production using Docker and Kubernetes. Monitor model performance with MLflow and Prometheus. Optimize inference latency and throughput. Build reliable data pipelines with Airflow and Spark. Collaborate with product and platform stakeholders. Lead technical strategy and architecture decisions. Improve customer-facing AI reliability.",
  );
  const context = createGenerationContext("PROFILE-COMPOSER", jobDescription);
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
  const requirements = await extractor.execute({ context, jobDescription });
  const roles = await new RealRoleAssignmentEngine({
    referenceDate: REFERENCE_DATE,
  }).execute({
    context,
    jobDescription,
    careerHistory,
    requirements: requirements.requirements,
  });
  const plans = await new RealBulletPlanner().execute({
    context,
    jobDescription,
    assignments: roles.assignments,
    requirements: requirements.requirements,
    minimumBulletsPerRole: 5,
  });
  const keywords = await new RealKeywordAllocator().execute({
    context,
    jobDescription,
    assignments: roles.assignments,
    requirements: requirements.requirements,
    plans: plans.plans,
  });
  const stories = await new RealStarGenerator().execute({
    context,
    jobDescription,
    assignments: roles.assignments,
    requirements: requirements.requirements,
    plans: plans.plans,
    keywordPackages: keywords.packages,
  });
  return {
    input: {
      context,
      jobDescription,
      plans: plans.plans,
      keywordPackages: keywords.packages,
      stories: stories.stories,
    },
  };
}

describe("Real compressed-STAR bullet composition", () => {
  it("composes one scan-friendly, quantified sentence for every STAR story", async () => {
    const { input } = await createRealCompositionInput();
    const output = await new RealBulletComposer().execute(input);

    expect(output.bullets).toHaveLength(input.plans.length);
    expect(output.validation?.overallStatus).toBe("approved");
    expect(output.validation?.allBulletsSingleSentence).toBe(true);
    expect(output.validation?.allBulletsQuantified).toBe(true);
    expect(output.validation?.allBulletsStrong).toBe(true);
    expect(output.validation?.allBulletsDistinctive).toBe(true);

    for (const bullet of output.bullets) {
      expect(sentenceCount(bullet.finalBullet)).toBe(1);
      expect(wordCount(bullet.finalBullet)).toBeGreaterThanOrEqual(16);
      expect(wordCount(bullet.finalBullet)).toBeLessThanOrEqual(46);
      expect(bullet.finalBullet).toMatch(/\d+(?:\.\d+)?(?:%|x|ms| hours| days)/i);
      expect(bullet.strengthScore).toBeGreaterThanOrEqual(8);
      expect(bullet.distinctivenessScore).toBeGreaterThanOrEqual(8);
      expect(bullet.status).toBe("approved");
    }
  });

  it("starts with the allocated verb and preserves JD, supporting, and outcome concepts", async () => {
    const { input } = await createRealCompositionInput();
    const output = await new RealBulletComposer().execute(input);
    const packagesByBullet = new Map(
      input.keywordPackages.map((item) => [item.bulletId, item]),
    );

    for (const bullet of output.bullets) {
      const keywordPackage = packagesByBullet.get(bullet.bulletId);
      expect(keywordPackage).toBeDefined();
      expect(bullet.finalBullet.toLowerCase().startsWith(
        `${keywordPackage?.actionVerb.toLowerCase()} `,
      )).toBe(true);
      for (const keyword of keywordPackage?.supportingKeywords ?? []) {
        expect(bullet.finalBullet.toLowerCase()).toContain(keyword.toLowerCase());
      }
      for (const keyword of keywordPackage?.outcomeKeywords ?? []) {
        expect(bullet.finalBullet.toLowerCase()).toContain(keyword.toLowerCase());
      }
    }

    expect(output.validation?.allDirectKeywordsRepresented).toBe(true);
    expect(output.validation?.allSupportingKeywordsUsed).toBe(true);
    expect(output.validation?.allOutcomesUsed).toBe(true);
    expect(output.validation?.allBulletsStartWithAllocatedVerbs).toBe(true);
  });

  it("varies sentence patterns and preserves communication and leadership signals", async () => {
    const { input } = await createRealCompositionInput();
    const output = await new RealBulletComposer().execute(input);
    const patterns = output.validation?.diagnostics.map(
      (item) => item.sentencePattern,
    ) ?? [];

    expect(new Set(patterns).size).toBeGreaterThanOrEqual(3);
    expect(output.validation?.communicationCoveragePreserved).toBe(true);
    expect(output.validation?.leadershipCoveragePreserved).toBe(true);
    expect(
      output.validation?.diagnostics
        .filter((item) =>
          input.plans.find((plan) => plan.bulletId === item.bulletId)
            ?.communicationFocused,
        )
        .every((item) => item.communicationSignalPresent),
    ).toBe(true);
    expect(
      output.validation?.diagnostics
        .filter((item) =>
          input.plans.find((plan) => plan.bulletId === item.bulletId)
            ?.leadershipFocused,
        )
        .every((item) => item.leadershipSignalPresent),
    ).toBe(true);
  });

  it("does not mutate its JD, plans, keywords, or STAR stories", async () => {
    const { input } = await createRealCompositionInput();
    const snapshot = structuredClone(input);
    await new RealBulletComposer().execute(input);
    expect(input).toEqual(snapshot);
  });

  it("rejects a generation context belonging to another JD", async () => {
    const { input } = await createRealCompositionInput();
    const otherJd = createJobDescription(
      "Senior Data Engineer. Build scalable data platforms and collaborate with analytics stakeholders.",
    );
    await expect(
      new RealBulletComposer().execute({
        ...input,
        context: createGenerationContext("PROFILE-COMPOSER", otherJd),
      }),
    ).rejects.toThrow(/does not match the supplied JD/);
  });

  it("keeps simultaneous JD composition state isolated", async () => {
    const first = await createRealCompositionInput();
    const second = await createRealCompositionInput(
      "Senior Data Engineer. Architect cloud data platforms on AWS. Build ETL pipelines using Spark and Airflow. Optimize Snowflake performance. Monitor data quality. Collaborate with analytics stakeholders. Lead data architecture decisions.",
    );
    const [outputA, outputB] = await Promise.all([
      new RealBulletComposer().execute(first.input),
      new RealBulletComposer().execute(second.input),
    ]);

    const textA = outputA.bullets.map((item) => item.finalBullet).join(" ");
    const textB = outputB.bullets.map((item) => item.finalBullet).join(" ");
    expect(outputA.context.generationId).not.toBe(outputB.context.generationId);
    expect(outputA.context.jdHash).not.toBe(outputB.context.jdHash);
    expect(textA).toMatch(/Docker|Kubernetes|MLflow|Prometheus/i);
    expect(textA).not.toMatch(/Snowflake/i);
    expect(textB).toMatch(/AWS|Spark|Airflow|Snowflake/i);
  });
});

describe("Milestone 7 integration", () => {
  it("uses the real compressed-STAR composer while full Experience validation remains mocked", async () => {
    const jobDescription = createJobDescription(
      "Senior Data Engineer role. Build scalable data pipelines using Spark and Airflow. Develop ETL workflows on AWS. Optimize Snowflake warehouse performance. Monitor data quality. Collaborate with analytics and product stakeholders. Lead data architecture decisions. Improve delivery reliability.",
    );
    const input: ExperienceEngineInput = {
      context: createGenerationContext("PROFILE-M7", jobDescription),
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

    const result = await createMilestone7ExperienceEngine({
      role: { referenceDate: REFERENCE_DATE },
    }).execute(input);

    expect(result.status).toBe("approved");
    expect(result.engineVersion).toBe("0.7.0");
    expect(result.experiences[0]?.assignedRole).toBe("Senior Data Engineer");
    expect(result.experiences[0]?.bullets).toHaveLength(6);
    expect(
      result.experiences[0]?.bullets.every(
        (bullet) =>
          bullet.strengthScore >= 8 &&
          bullet.distinctivenessScore >= 8 &&
          sentenceCount(bullet.finalBullet) === 1,
      ),
    ).toBe(true);
    expect(result.validation.communicationCoverage).toBe(true);
  });
});
