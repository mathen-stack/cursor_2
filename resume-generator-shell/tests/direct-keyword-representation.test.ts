import { describe, expect, it } from "vitest";
import { createGenerationContext, createJobDescription } from "@resume/core";
import {
  RealBulletComposer,
  RealBulletPlanner,
  RealKeywordAllocator,
  RealRequirementExtractor,
  RealRoleAssignmentEngine,
  RealStarGenerator,
  RuleBasedRequirementModel,
  directKeywordRepresented,
} from "@resume/engines";

const REFERENCE_DATE = new Date("2026-07-27T00:00:00.000Z");

describe("direct JD keyword representation", () => {
  it("only claims direct keywords that appear in the composed bullet", async () => {
    const jobDescription = createJobDescription(
      `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments.
Implement model monitoring, improve inference performance, and automate CI/CD workflows.
Collaborate with product, data, and platform teams to translate business requirements into technical solutions.
Mentor engineers and communicate architecture decisions to technical and non-technical stakeholders.
Lead technical strategy and improve customer-facing AI reliability.
Experience with Python, Docker, Kubernetes, MLflow, AWS, and distributed systems is required.`,
    );
    const context = createGenerationContext("PROFILE-DIRECTS", jobDescription);
    const careerHistory = [
      {
        experienceId: "EXP-001",
        companyName: "Example AI",
        startDate: "2022-01",
        endDate: "Present",
      },
      {
        experienceId: "EXP-002",
        companyName: "Example Software",
        startDate: "2018-03",
        endDate: "2021-12",
      },
    ];
    const requirements = await new RealRequirementExtractor({
      model: new RuleBasedRequirementModel(),
    }).execute({ context, jobDescription });
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

    const output = await new RealBulletComposer().execute({
      context,
      jobDescription,
      plans: plans.plans,
      keywordPackages: keywords.packages,
      stories: stories.stories,
    });

    expect(output.validation?.overallStatus).toBe("approved");
    for (const bullet of output.bullets) {
      for (const keyword of bullet.directKeywords) {
        expect(directKeywordRepresented(bullet.finalBullet, keyword)).toBe(true);
      }
    }
  });
});
