import { describe, expect, it } from "vitest";
import type { UserProfile } from "@resume/contracts";
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
} from "@resume/engines";

const ML_JD = `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments.
Implement model monitoring, improve inference performance, and automate CI/CD workflows.
Collaborate with product, data, and platform teams to translate business requirements into technical solutions.
Mentor engineers and communicate architecture decisions to technical and non-technical stakeholders.
Experience with Python, Docker, Kubernetes, MLflow, AWS, and distributed systems is required.`;

const DATA_JD = `Senior Data Engineer
Design reliable batch and streaming data pipelines for analytics products.
Use Python, SQL, Spark, Airflow, Kafka, Snowflake, dbt, and AWS.
Improve data quality, reduce pipeline latency, and partner with analytics stakeholders.`;

function profile(profileId: string): UserProfile {
  return {
    profileId,
    personalInformation: {
      fullName: "Test User",
      email: "test@example.com",
      phone: "+1 555 0100",
      location: "Remote",
      linkedin: "https://www.linkedin.com/in/test-user",
    },
    careerHistory: [
      {
        experienceId: "EXP-001",
        companyName: "Current Company",
        startDate: "2022-01",
        endDate: "Present",
      },
      {
        experienceId: "EXP-002",
        companyName: "Previous Company",
        startDate: "2018-01",
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
  };
}

function orchestrator(): ResumeOrchestrator {
  const experience = createProductionExperienceEngine().engine;
  return new ResumeOrchestrator(
    {
      experience,
      summary: createProductionSummaryEngine(),
      skills: createProductionSkillsEngine(),
      template: createProductionTemplateEngine(),
    },
    new ImmutableFinalResumeAssembler(),
  );
}

describe("final resume orchestration and immutable assembly", () => {
  it("combines approved engine outputs without rewriting them", async () => {
    const userProfile = profile("PROFILE-FINAL");
    const jobDescription = createJobDescription(ML_JD);
    const output = await orchestrator().generate({
      jobDescription,
      profile: userProfile,
      locale: "en-US",
    });

    expect(output.assemblyValidation.overallStatus).toBe("approved");
    expect(output.document.sectionOrder).toEqual(output.template.template.sectionOrder);
    expect(output.document.sections.map((section) => section.id)).toEqual(
      output.template.template.sectionOrder,
    );

    const summarySection = output.document.sections.find(
      (section) => section.id === "professional-summary",
    );
    expect(summarySection?.id === "professional-summary" && summarySection.content).toBe(
      output.summary.summary,
    );

    const skillsSection = output.document.sections.find(
      (section) => section.id === "skills",
    );
    expect(skillsSection?.id === "skills" ? skillsSection.content : null).toEqual(
      output.skills.categories,
    );

    const experienceSection = output.document.sections.find(
      (section) => section.id === "professional-experience",
    );
    expect(
      experienceSection?.id === "professional-experience"
        ? experienceSection.content[0]?.bullets
        : null,
    ).toEqual(
      output.experience.experiences[0]?.bullets.map((bullet) => bullet.finalBullet),
    );
    expect(output.assemblyValidation.sourceOutputsUnmodified).toBe(true);
  });

  it("does not mutate the user profile or JD", async () => {
    const userProfile = profile("PROFILE-IMMUTABLE");
    const jobDescription = createJobDescription(ML_JD);
    const before = JSON.stringify({ userProfile, jobDescription });

    await orchestrator().generate({
      jobDescription,
      profile: userProfile,
      locale: "en-US",
    });

    expect(JSON.stringify({ userProfile, jobDescription })).toBe(before);
  });

  it("keeps concurrent JDs fully isolated", async () => {
    const engine = orchestrator();
    const [ml, data] = await Promise.all([
      engine.generate({
        jobDescription: createJobDescription(ML_JD),
        profile: profile("PROFILE-ML"),
        locale: "en-US",
      }),
      engine.generate({
        jobDescription: createJobDescription(DATA_JD),
        profile: profile("PROFILE-DATA"),
        locale: "en-US",
      }),
    ]);

    expect(ml.context.generationId).not.toBe(data.context.generationId);
    expect(ml.context.jdHash).not.toBe(data.context.jdHash);
    expect(ml.document.contentFingerprint).not.toBe(data.document.contentFingerprint);
    expect(ml.summary.targetRole.title).not.toBe(data.summary.targetRole.title);
  });

  it("rejects source outputs carrying another generation context", async () => {
    const userProfile = profile("PROFILE-MISMATCH");
    const jd = createJobDescription(ML_JD);
    const context = createGenerationContext(userProfile.profileId, jd);
    const experience = await createProductionExperienceEngine().engine.execute({
      context,
      jobDescription: jd,
      careerHistory: userProfile.careerHistory,
    });
    const summary = await createProductionSummaryEngine().execute({
      context,
      jobDescription: jd,
      profile: userProfile,
    });
    const skills = await createProductionSkillsEngine().execute({
      context,
      jobDescription: jd,
      profile: userProfile,
    });
    const template = await createProductionTemplateEngine().execute({
      context,
      jobDescription: jd,
      profile: userProfile,
    });

    const wrongSummary = {
      ...summary,
      context: { ...summary.context, generationId: "GEN-OTHER" },
    };
    expect(() =>
      new ImmutableFinalResumeAssembler().assemble({
        context,
        jobDescription: jd,
        profile: userProfile,
        summary: wrongSummary,
        skills,
        experience,
        template,
        orchestration: {
          startedAt: context.createdAt,
          finishedAt: context.createdAt,
          totalDurationMs: 0,
          engines: [],
        },
      }),
    ).toThrow(/Final resume assembly rejected/);
  });
});
