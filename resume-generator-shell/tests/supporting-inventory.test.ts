import { describe, expect, it } from "vitest";
import { createGenerationContext, createJobDescription } from "@resume/core";
import {
  createProductionExperienceEngine,
  RuleBasedRequirementModel,
} from "@resume/engines";

describe("supporting keyword inventory", () => {
  it("allocates supporting keywords for multi-role dense resumes", async () => {
    const jobDescription = createJobDescription(
      `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments.
Implement model monitoring, improve inference performance, and automate CI/CD workflows.
Collaborate with product, data, and platform teams to translate business requirements into technical solutions.
Mentor engineers and communicate architecture decisions to technical and non-technical stakeholders.
Lead technical strategy and improve customer-facing AI reliability.
Experience with Python, Docker, Kubernetes, MLflow, AWS, and distributed systems is required.`,
    );
    const result = await createProductionExperienceEngine({
      referenceDate: new Date("2026-07-27T00:00:00.000Z"),
      requirementModel: new RuleBasedRequirementModel(),
    }).engine.execute({
      context: createGenerationContext("PROFILE-SUPPORT", jobDescription),
      jobDescription,
      careerHistory: [
        { experienceId: "EXP-001", companyName: "A", startDate: "2022-01", endDate: "Present" },
        { experienceId: "EXP-002", companyName: "B", startDate: "2018-03", endDate: "2021-12" },
        { experienceId: "EXP-003", companyName: "C", startDate: "2017-05", endDate: "2018-02" },
      ],
    });

    expect(result.status).toBe("approved");
    for (const experience of result.experiences) {
      for (const bullet of experience.bullets) {
        expect(bullet.supportingKeywords.length).toBeGreaterThanOrEqual(1);
      }
    }
    const allSupporting = result.experiences.flatMap((experience) =>
      experience.bullets.flatMap((bullet) => bullet.supportingKeywords),
    );
    expect(new Set(allSupporting.map((value) => value.toLocaleLowerCase())).size).toBe(
      allSupporting.length,
    );
  });
});
