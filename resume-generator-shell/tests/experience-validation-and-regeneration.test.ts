import { describe, expect, it } from "vitest";
import type { ExperienceEngineInput } from "@resume/contracts";
import { createGenerationContext, createJobDescription } from "@resume/core";
import {
  RealBulletComposer,
  RealBulletPlanner,
  RealExperienceValidator,
  RealKeywordAllocator,
  RealRequirementExtractor,
  RealRoleAssignmentEngine,
  RealSelectiveRegenerationController,
  RealStarGenerator,
  RuleBasedRequirementModel,
  createMilestone8ExperienceEngine,
} from "@resume/engines";

const REFERENCE_DATE = new Date("2026-07-27T00:00:00.000Z");

async function createValidationFixture(jdText?: string) {
  const jobDescription = createJobDescription(
    jdText ??
      "Senior Machine Learning Engineer. Design scalable machine learning architecture. Deploy machine learning models to production using Docker and Kubernetes. Monitor model performance with MLflow and Prometheus. Optimize inference latency and throughput. Build reliable data pipelines with Airflow and Spark. Collaborate with product and platform stakeholders. Lead technical strategy and architecture decisions. Improve customer-facing AI reliability.",
  );
  const context = createGenerationContext("PROFILE-VALIDATION", jobDescription);
  const careerHistory = [
    {
      experienceId: "EXP-CURRENT",
      companyName: "Example AI",
      startDate: "2022-01",
      endDate: "Present",
    },
  ];
  const requirementExtractor = new RealRequirementExtractor({
    model: new RuleBasedRequirementModel(),
  });
  const roleAssignmentEngine = new RealRoleAssignmentEngine({
    referenceDate: REFERENCE_DATE,
  });
  const bulletPlanner = new RealBulletPlanner();
  const keywordAllocator = new RealKeywordAllocator();
  const starGenerator = new RealStarGenerator();
  const bulletComposer = new RealBulletComposer();
  const experienceValidator = new RealExperienceValidator();

  const requirements = await requirementExtractor.execute({
    context,
    jobDescription,
  });
  const roles = await roleAssignmentEngine.execute({
    context,
    jobDescription,
    careerHistory,
    requirements: requirements.requirements,
  });
  const plans = await bulletPlanner.execute({
    context,
    jobDescription,
    assignments: roles.assignments,
    requirements: requirements.requirements,
    minimumBulletsPerRole: 5,
  });
  const keywords = await keywordAllocator.execute({
    context,
    jobDescription,
    assignments: roles.assignments,
    requirements: requirements.requirements,
    plans: plans.plans,
  });
  const stories = await starGenerator.execute({
    context,
    jobDescription,
    assignments: roles.assignments,
    requirements: requirements.requirements,
    plans: plans.plans,
    keywordPackages: keywords.packages,
  });
  const composed = await bulletComposer.execute({
    context,
    jobDescription,
    plans: plans.plans,
    keywordPackages: keywords.packages,
    stories: stories.stories,
  });

  return {
    context,
    jobDescription,
    careerHistory,
    requirements: requirements.requirements,
    assignments: roles.assignments,
    plans: plans.plans,
    keywordPackages: keywords.packages,
    stories: stories.stories,
    bullets: composed.bullets,
    keywordAllocator,
    starGenerator,
    bulletComposer,
    experienceValidator,
  };
}

function validationInput(fixture: Awaited<ReturnType<typeof createValidationFixture>>) {
  return {
    context: fixture.context,
    jobDescription: fixture.jobDescription,
    careerHistory: fixture.careerHistory,
    assignments: fixture.assignments,
    requirements: fixture.requirements,
    plans: fixture.plans,
    keywordPackages: fixture.keywordPackages,
    stories: fixture.stories,
    bullets: fixture.bullets,
    minimumBulletsPerRole: 5,
  };
}

describe("Real Experience section validation", () => {
  it("approves a strong, traceable, non-repetitive Experience section", async () => {
    const fixture = await createValidationFixture();
    const output = await fixture.experienceValidator.execute(
      validationInput(fixture),
    );

    expect(output.validation.overallStatus).toBe("approved");
    expect(output.validation.failedBulletIds).toEqual([]);
    expect(output.validation.allBulletsStrong).toBe(true);
    expect(output.validation.allBulletsTraceable).toBe(true);
    expect(output.validation.allBulletsDomainCoherent).toBe(true);
    expect(output.validation.atsLanguageApproved).toBe(true);
    expect(output.validation.communicationCoverage).toBe(true);
    expect(output.validation.leadershipCoverage).toBe(true);
    expect(
      output.validation.diagnostics.every(
        (diagnostic) => diagnostic.scores.overall >= 8,
      ),
    ).toBe(true);
  });

  it("detects exact, semantic, achievement, metric, and action-verb repetition globally", async () => {
    const fixture = await createValidationFixture();
    const first = fixture.bullets[0];
    const second = fixture.bullets[1];
    if (!first || !second) throw new Error("Fixture requires two bullets.");
    const corrupted = fixture.bullets.map((bullet, index) =>
      index === 1
        ? {
            ...bullet,
            actionVerb: first.actionVerb,
            situation: first.situation,
            task: first.task,
            action: first.action,
            result: first.result,
            finalBullet: first.finalBullet,
          }
        : bullet,
    );

    const output = await fixture.experienceValidator.execute({
      ...validationInput(fixture),
      bullets: corrupted,
    });

    expect(output.validation.overallStatus).toBe("rejected");
    expect(output.validation.failedBulletIds).toContain(second.bulletId);
    expect(output.validation.failedBulletIds).not.toContain(first.bulletId);
    expect(output.validation.exactRepetitionGroups.length).toBeGreaterThan(0);
    expect(output.validation.morphologicalRepetitionGroups.length).toBeGreaterThan(0);
    expect(output.validation.semanticRepetitionGroups.length).toBeGreaterThan(0);
    expect(output.validation.issues.some((item) => item.severity === "error")).toBe(true);
  });

  it("soft-fails residual passive voice instead of hard-rejecting", async () => {
    const fixture = await createValidationFixture();
    const target = fixture.bullets[0];
    if (!target) throw new Error("Fixture requires one bullet.");
    // Inject a residual passive clause while keeping the allocated opening verb,
    // metric, and claimed keywords intact.
    const corrupted = fixture.bullets.map((bullet, index) => {
      if (index !== 0) return bullet;
      const withoutPeriod = bullet.finalBullet.replace(/\.+$/, "");
      return {
        ...bullet,
        finalBullet: `${withoutPeriod} after services were deployed with monitoring.`,
      };
    });

    const output = await fixture.experienceValidator.execute({
      ...validationInput(fixture),
      bullets: corrupted,
    });
    const diagnostic = output.validation.diagnostics.find(
      (item) => item.bulletId === target.bulletId,
    );

    expect(
      diagnostic?.warnings.some((warning) => /avoidable passive voice/i.test(warning)),
    ).toBe(true);
    expect(
      diagnostic?.errors.some((error) => /avoidable passive voice/i.test(error)),
    ).toBe(false);
    expect(
      output.validation.issues
        .filter((issue) => /avoidable passive voice/i.test(issue.message))
        .every((issue) => issue.severity === "warning"),
    ).toBe(true);
    expect(output.validation.failedBulletIds).not.toContain(target.bulletId);
    expect(output.validation.overallStatus).toBe("approved");
  });

  it("soft-fails residual role-seniority and leadership-coverage instead of hard-rejecting", async () => {
    const fixture = await createValidationFixture();
    const seniorSignal =
      /\b(?:architect(?:ed|ure)?|strategy|roadmap|standard|governance|mentored|led|leadership|design review|technical direction|cross-functional|stakeholder)\b/i;
    const dropSeniorKeywords = (values: readonly string[]) =>
      values.filter((value) => !seniorSignal.test(value));
    const corrupted = fixture.bullets.map((bullet) => {
      // Keep domain checks honest by dropping senior-signal keywords from the
      // claimed lists while removing those phrases from the bullet text.
      const stripped = bullet.finalBullet
        .replace(
          /\b(?:architect(?:ed|ure)?|strategy|roadmap|standard|governance|mentored|led|leadership|design review|technical direction|cross-functional|stakeholder)\b/gi,
          "platform",
        )
        .replace(/^\S+/, "Delivered");
      return {
        ...bullet,
        directKeywords: dropSeniorKeywords(bullet.directKeywords),
        supportingKeywords: dropSeniorKeywords(bullet.supportingKeywords),
        outcomeKeywords: dropSeniorKeywords(bullet.outcomeKeywords),
        finalBullet: stripped,
      };
    });

    const output = await fixture.experienceValidator.execute({
      ...validationInput(fixture),
      bullets: corrupted,
    });

    expect(
      output.validation.issues
        .filter((issue) => issue.issueCode === "role-seniority")
        .every((issue) => issue.severity === "warning"),
    ).toBe(true);
    expect(
      output.validation.issues
        .filter((issue) => issue.issueCode === "leadership-coverage")
        .every((issue) => issue.severity === "warning"),
    ).toBe(true);
    expect(
      output.validation.issues.filter(
        (issue) =>
          ["role-seniority", "leadership-coverage"].includes(issue.issueCode) &&
          issue.severity === "error",
      ),
    ).toEqual([]);
    expect(output.validation.failedBulletIds).toEqual([]);
    expect(output.validation.overallStatus).toBe("approved");
    expect(output.validation.allRolesSeniorityConsistent).toBe(false);
    expect(output.validation.leadershipCoverage).toBe(false);
  });

  it("rejects weak ATS language and missing measurable impact", async () => {
    const fixture = await createValidationFixture();
    const target = fixture.bullets[0];
    if (!target) throw new Error("Fixture requires one bullet.");
    const corrupted = fixture.bullets.map((bullet, index) =>
      index === 0
        ? {
            ...bullet,
            finalBullet:
              "Responsible for various machine learning tasks using Docker and Kubernetes.",
          }
        : bullet,
    );

    const output = await fixture.experienceValidator.execute({
      ...validationInput(fixture),
      bullets: corrupted,
    });
    const diagnostic = output.validation.diagnostics.find(
      (item) => item.bulletId === target.bulletId,
    );

    expect(output.validation.overallStatus).toBe("rejected");
    expect(diagnostic?.regenerationReasons).toContain("missing-metric");
    expect(
      diagnostic?.regenerationReasons.some((reason) =>
        ["weak-language", "ats-language"].includes(reason),
      ),
    ).toBe(true);
  });

  it("does not mutate any generation artifact", async () => {
    const fixture = await createValidationFixture();
    const input = validationInput(fixture);
    const snapshot = structuredClone(input);
    await fixture.experienceValidator.execute(input);
    expect(input).toEqual(snapshot);
  });

  it("rejects a context belonging to another JD", async () => {
    const fixture = await createValidationFixture();
    const otherJd = createJobDescription(
      "Senior Data Engineer. Build cloud data platforms and collaborate with analytics stakeholders.",
    );
    await expect(
      fixture.experienceValidator.execute({
        ...validationInput(fixture),
        context: createGenerationContext("PROFILE-VALIDATION", otherJd),
      }),
    ).rejects.toThrow(/does not match the supplied JD/);
  });
});

describe("Selective bullet regeneration", () => {
  it("regenerates only the failed bullet and preserves every approved bullet unchanged", async () => {
    const fixture = await createValidationFixture(
      "Senior Data Engineer. Architect cloud data platforms on AWS. Build scalable ETL pipelines using Spark and Airflow. Optimize Snowflake performance. Monitor data quality. Collaborate with analytics and product stakeholders. Lead data architecture decisions. Improve delivery reliability.",
    );
    const first = fixture.bullets[0];
    const second = fixture.bullets[1];
    if (!first || !second) throw new Error("Fixture requires two bullets.");
    const corrupted = fixture.bullets.map((bullet, index) =>
      index === 1
        ? {
            ...bullet,
            actionVerb: first.actionVerb,
            finalBullet: first.finalBullet,
          }
        : bullet,
    );
    const initialValidation = await fixture.experienceValidator.execute({
      ...validationInput(fixture),
      bullets: corrupted,
    });

    const output = await new RealSelectiveRegenerationController().execute(
      {
        ...validationInput(fixture),
        bullets: corrupted,
        validationOutput: initialValidation,
      },
      {
        keywordAllocator: fixture.keywordAllocator,
        starGenerator: fixture.starGenerator,
        bulletComposer: fixture.bulletComposer,
        experienceValidator: fixture.experienceValidator,
      },
    );

    expect(output.validationOutput.validation.overallStatus).toBe("approved");
    expect(output.validationOutput.validation.regeneration?.attempts).toBe(1);
    expect(
      output.validationOutput.validation.regeneration?.regeneratedBulletIds,
    ).toEqual([second.bulletId]);
    expect(output.bullets[0]?.finalBullet).toBe(corrupted[0]?.finalBullet);
    expect(output.bullets[1]?.finalBullet).not.toBe(corrupted[1]?.finalBullet);
    for (let index = 2; index < corrupted.length; index += 1) {
      expect(output.bullets[index]?.finalBullet).toBe(
        corrupted[index]?.finalBullet,
      );
    }
  });
});

describe("Milestone 8 integration", () => {
  it("runs the complete real Experience Engine through global validation", async () => {
    const jobDescription = createJobDescription(
      "Senior Data Engineer role. Build scalable data pipelines using Spark and Airflow. Develop ETL workflows on AWS. Optimize Snowflake warehouse performance. Monitor data quality. Collaborate with analytics and product stakeholders. Lead data architecture decisions. Improve delivery reliability.",
    );
    const input: ExperienceEngineInput = {
      context: createGenerationContext("PROFILE-M8", jobDescription),
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

    const result = await createMilestone8ExperienceEngine({
      role: { referenceDate: REFERENCE_DATE },
    }).execute(input);

    expect(result.engineVersion).toBe("0.8.0");
    expect(result.status).toBe("approved");
    expect(result.experiences[0]?.bullets.length).toBeGreaterThanOrEqual(5);
    expect(result.validation.overallStatus).toBe("approved");
    expect(result.validation.failedBulletIds).toEqual([]);
    expect(result.validation.allBulletsStrong).toBe(true);
  });

  it("keeps simultaneous fully validated JD runs independent", async () => {
    const firstJd = createJobDescription(
      "Senior Machine Learning Engineer. Deploy models using Docker and Kubernetes. Monitor models with MLflow and Prometheus. Optimize inference latency. Build data pipelines with Airflow. Collaborate with product stakeholders. Lead architecture decisions.",
    );
    const secondJd = createJobDescription(
      "Senior Cybersecurity Engineer. Design cloud security controls on AWS. Automate threat detection using SIEM and Python. Improve incident response. Collaborate with compliance stakeholders. Lead security architecture reviews.",
    );
    const engine = createMilestone8ExperienceEngine({
      role: { referenceDate: REFERENCE_DATE },
    });
    const [first, second] = await Promise.all([
      engine.execute({
        context: createGenerationContext("PROFILE-A", firstJd),
        jobDescription: firstJd,
        careerHistory: [
          {
            experienceId: "EXP-A",
            companyName: "AI Co",
            startDate: "2021-01",
            endDate: "Present",
          },
        ],
      }),
      engine.execute({
        context: createGenerationContext("PROFILE-B", secondJd),
        jobDescription: secondJd,
        careerHistory: [
          {
            experienceId: "EXP-B",
            companyName: "Security Co",
            startDate: "2021-01",
            endDate: "Present",
          },
        ],
      }),
    ]);

    const firstText = first.experiences.flatMap((item) => item.bullets).map((item) => item.finalBullet).join(" ");
    const secondText = second.experiences.flatMap((item) => item.bullets).map((item) => item.finalBullet).join(" ");
    expect(first.context.generationId).not.toBe(second.context.generationId);
    expect(first.context.jdHash).not.toBe(second.context.jdHash);
    expect(firstText).toMatch(/Docker|Kubernetes|MLflow|Prometheus/i);
    expect(firstText).not.toMatch(/SIEM/i);
    expect(secondText).toMatch(/AWS|SIEM|threat|security/i);
    expect(secondText).not.toMatch(/MLflow|Prometheus/i);
  });
});
