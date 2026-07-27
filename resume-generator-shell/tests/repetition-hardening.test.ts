import { describe, expect, it } from "vitest";
import { createGenerationContext, createJobDescription } from "@resume/core";
import {
  createProductionExperienceEngine,
  normalizeBulletSentence,
  stripIntraBulletRepetition,
} from "@resume/engines";

const REFERENCE_DATE = new Date("2026-07-27T00:00:00.000Z");

describe("repetition hardening", () => {
  it("removes within-bullet verb and measure echoes", () => {
    expect(
      stripIntraBulletRepetition(
        "Coordinated stakeholder alignment and delivery coordination through dependency coordination",
      ),
    ).not.toMatch(/\bcoordination\b/i);
    expect(
      stripIntraBulletRepetition(
        "Automated stakeholder alignment and delivery coordination through shared roadmap reviews",
      ),
    ).toMatch(/cross-functional/i);

    expect(
      normalizeBulletSentence(
        "Accelerated backend services, increasing throughput by 2.6x and improving request throughput",
      ),
    ).not.toMatch(/throughput.*throughput/i);
  });

  it("does not repeat feature-adoption metrics or cloned stakeholder scopes across roles", async () => {
    const jobDescription = createJobDescription(
      `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments.
Implement model monitoring, improve inference performance, and automate CI/CD workflows.
Collaborate with product, data, and platform teams to translate business requirements into technical solutions.
Mentor engineers and communicate architecture decisions to technical and non-technical stakeholders.
Experience with Python, Docker, Kubernetes, MLflow, AWS, and distributed systems is required.`,
    );
    const result = await createProductionExperienceEngine({
      role: { referenceDate: REFERENCE_DATE },
    }).engine.execute({
      context: createGenerationContext("PROFILE-REPETITION", jobDescription),
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
          companyName: "Company",
          startDate: "2017-08",
          endDate: "2018-02",
        },
      ],
    });

    expect(result.status).toBe("approved");
    const bullets = result.experiences.flatMap((experience) =>
      experience.bullets.map((bullet) => bullet.finalBullet),
    );

    const featureAdoption = bullets.filter((bullet) =>
      /feature adoption/i.test(bullet),
    );
    expect(featureAdoption.length).toBeLessThanOrEqual(1);

    const stakeholderScope = bullets.filter((bullet) =>
      /stakeholder alignment and delivery coordination/i.test(bullet),
    );
    expect(stakeholderScope.length).toBeLessThanOrEqual(1);

    for (const bullet of bullets) {
      expect(bullet).not.toMatch(/\bCoordinat\w*\b.*\bcoordination\b/i);
      expect(bullet).not.toMatch(/\bthroughput\b.*\bthroughput\b/i);
    }
  });
});
