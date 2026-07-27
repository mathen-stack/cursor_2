import { describe, expect, it } from "vitest";
import { createGenerationContext, createJobDescription } from "@resume/core";
import {
  createProductionExperienceEngine,
  RuleBasedRequirementModel,
} from "@resume/engines";

const REFERENCE_DATE = new Date("2026-07-27T00:00:00.000Z");

describe("document-wide visible phrase uniqueness", () => {
  it("does not clone business-impact or dimension-label phrases across roles", async () => {
    const jobDescription = createJobDescription(
      `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments.
Implement model monitoring, improve inference performance, and automate CI/CD workflows.
Collaborate with product, data, and platform teams to translate business requirements into technical solutions.
Mentor engineers and communicate architecture decisions to technical and non-technical stakeholders.
Experience with Python, Docker, Kubernetes, MLflow, AWS, and distributed systems is required.`,
    );
    const result = await createProductionExperienceEngine({
      referenceDate: REFERENCE_DATE,
      requirementModel: new RuleBasedRequirementModel(),
    }).engine.execute({
      context: createGenerationContext("PROFILE-PHRASE", jobDescription),
      jobDescription,
      careerHistory: [
        {
          experienceId: "EXP-001",
          companyName: "Example AI Company",
          startDate: "2022-01",
          endDate: "Present",
        },
        {
          experienceId: "EXP-002",
          companyName: "Example Software Company",
          startDate: "2018-03",
          endDate: "2021-12",
        },
        {
          experienceId: "EXP-003",
          companyName: "Ex Com",
          startDate: "2017-05",
          endDate: "2018-02",
        },
      ],
    });

    expect(result.status).toBe("approved");
    const bullets = result.experiences.flatMap((experience) =>
      experience.bullets.map((bullet) => bullet.finalBullet),
    );

    expect(
      bullets.some((bullet) =>
        /cross[- ]functional alignment through/i.test(bullet),
      ),
    ).toBe(false);
    expect(
      bullets.some((bullet) => /reliability observability through/i.test(bullet)),
    ).toBe(false);
    expect(
      bullets.filter((bullet) =>
        /customer disruption and operational/i.test(bullet),
      ),
    ).toHaveLength(1);

    // Long JD noun phrases must not be pasted into every bullet after direct
    // keyword inventory is exhausted.
    expect(
      bullets.filter((bullet) =>
        /scalable machine learning models in production/i.test(bullet),
      ).length,
    ).toBeLessThanOrEqual(1);
    expect(
      bullets.filter((bullet) =>
        /stakeholder alignment and delivery coordination required/i.test(bullet),
      ),
    ).toHaveLength(0);
    // Composition must keep communication coverage (no soft-reject / throw).
    expect(result.status).toBe("approved");
    expect(
      result.experiences.every((experience) =>
        experience.bullets.some((bullet) =>
          /stakeholder|cross-functional|product|business|alignment|requirements|team/i.test(
            bullet.finalBullet,
          ),
        ),
      ),
    ).toBe(true);

    const businessClosings = bullets
      .map((bullet) => {
        const match = bullet.match(
          /\b(?:reducing|reduced|to reduce|improving|improved|enabling|while)\s+([^.]{20,120})\.?$/i,
        );
        return match?.[1]?.toLocaleLowerCase().trim();
      })
      .filter((value): value is string => Boolean(value));
    expect(new Set(businessClosings).size).toBe(businessClosings.length);
  });
});
