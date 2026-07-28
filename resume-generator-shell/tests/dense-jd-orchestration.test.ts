import { describe, expect, it } from "vitest";
import {
  ImmutableFinalResumeAssembler,
  ResumeOrchestrator,
  createGenerationContext,
  createJobDescription,
} from "@resume/core";
import {
  createProductionExperienceEngine,
  createProductionSkillsEngine,
  createProductionSummaryEngine,
  createProductionTemplateEngine,
  RuleBasedRequirementModel,
  cleanScope,
  substantiveKeyword,
} from "@resume/engines";

const REFERENCE_DATE = new Date("2026-07-27T00:00:00.000Z");

const jdText = `Senior Data Engineer

About the role:
We are looking for a Senior Data Engineer to build and operate large-scale data platforms.

Responsibilities:
- Design scalable data architecture for analytics and ML workloads
- Build reliable ETL and ELT pipelines using Spark and Airflow
- Deploy data services to production on Kubernetes
- Monitor pipeline health, SLAs, and data freshness
- Optimize warehouse query performance and cost
- Ensure data quality, lineage, and governance
- Implement security controls and access policies for sensitive datasets
- Collaborate with analytics, product, and platform stakeholders
- Lead technical strategy and mentor junior engineers
- Improve customer-facing reporting reliability and delivery speed
- Develop streaming ingestion with Kafka
- Create dimensional models and semantic layers
- Automate CI/CD for data pipelines
- Manage cloud infrastructure on AWS
- Integrate third-party SaaS data sources
- Document data contracts and APIs
- Partner with security on compliance requirements
- Drive incident response for data outages
- Establish observability with metrics, logs, and traces
- Reduce pipeline latency for near-real-time use cases
- Support feature store pipelines for ML teams
- Own backfill and reprocessing workflows
- Enforce schema evolution best practices
- Build self-serve data products for analysts
- Coordinate cross-functional roadmap planning
- Evaluate new data tooling and platforms
- Maintain disaster recovery and backup strategies
- Tune Spark job resource utilization
- Implement idempotent pipeline patterns
- Validate data with automated tests
- Publish data quality dashboards
- Facilitate stakeholder demos and status updates
- Own end-to-end delivery of critical data products
- Scale storage and compute for seasonal peaks
- Mentor engineers on data engineering practices
- Write clear technical design documents

Requirements:
- 5+ years of data engineering experience
- Strong SQL and Python skills
- Experience with Spark, Airflow, Kafka, dbt
- Experience with Snowflake or BigQuery
- Kubernetes and Docker familiarity
- AWS cloud experience
`;

describe("experience approval after keyword scope fix", () => {
  it("keeps design documents as a noun phrase", () => {
    expect(cleanScope("design documents")).toBe("design documents");
    expect(substantiveKeyword("design documents")).toBe("design documents");
    expect(cleanScope("Build reliable data pipelines")).toBe("reliable data pipelines");
  });

  it("approves dense JD through production experience and orchestrator", async () => {
    const jobDescription = createJobDescription(jdText);
    const experienceBundle = createProductionExperienceEngine({
      referenceDate: REFERENCE_DATE,
      requirementModel: new RuleBasedRequirementModel(),
    });

    const alone = await experienceBundle.engine.execute({
      context: createGenerationContext("PROFILE-DIAG", jobDescription),
      jobDescription,
      careerHistory: [
        { experienceId: "EXP-001", companyName: "Acme", startDate: "2022-01", endDate: "Present" },
        { experienceId: "EXP-002", companyName: "Beta", startDate: "2019-01", endDate: "2021-12" },
      ],
    });
    expect(alone.status).toBe("approved");

    const resume = await new ResumeOrchestrator(
      {
        experience: experienceBundle.engine,
        summary: createProductionSummaryEngine(),
        skills: createProductionSkillsEngine(),
        template: createProductionTemplateEngine(),
      },
      new ImmutableFinalResumeAssembler(),
    ).generate({
      profile: {
        profileId: "PROFILE-DIAG",
        personalInformation: {
          fullName: "Alex Morgan",
          email: "alex@example.com",
          phone: "+1 555 0100",
          location: "Remote",
        },
        careerHistory: [
          { experienceId: "EXP-001", companyName: "Acme", startDate: "2022-01", endDate: "Present" },
          { experienceId: "EXP-002", companyName: "Beta", startDate: "2019-01", endDate: "2021-12" },
        ],
        education: [
          {
            educationId: "EDU-001",
            institution: "Uni",
            degree: "BS",
            field: "CS",
            startDate: "2014-09",
            endDate: "2018-06",
          },
        ],
      },
      jobDescription,
      locale: "en-US",
    });

    expect(resume.experience.status).toBe("approved");
  });
});
