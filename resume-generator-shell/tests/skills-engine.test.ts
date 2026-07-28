import { describe, expect, it } from "vitest";
import {
  createGenerationContext,
  createJobDescription,
} from "@resume/core";
import { createProductionSkillsEngine } from "@resume/engines";
import type { SkillsEngineInput, UserProfile } from "@resume/contracts";

const ML_JD = `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments.
Implement model monitoring, improve inference performance, and automate CI/CD workflows.
Collaborate with product, data, and platform teams to translate business requirements into technical solutions.
Mentor engineers and communicate architecture decisions to technical and non-technical stakeholders.
Experience with Python, Docker, Kubernetes, MLflow, AWS, PyTorch, and distributed systems is required.`;

const DATA_JD = `Senior Data Engineer
Design batch and streaming data pipelines and improve data quality.
Build cloud data platforms using Python, SQL, Apache Spark, Airflow, Kafka, Snowflake, and dbt.
Partner with analytics stakeholders and document technical decisions.
Experience delivering reliable production systems on GCP is required.`;

function profile(profileId: string): UserProfile {
  return {
    profileId,
    personalInformation: {
      fullName: "Test User",
      email: "test@example.com",
      phone: "+1 555 0100",
      location: "Remote",
    },
    careerHistory: [
      {
        experienceId: "EXP-001",
        companyName: "Example Company",
        startDate: "2022-01",
        endDate: "Present",
      },
    ],
    education: [],
  };
}

function input(jdText: string, suffix: string): SkillsEngineInput {
  const jobDescription = createJobDescription(jdText);
  const userProfile = profile(`PROFILE-${suffix}`);
  return {
    context: createGenerationContext(userProfile.profileId, jobDescription),
    jobDescription,
    profile: userProfile,
  };
}

describe("production Skills Engine", () => {
  it("extracts, categorizes, ranks, and validates explicit JD skills", async () => {
    const output = await createProductionSkillsEngine().execute(input(ML_JD, "ML"));

    expect(output.status).toBe("approved");
    expect(output.skills.length).toBeGreaterThanOrEqual(6);
    expect(output.skills.some((skill) => skill.name === "Python")).toBe(true);
    expect(output.skills.some((skill) => skill.name === "Kubernetes")).toBe(true);
    expect(output.skills.some((skill) => skill.name === "MLflow")).toBe(true);
    expect(output.categories.some((category) => category.name === "MLOps & Model Operations")).toBe(true);
    expect(output.validation.explicitSkillsCovered).toBe(true);
    expect(output.validation.noDuplicateSkills).toBe(true);
  });

  it("adds only grounded supporting skills", async () => {
    const output = await createProductionSkillsEngine().execute(input(ML_JD, "INF"));
    const inferred = output.skills.filter((skill) => skill.source === "inferred");

    expect(inferred.length).toBeGreaterThan(0);
    expect(inferred.every((skill) => skill.inferredFrom.length > 0)).toBe(true);
    expect(inferred.some((skill) => skill.name === "Container Orchestration")).toBe(true);
    expect(output.validation.inferredSkillsGrounded).toBe(true);
  });

  it("normalizes aliases and removes duplicates", async () => {
    const duplicateJd = `Backend Engineer
Build services with PostgreSQL and Postgres, Kubernetes and K8s, and continuous integration through CI/CD.
Python and REST APIs are required for production delivery.`;
    const output = await createProductionSkillsEngine().execute(input(duplicateJd, "ALIAS"));

    expect(output.skills.filter((skill) => skill.name === "PostgreSQL")).toHaveLength(1);
    expect(output.skills.filter((skill) => skill.name === "Kubernetes")).toHaveLength(1);
    expect(output.validation.noDuplicateSkills).toBe(true);
  });

  it("does not invent unrelated technologies", async () => {
    const output = await createProductionSkillsEngine().execute(input(DATA_JD, "DATA"));
    const names = new Set(output.skills.map((skill) => skill.name));

    expect(names.has("Apache Spark")).toBe(true);
    expect(names.has("Apache Kafka")).toBe(true);
    expect(names.has("Kubernetes")).toBe(false);
    expect(names.has("PyTorch")).toBe(false);
  });

  it("keeps simultaneous JD runs isolated", async () => {
    const engine = createProductionSkillsEngine();
    const [ml, data] = await Promise.all([
      engine.execute(input(ML_JD, "A")),
      engine.execute(input(DATA_JD, "B")),
    ]);

    expect(ml.context.generationId).not.toBe(data.context.generationId);
    expect(ml.context.jdHash).not.toBe(data.context.jdHash);
    expect(ml.skills.map((skill) => skill.normalizedKey)).not.toEqual(
      data.skills.map((skill) => skill.normalizedKey),
    );
  });

  it("rejects a context that belongs to another profile or JD", async () => {
    const validInput = input(ML_JD, "VALID");
    const invalidInput: SkillsEngineInput = {
      ...validInput,
      context: { ...validInput.context, profileId: "PROFILE-OTHER" },
    };

    await expect(createProductionSkillsEngine().execute(invalidInput)).rejects.toThrow(
      /does not match the supplied JD and profile/,
    );
  });

  it("does not mutate the JD or profile input", async () => {
    const engineInput = input(ML_JD, "IMMUTABLE");
    const before = JSON.stringify(engineInput);
    await createProductionSkillsEngine().execute(engineInput);
    expect(JSON.stringify(engineInput)).toBe(before);
  });

  it("prioritizes JD skills evidenced by experience bullet keywords", async () => {
    const withEvidence = await createProductionSkillsEngine().execute({
      ...input(ML_JD, "EVIDENCED"),
      experienceKeywordHints: [
        "Python",
        "Kubernetes",
        "MLflow",
        "Docker",
        "model monitoring",
      ],
    });
    const withoutEvidence = await createProductionSkillsEngine().execute(
      input(ML_JD, "BASELINE"),
    );

    expect(withEvidence.status).toBe("approved");
    expect(withEvidence.validation.experienceEvidencedSkillCount).toBeGreaterThan(0);
    expect(
      withEvidence.skills.some(
        (skill) => skill.name === "Python" && skill.evidencedInExperience,
      ),
    ).toBe(true);
    expect(
      withEvidence.skills.some(
        (skill) => skill.name === "Kubernetes" && skill.evidencedInExperience,
      ),
    ).toBe(true);

    // Experience-evidenced skills appear earlier within their categories.
    const programming = withEvidence.categories.find(
      (category) => category.name === "Programming Languages",
    );
    expect(programming?.skills[0]).toBe("Python");

    // Still JD-grounded: hints cannot invent unrelated stack items.
    expect(withEvidence.skills.some((skill) => skill.name === "Terraform")).toBe(
      false,
    );
    expect(withoutEvidence.validation.experienceEvidencedSkillCount).toBe(0);
  });

  it("surfaces relevant SAMPLE_JD keywords in the Skills section", async () => {
    const output = await createProductionSkillsEngine().execute(input(ML_JD, "RELEVANT"));
    const names = new Set(output.skills.map((skill) => skill.name));

    expect(output.status).toBe("approved");
    for (const required of [
      "Python",
      "Docker",
      "Kubernetes",
      "MLflow",
      "AWS",
      "Machine Learning",
      "Model Monitoring",
      "CI/CD",
      "Distributed Systems",
      "Model Serving",
      "Model Deployment",
      "Technical Leadership",
      "Stakeholder Management",
      "Performance Optimization",
    ]) {
      expect(names.has(required)).toBe(true);
    }
  });

  it("keeps bare CSS when Tailwind CSS and CSS Modules are also required", async () => {
    const frontendJd = `Senior Frontend Engineer
Build user interfaces with React, TypeScript, and CSS.
Implement layouts with Tailwind CSS and CSS Modules.
Collaborate with product teams on delivery.
Experience with CSS, HTML, and JavaScript is required.
Mentor engineers and communicate architecture decisions.
Optimize performance and accessibility across web apps.`;
    const output = await createProductionSkillsEngine().execute(
      input(frontendJd, "CSS-KEEP"),
    );
    const names = new Set(output.skills.map((skill) => skill.name));

    expect(output.status).toBe("approved");
    expect(names.has("CSS")).toBe(true);
    expect(names.has("Tailwind CSS")).toBe(true);
    expect(names.has("CSS Modules")).toBe(true);
    expect(output.validation.explicitSkillsCovered).toBe(true);
  });

  it("fills sparse Java/Spring/SQL JDs to the minimum skill density", async () => {
    const sparseJd = `Java developer needed. Spring Boot and SQL are required for backend services.
Build and maintain production APIs with strong engineering standards.`;
    const output = await createProductionSkillsEngine().execute(
      input(sparseJd, "SPARSE-SPRING"),
    );
    const names = new Set(output.skills.map((skill) => skill.name));

    expect(output.status).toBe("approved");
    expect(output.skills.length).toBeGreaterThanOrEqual(6);
    expect(names.has("Java")).toBe(true);
    expect(names.has("Spring Boot")).toBe(true);
    expect(names.has("SQL")).toBe(true);
    expect(output.validation.skillDensityApproved).toBe(true);
    expect(output.validation.inferredSkillsGrounded).toBe(true);
  });
});
