import { describe, expect, it } from "vitest";
import {
  assertContextMatch,
  assertGenerationContextMatches,
  createGenerationContext,
  createJobDescription,
  ExperienceGenerationService,
  InMemoryExperienceGenerationRunStore,
  ImmutableFinalResumeAssembler,
  ResumeGenerationService,
  ResumeOrchestrator,
} from "@resume/core";
import {
  createProductionExperienceEngine,
  createProductionSkillsEngine,
  createProductionSummaryEngine,
  createProductionTemplateEngine,
} from "@resume/engines";
import { createLibreOfficeEnv } from "@resume/rendering";
import {
  SOFTWARE_MIND_SENIOR_FRONTEND_JD,
  softwareMindCareerProfile,
} from "./fixtures/software-mind-senior-frontend";

const REFERENCE_DATE = new Date("2026-07-27T00:00:00.000Z");

const ML_JD = `Senior Machine Learning Engineer.
Design scalable machine learning architecture.
Deploy machine learning models to production using Docker and Kubernetes.
Monitor model performance with MLflow and Prometheus.
Optimize inference latency and throughput.
Build reliable data pipelines with Airflow and Spark.
Collaborate with product and platform stakeholders.
Lead technical strategy and architecture decisions.`;

const FRONTEND_JD = SOFTWARE_MIND_SENIOR_FRONTEND_JD;

function orchestrator(): ResumeOrchestrator {
  return new ResumeOrchestrator(
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
  );
}

describe("production hardening isolation and security", () => {
  it("rejects empty and mismatched generation context identifiers", () => {
    const jd = createJobDescription(FRONTEND_JD);
    const expected = createGenerationContext("PROFILE-A", jd);
    const outputBase = {
      engineName: "test-engine",
      engineVersion: "0.1.0",
      status: "approved" as const,
    };

    expect(() =>
      assertGenerationContextMatches(expected, {
        ...outputBase,
        context: { ...expected, generationId: "" },
      }),
    ).toThrow(/missing or empty generationId/);

    expect(() =>
      assertContextMatch(expected, {
        ...outputBase,
        context: { ...expected, profileId: "   " },
      }),
    ).toThrow(/missing or empty profileId/);

    expect(() =>
      assertGenerationContextMatches(expected, {
        ...outputBase,
        context: { ...expected, jdId: "JD-OTHER" },
      }),
    ).toThrow(/Cross-JD or cross-run output rejected/);

    expect(() =>
      assertGenerationContextMatches(expected, {
        ...outputBase,
        context: { ...expected, jdHash: "stale-hash" },
      }),
    ).toThrow(/Cross-JD or cross-run output rejected/);
  });

  it("keeps two users with the same JD fully isolated", async () => {
    const jobDescription = createJobDescription(FRONTEND_JD);
    const profileA = softwareMindCareerProfile("PROFILE-USER-A");
    const profileB = softwareMindCareerProfile("PROFILE-USER-B");

    const [resumeA, resumeB] = await Promise.all([
      orchestrator().generate({ jobDescription, profile: profileA, locale: "en-US" }),
      orchestrator().generate({ jobDescription, profile: profileB, locale: "en-US" }),
    ]);

    expect(resumeA.context.generationId).not.toBe(resumeB.context.generationId);
    expect(resumeA.context.profileId).toBe("PROFILE-USER-A");
    expect(resumeB.context.profileId).toBe("PROFILE-USER-B");
    expect(resumeA.context.jdHash).toBe(resumeB.context.jdHash);
    expect(resumeA.document.contentFingerprint).not.toBe(
      resumeB.document.contentFingerprint,
    );
  });

  it("prevents cross-domain technology leakage under concurrent generations", async () => {
    const frontendJd = createJobDescription(FRONTEND_JD);
    const mlJd = createJobDescription(ML_JD);
    const profile = softwareMindCareerProfile("PROFILE-CROSS-DOMAIN");

    const [frontendResume, mlResume] = await Promise.all([
      orchestrator().generate({
        jobDescription: frontendJd,
        profile,
        locale: "en-US",
      }),
      orchestrator().generate({
        jobDescription: mlJd,
        profile,
        locale: "en-US",
      }),
    ]);

    const frontendText = [
      frontendResume.summary.summary,
      ...frontendResume.skills.skills.map((skill) => skill.name),
      ...frontendResume.experience.experiences.flatMap((experience) =>
        experience.bullets.map((bullet) => bullet.finalBullet),
      ),
    ].join("\n");

    const mlText = [
      mlResume.summary.summary,
      ...mlResume.skills.skills.map((skill) => skill.name),
      ...mlResume.experience.experiences.flatMap((experience) =>
        experience.bullets.map((bullet) => bullet.finalBullet),
      ),
    ].join("\n");

    expect(frontendText).not.toMatch(/\b(?:MLflow|Kubernetes|PyTorch|Airflow|Spark)\b/);
    expect(mlText).not.toMatch(/\b(?:React\.js|Next\.js|Tailwind CSS|DaisyUI|Cypress)\b/);
    expect(frontendResume.context.generationId).not.toBe(mlResume.context.generationId);
  });

  it("never mutates submitted generation input objects", async () => {
    const rawJd = FRONTEND_JD;
    const jobDescription = createJobDescription(rawJd);
    const profile = softwareMindCareerProfile("PROFILE-IMMUTABLE");
    const jdSnapshot = structuredClone(jobDescription);
    const profileSnapshot = structuredClone(profile);

    await orchestrator().generate({
      jobDescription,
      profile,
      locale: "en-US",
    });

    expect(jobDescription).toEqual(jdSnapshot);
    expect(profile).toEqual(profileSnapshot);
    expect(jobDescription.rawText).toBe(rawJd);
  });

  it("filters generation history by profileId", async () => {
    const store = new InMemoryExperienceGenerationRunStore();
    const bundle = createProductionExperienceEngine({
      role: { referenceDate: REFERENCE_DATE },
    });
    const service = new ExperienceGenerationService({
      engine: bundle.engine,
      store,
      providerName: bundle.providerName,
    });

    const careerHistory = softwareMindCareerProfile("PROFILE-A").careerHistory;
    await service.generate({
      profileId: "PROFILE-A",
      jobDescriptionText: FRONTEND_JD,
      careerHistory,
      locale: "en-US",
    });
    await service.generate({
      profileId: "PROFILE-B",
      jobDescriptionText: FRONTEND_JD,
      careerHistory,
      locale: "en-US",
    });

    const listedA = await service.listRuns({ limit: 10, profileId: "PROFILE-A" });
    const listedB = await service.listRuns({ limit: 10, profileId: "PROFILE-B" });
    const listedAll = await service.listRuns({ limit: 10 });

    expect(listedA.runs).toHaveLength(1);
    expect(listedB.runs).toHaveLength(1);
    expect(listedA.runs[0]?.profileId).toBe("PROFILE-A");
    expect(listedB.runs[0]?.profileId).toBe("PROFILE-B");
    expect(listedAll.runs).toHaveLength(2);
  });

  it("persists full resume generations into shared history", async () => {
    const store = new InMemoryExperienceGenerationRunStore();
    const resumeService = new ResumeGenerationService(orchestrator(), {
      store,
      providerName: "rule-based",
    });

    const resume = await resumeService.generate({
      jobDescriptionText: FRONTEND_JD,
      profile: softwareMindCareerProfile("PROFILE-HISTORY"),
      locale: "en-US",
    });

    const listed = await store.list({ limit: 5, profileId: "PROFILE-HISTORY" });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.generationId).toBe(resume.context.generationId);
    expect(listed[0]?.status).toBe("completed");
  });

  it("does not forward API secrets into LibreOffice env", () => {
    const env = createLibreOfficeEnv("/tmp/resume-pdf", {
      PATH: "/usr/bin",
      HOME: "/home/secret-user",
      OPENAI_API_KEY: "sk-secret-should-not-leak",
      EXPERIENCE_MODEL_API_KEY: "another-secret",
      LANG: "en_US.UTF-8",
    });

    expect(env.HOME).toBe("/tmp/resume-pdf");
    expect(env.PATH).toBe("/usr/bin");
    expect(env.LANG).toBe("en_US.UTF-8");
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.EXPERIENCE_MODEL_API_KEY).toBeUndefined();
  });
});
