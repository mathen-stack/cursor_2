import { describe, expect, it } from "vitest";
import { createGenerationContext, createJobDescription } from "@resume/core";
import {
  createProductionExperienceEngine,
  RuleBasedRequirementModel,
} from "@resume/engines";

const REFERENCE_DATE = new Date("2026-07-27T00:00:00.000Z");

const jdWithFirstPerson = `About the role
We are looking for a Senior Data Engineer to join our team and help us scale our data platform.

Responsibilities:
- Design and build our scalable data architecture
- Develop our ETL pipelines using Spark and Airflow
- Deploy our data services to production
- Monitor our pipeline health and SLAs
- Optimize our warehouse performance
- Collaborate with our analytics and product stakeholders
- Lead our technical strategy and mentor engineers
- Improve our customer-facing reporting reliability
- Build streaming ingestion with Kafka
- Ensure our data quality and governance
- Implement security controls for our sensitive datasets
- Automate CI/CD for our data pipelines

Requirements:
- 5+ years of experience
- Strong SQL and Python
- Spark, Airflow, Kafka, dbt
- Snowflake or BigQuery
- Kubernetes and Docker
- AWS experience
`;

describe("first-person JD wording composition", () => {
  it("strips JD first-person pronouns and still approves production generation", async () => {
    const jobDescription = createJobDescription(jdWithFirstPerson);
    const context = createGenerationContext("PROFILE-OUR", jobDescription);
    const careerHistory = [
      {
        experienceId: "EXP-001",
        companyName: "Acme",
        startDate: "2022-01",
        endDate: "Present",
      },
      {
        experienceId: "EXP-002",
        companyName: "Beta",
        startDate: "2019-01",
        endDate: "2021-12",
      },
    ];

    const result = await createProductionExperienceEngine({
      referenceDate: REFERENCE_DATE,
      requirementModel: new RuleBasedRequirementModel(),
    }).engine.execute({ context, jobDescription, careerHistory });

    expect(result.status).toBe("approved");
    for (const experience of result.experiences) {
      for (const bullet of experience.bullets) {
        expect(bullet.finalBullet).not.toMatch(/\b(?:I|me|my|mine|we|us|our|ours)\b/i);
      }
    }
  });
});
