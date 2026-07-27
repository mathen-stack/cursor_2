import { describe, expect, it } from "vitest";
import {
  ImmutableFinalResumeAssembler,
  ResumeOrchestrator,
  createJobDescription,
} from "@resume/core";
import {
  ROLE_DEFINITIONS,
  SKILL_CATEGORY_ORDER,
  STACK_DEFINITIONS,
  analyzeTargetRole,
  createProductionExperienceEngine,
  createProductionSkillsEngine,
  createProductionSummaryEngine,
  createProductionTemplateEngine,
  detectEngineeringStacks,
  stackIdForRoleFamily,
} from "@resume/engines";

const REFERENCE_DATE = new Date("2026-07-27T00:00:00.000Z");

const STACK_JD_FIXTURES: ReadonlyArray<{
  stackId: string;
  roleFamily: string;
  jd: string;
}> = [
  {
    stackId: "ai-ml",
    roleFamily: "machine-learning",
    jd: `Senior Machine Learning Engineer
Build and deploy scalable machine learning models with PyTorch and MLflow.
Implement model monitoring and MLOps workflows in Kubernetes.`,
  },
  {
    stackId: "backend",
    roleFamily: "backend-engineering",
    jd: `Senior Backend Engineer
Design microservices and REST APIs with Java and Spring Boot.
Improve distributed systems reliability and PostgreSQL query performance.`,
  },
  {
    stackId: "frontend",
    roleFamily: "frontend-engineering",
    jd: `Senior Frontend Engineer
Build user interfaces with React.js, Next.js, and TypeScript.
Improve web accessibility and front-end application performance.`,
  },
  {
    stackId: "full-stack",
    roleFamily: "full-stack-engineering",
    jd: `Senior Full Stack Engineer
Deliver frontend and backend features across end-to-end web applications.
Use React, Node.js, and PostgreSQL in production systems.`,
  },
  {
    stackId: "data-engineering",
    roleFamily: "data-engineering",
    jd: `Senior Data Engineer
Build data pipelines and ETL workflows with Spark, Airflow, and Kafka.
Improve data warehouse reliability on Snowflake.`,
  },
  {
    stackId: "data-science",
    roleFamily: "data-science",
    jd: `Senior Data Scientist
Build statistical modeling and predictive analytics solutions.
Run experimentation and A/B testing with Python and SQL.`,
  },
  {
    stackId: "cloud",
    roleFamily: "cloud-engineering",
    jd: `Senior Cloud Engineer
Design cloud infrastructure on AWS and GCP with Terraform.
Improve serverless reliability and cloud platform automation.`,
  },
  {
    stackId: "devops-platform",
    roleFamily: "devops-engineering",
    jd: `Senior DevOps Engineer
Build CI/CD pipelines, infrastructure as code, and observability.
Improve Kubernetes reliability and site reliability practices.`,
  },
  {
    stackId: "cybersecurity",
    roleFamily: "security-engineering",
    jd: `Senior Security Engineer
Lead application security, threat modeling, and vulnerability remediation.
Implement cybersecurity controls and secure software delivery.`,
  },
  {
    stackId: "mobile",
    roleFamily: "mobile-engineering",
    jd: `Senior Mobile Engineer
Build iOS and Android mobile applications with React Native and Kotlin.
Improve Swift/Flutter delivery quality for mobile application releases.`,
  },
  {
    stackId: "qa-test-automation",
    roleFamily: "qa-engineering",
    jd: `Senior QA Engineer
Design test strategy and implement test automation with Playwright and Selenium.
Improve quality assurance gates using Cypress and JUnit.`,
  },
  {
    stackId: "database",
    roleFamily: "database-engineering",
    jd: `Senior Database Engineer
Own schema design, query optimization, and database reliability for PostgreSQL.
Improve MySQL and Redis platform performance for production systems.`,
  },
  {
    stackId: "embedded",
    roleFamily: "embedded-engineering",
    jd: `Senior Embedded Systems Engineer
Build firmware and embedded systems on RTOS and microcontrollers.
Improve bare metal reliability and Embedded Linux device software.`,
  },
  {
    stackId: "blockchain",
    roleFamily: "blockchain-engineering",
    jd: `Senior Blockchain Engineer
Design smart contracts and blockchain platforms with Solidity and Ethereum.
Improve Web3 reliability using Hardhat and secure contract delivery.`,
  },
  {
    stackId: "general-software",
    roleFamily: "software-engineering",
    jd: `Senior Software Engineer
Build production systems and application development workflows.
Collaborate with product teams on reliable software engineering delivery.`,
  },
];

describe("multi-stack domain catalog", () => {
  it("keeps original AI/ML role families and extends with new stacks", () => {
    const families = new Set(ROLE_DEFINITIONS.map((item) => item.family));
    expect(families.has("machine-learning")).toBe(true);
    expect(families.has("generative-ai")).toBe(true);
    expect(families.has("mobile-engineering")).toBe(true);
    expect(families.has("qa-engineering")).toBe(true);
    expect(families.has("database-engineering")).toBe(true);
    expect(families.has("embedded-engineering")).toBe(true);
    expect(families.has("blockchain-engineering")).toBe(true);

    expect(SKILL_CATEGORY_ORDER).toContain("AI & Machine Learning");
    expect(SKILL_CATEGORY_ORDER).toContain("Mobile Development");
    expect(SKILL_CATEGORY_ORDER).toContain("QA & Test Automation");
    expect(SKILL_CATEGORY_ORDER).toContain("Embedded Systems");
    expect(SKILL_CATEGORY_ORDER).toContain("Blockchain");

    expect(STACK_DEFINITIONS.map((item) => item.stackId)).toEqual(
      expect.arrayContaining([
        "ai-ml",
        "backend",
        "frontend",
        "mobile",
        "qa-test-automation",
        "database",
        "embedded",
        "blockchain",
        "general-software",
      ]),
    );
  });

  it("detects the expected primary stack for each major software family", () => {
    for (const fixture of STACK_JD_FIXTURES) {
      const jobDescription = createJobDescription(fixture.jd);
      const stack = detectEngineeringStacks(jobDescription);
      expect(stack.primaryStack, fixture.jd).toBe(fixture.stackId);
      expect(stack.confidence).toBeGreaterThan(0.5);

      const role = analyzeTargetRole(jobDescription, []);
      expect(role.roleFamily, fixture.jd).toBe(fixture.roleFamily);
      expect(stackIdForRoleFamily(role.roleFamily)).toBe(fixture.stackId);
    }
  });

  it("attaches additive stackContext without breaking approved generation", async () => {
    const jobDescription = createJobDescription(STACK_JD_FIXTURES[1]!.jd);
    const resume = await new ResumeOrchestrator(
      {
        experience: createProductionExperienceEngine({
          role: { referenceDate: REFERENCE_DATE },
        }).engine,
        summary: createProductionSummaryEngine({
          experienceYears: { referenceDate: REFERENCE_DATE },
        }),
        skills: createProductionSkillsEngine(),
        template: createProductionTemplateEngine(),
      },
      new ImmutableFinalResumeAssembler(),
      undefined,
      detectEngineeringStacks,
    ).generate({
      jobDescription,
      profile: {
        profileId: "PROFILE-MULTI-STACK",
        personalInformation: {
          fullName: "Alex Morgan",
          email: "alex@example.com",
          phone: "+1 555 0100",
          location: "Remote",
        },
        careerHistory: [
          {
            experienceId: "EXP-001",
            companyName: "Example Software Company",
            startDate: "2022-01",
            endDate: "Present",
          },
          {
            experienceId: "EXP-002",
            companyName: "Example Platform Company",
            startDate: "2018-03",
            endDate: "2021-12",
          },
        ],
        education: [
          {
            educationId: "EDU-001",
            institution: "Example University",
            degree: "Bachelor of Science",
            field: "Computer Science",
            graduationDate: "2018",
          },
        ],
      },
      locale: "en-US",
    });

    expect(resume.assemblyValidation.overallStatus).toBe("approved");
    expect(resume.stackContext?.primaryStack).toBe("backend");
    expect(resume.experience.experiences[0]?.assignedRole).toMatch(/Backend Engineer/i);
    expect(resume.summary.summary).toMatch(/Backend/i);
  });
});
