import { describe, expect, it } from "vitest";
import type { TemplateEngineInput, UserProfile } from "@resume/contracts";
import { createGenerationContext, createJobDescription } from "@resume/core";
import { createProductionTemplateEngine } from "@resume/engines";

const ML_JD = `Senior Machine Learning Engineer
Build and deploy scalable machine learning systems in production.
Use Python, Docker, Kubernetes, MLflow, AWS, PyTorch, and CI/CD.
Implement model monitoring and improve inference reliability.
Collaborate with product, data, and platform stakeholders.`;

const UK_DATA_JD = `Senior Data Engineer - London, United Kingdom
Design reliable batch and streaming data pipelines.
Use Python, SQL, Apache Spark, Airflow, Kafka, Snowflake, dbt, and GCP.
Partner with analytics stakeholders and document architecture decisions.`;

function profile(
  profileId: string,
  careerCount = 1,
  educationCount = 1,
): UserProfile {
  return {
    profileId,
    personalInformation: {
      fullName: "Test User",
      email: "test@example.com",
      phone: "+1 555 0100",
      location: "Remote",
      linkedin: "https://www.linkedin.com/in/test-user",
    },
    careerHistory: Array.from({ length: careerCount }, (_, index) => ({
      experienceId: `EXP-${index + 1}`,
      companyName: `Company ${index + 1}`,
      startDate: `${2023 - index * 3}-01`,
      endDate: index === 0 ? "Present" : `${2022 - index * 3}-12`,
    })),
    education: Array.from({ length: educationCount }, (_, index) => ({
      educationId: `EDU-${index + 1}`,
      institution: `University ${index + 1}`,
      degree: "Bachelor of Science",
      field: "Computer Science",
      graduationDate: `${2018 - index}`,
    })),
  };
}

function input(
  jdText: string,
  suffix: string,
  careerCount = 1,
  educationCount = 1,
): TemplateEngineInput {
  const jobDescription = createJobDescription(jdText);
  const userProfile = profile(`PROFILE-${suffix}`, careerCount, educationCount);
  return {
    context: createGenerationContext(userProfile.profileId, jobDescription),
    jobDescription,
    profile: userProfile,
  };
}

describe("production Template Engine", () => {
  it("selects an approved ATS-safe single-column template", async () => {
    const output = await createProductionTemplateEngine().execute(input(ML_JD, "ATS"));

    expect(output.status).toBe("approved");
    expect(output.template.layout).toBe("single-column");
    expect(output.template.columns).toBe(1);
    expect(output.template.sectionOrder.slice(0, 4)).toEqual([
      "contact",
      "professional-summary",
      "skills",
      "professional-experience",
    ]);
    expect(output.template.atsSafeguards.usesTablesForCoreContent).toBe(false);
    expect(output.template.atsSafeguards.usesTextBoxes).toBe(false);
    expect(output.template.atsSafeguards.usesIcons).toBe(false);
    expect(output.template.atsSafeguards.coreContentInHeaderOrFooter).toBe(false);
    expect(output.validation.resumeWordedReadinessScore).toBeGreaterThanOrEqual(90);
  });

  it("uses one page for a focused one-role profile", async () => {
    const output = await createProductionTemplateEngine().execute(input(ML_JD, "ONE", 1));

    expect(output.template.pageTarget).toBe(1);
    expect(output.template.contentEstimate.estimatedBulletCount).toBe(6);
    expect(output.template.typography.bodySizePt).toBeGreaterThanOrEqual(10);
    expect(output.validation.contentFitApproved).toBe(true);
  });

  it("uses two pages for a multi-role profile with at least five bullets per role", async () => {
    const output = await createProductionTemplateEngine().execute(input(ML_JD, "MULTI", 3));

    expect(output.template.pageTarget).toBe(2);
    expect(output.template.contentEstimate.estimatedBulletCount).toBe(16);
    expect(output.validation.pageTargetApproved).toBe(true);
  });

  it("selects A4 only when the JD carries a European page-size signal", async () => {
    const uk = await createProductionTemplateEngine().execute(input(UK_DATA_JD, "UK"));
    const usDefault = await createProductionTemplateEngine().execute(input(ML_JD, "US"));

    expect(uk.template.pageSize).toBe("a4");
    expect(usDefault.template.pageSize).toBe("letter");
  });

  it("includes Education only when the profile contains education data", async () => {
    const withEducation = await createProductionTemplateEngine().execute(input(ML_JD, "EDU", 1, 1));
    const withoutEducation = await createProductionTemplateEngine().execute(input(ML_JD, "NOEDU", 1, 0));

    expect(withEducation.template.sectionOrder).toContain("education");
    expect(withoutEducation.template.sectionOrder).not.toContain("education");
  });

  it("returns a deterministic template definition for identical JD and profile content", async () => {
    const engine = createProductionTemplateEngine();
    const first = await engine.execute(input(ML_JD, "D1", 2));
    const second = await engine.execute(input(ML_JD, "D2", 2));

    expect(first.template).toEqual(second.template);
    expect(first.roleAnalysis).toEqual(second.roleAnalysis);
  });

  it("keeps simultaneous JD runs isolated", async () => {
    const engine = createProductionTemplateEngine();
    const [ml, data] = await Promise.all([
      engine.execute(input(ML_JD, "A", 1)),
      engine.execute(input(UK_DATA_JD, "B", 3)),
    ]);

    expect(ml.context.generationId).not.toBe(data.context.generationId);
    expect(ml.context.jdHash).not.toBe(data.context.jdHash);
    expect(ml.template.templateId).not.toBe(data.template.templateId);
    expect(ml.roleAnalysis.targetRole).not.toBe(data.roleAnalysis.targetRole);
  });

  it("rejects a context belonging to another profile", async () => {
    const valid = input(ML_JD, "VALID");
    const invalid: TemplateEngineInput = {
      ...valid,
      context: { ...valid.context, profileId: "PROFILE-OTHER" },
    };

    await expect(createProductionTemplateEngine().execute(invalid)).rejects.toThrow(
      /does not match the supplied JD and profile/,
    );
  });

  it("does not mutate the JD or profile input", async () => {
    const engineInput = input(ML_JD, "IMMUTABLE", 2);
    const before = JSON.stringify(engineInput);
    await createProductionTemplateEngine().execute(engineInput);
    expect(JSON.stringify(engineInput)).toBe(before);
  });
});
