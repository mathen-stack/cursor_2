import { describe, expect, it } from "vitest";
import type { SummaryEngineInput, UserProfile } from "@resume/contracts";
import {
  createGenerationContext,
  createJobDescription,
} from "@resume/core";
import { createProductionSummaryEngine } from "@resume/engines";

const ML_JD = `Senior Machine Learning Engineer
5+ years of experience building and deploying scalable machine learning models in production environments.
Implement model monitoring, improve inference performance, and automate CI/CD workflows using Python, Docker, Kubernetes, MLflow, AWS, and PyTorch.
Collaborate with product, data, and platform teams to translate business requirements into technical solutions.
Mentor engineers and communicate architecture decisions to technical and non-technical stakeholders.`;

const DATA_JD = `Senior Data Engineer
Design reliable batch and streaming data pipelines using Python, SQL, Apache Spark, Airflow, Kafka, Snowflake, and dbt.
Improve data quality, platform scalability, and operational efficiency on Google Cloud Platform.
Partner with analytics stakeholders and document technical decisions.`;

function profile(profileId: string, startDate = "2018-01"): UserProfile {
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
        startDate,
        endDate: "Present",
      },
    ],
    education: [],
  };
}

function input(jdText: string, suffix: string, startDate = "2018-01"): SummaryEngineInput {
  const jobDescription = createJobDescription(jdText);
  const userProfile = profile(`PROFILE-${suffix}`, startDate);
  return {
    context: createGenerationContext(userProfile.profileId, jobDescription),
    jobDescription,
    profile: userProfile,
  };
}

describe("production Summary Engine", () => {
  it("generates a 50-80 word JD-aligned summary with an explicit role and years", async () => {
    const output = await createProductionSummaryEngine({
      experienceYears: { referenceDate: new Date("2026-07-01T00:00:00Z") },
    }).execute(input(ML_JD, "ML"));

    expect(output.status).toBe("approved");
    expect(output.wordCount).toBeGreaterThanOrEqual(50);
    expect(output.wordCount).toBeLessThanOrEqual(80);
    expect(output.targetRole.title).toBe("Senior Machine Learning Engineer");
    expect(output.experienceYears.display).toBe("5+ years");
    expect(output.experienceYears.source).toBe("explicit-jd");
    expect(output.summary).toContain("Python");
    expect(output.summary).toContain("Kubernetes");
    expect(output.validation.resumeWordedReadinessScore).toBeGreaterThanOrEqual(90);
  });

  it("calculates non-overlapping career years when the JD omits an experience requirement", async () => {
    const engineInput = input(DATA_JD, "CAREER", "2018-01");
    engineInput.profile.careerHistory.push({
      experienceId: "EXP-002",
      companyName: "Overlapping Company",
      startDate: "2020-01",
      endDate: "2022-12",
    });

    const output = await createProductionSummaryEngine({
      experienceYears: { referenceDate: new Date("2026-07-01T00:00:00Z") },
    }).execute(engineInput);

    expect(output.experienceYears.source).toBe("career-timeline");
    expect(output.experienceYears.value).toBe(8);
    expect(output.summary).toContain("8+ years");
  });

  it("uses only JD-grounded direct keywords", async () => {
    const engineInput = input(DATA_JD, "EVIDENCE");
    const output = await createProductionSummaryEngine({
      experienceYears: { referenceDate: new Date("2026-07-01T00:00:00Z") },
    }).execute(engineInput);

    for (const keyword of output.keywords) {
      expect(keyword.source).toBe("direct");
      for (const evidence of keyword.evidence) {
        expect(engineInput.jobDescription.rawText.slice(evidence.startIndex, evidence.endIndex)).toBe(evidence.sourceText);
      }
    }
    expect(output.keywords.some((keyword) => keyword.text === "Apache Spark")).toBe(true);
    expect(output.keywords.some((keyword) => keyword.text === "Kubernetes")).toBe(false);
  });

  it("includes at least two achievement metrics unique to the summary", async () => {
    const output = await createProductionSummaryEngine({
      experienceYears: { referenceDate: new Date("2026-07-01T00:00:00Z") },
    }).execute(input(ML_JD, "METRICS"));

    expect(output.status).toBe("approved");
    expect(output.validation.quantifiedMetricsApproved).toBe(true);
    const metrics = [
      ...output.summary.matchAll(/\b\d+(?:\.\d+)?\s?%/g),
      ...output.summary.matchAll(/\b\d+(?:\.\d+)?x\b/gi),
    ];
    expect(metrics.length).toBeGreaterThanOrEqual(2);
    expect(output.summary).toMatch(/measurable impact/i);
  });

  it("keeps summary metric measures out of the STAR taxonomy clone set", async () => {
    const output = await createProductionSummaryEngine({
      experienceYears: { referenceDate: new Date("2026-07-01T00:00:00Z") },
    }).execute(input(ML_JD, "UNIQUE-METRICS"));

    const experienceCloneMeasures = [
      "feature adoption",
      "throughput",
      "latency",
      "deployment cycle time",
      "team delivery velocity",
    ];
    for (const measure of experienceCloneMeasures) {
      expect(output.summary.toLowerCase()).not.toContain(measure);
    }
  });

  it("avoids personal pronouns, clichés, weak language, and keyword stuffing", async () => {
    const output = await createProductionSummaryEngine({
      experienceYears: { referenceDate: new Date("2026-07-01T00:00:00Z") },
    }).execute(input(ML_JD, "STYLE"));

    expect(output.validation.noPersonalPronouns).toBe(true);
    expect(output.validation.noCliches).toBe(true);
    expect(output.validation.noWeakLanguage).toBe(true);
    expect(output.validation.noKeywordStuffing).toBe(true);
    expect(output.validation.atsLanguageApproved).toBe(true);
  });

  it("keeps simultaneous JD summary runs isolated", async () => {
    const engine = createProductionSummaryEngine({
      experienceYears: { referenceDate: new Date("2026-07-01T00:00:00Z") },
    });
    const [ml, data] = await Promise.all([
      engine.execute(input(ML_JD, "A")),
      engine.execute(input(DATA_JD, "B")),
    ]);

    expect(ml.context.generationId).not.toBe(data.context.generationId);
    expect(ml.context.jdHash).not.toBe(data.context.jdHash);
    expect(ml.targetRole.title).not.toBe(data.targetRole.title);
    expect(ml.summary).not.toBe(data.summary);
  });

  it("rejects a context that belongs to another profile", async () => {
    const valid = input(ML_JD, "VALID");
    const invalid: SummaryEngineInput = {
      ...valid,
      context: { ...valid.context, profileId: "PROFILE-OTHER" },
    };

    await expect(createProductionSummaryEngine().execute(invalid)).rejects.toThrow(
      /does not match the supplied JD and profile/,
    );
  });

  it("does not mutate the JD or profile input", async () => {
    const engineInput = input(ML_JD, "IMMUTABLE");
    const before = JSON.stringify(engineInput);
    await createProductionSummaryEngine({
      experienceYears: { referenceDate: new Date("2026-07-01T00:00:00Z") },
    }).execute(engineInput);
    expect(JSON.stringify(engineInput)).toBe(before);
  });
});
