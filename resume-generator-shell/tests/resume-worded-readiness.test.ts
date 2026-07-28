import { describe, expect, it } from "vitest";
import type { UserProfile } from "@resume/contracts";
import {
  ExternalResumeCalibrationAnalyzer,
  InMemoryExternalResumeTestStore,
  ResumeOrchestrator,
  ResumeReadinessService,
  ResumeWordedReadinessEngine,
  createJobDescription,
} from "@resume/core";
import {
  createProductionExperienceEngine,
  createProductionSkillsEngine,
  createProductionSummaryEngine,
  createProductionTemplateEngine,
} from "@resume/engines";

const JD = `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments.
Implement model monitoring, improve inference performance, and automate CI/CD workflows.
Collaborate with product, data, and platform teams to translate business requirements into technical solutions.
Mentor engineers and communicate architecture decisions to technical and non-technical stakeholders.
Experience with Python, Docker, Kubernetes, MLflow, AWS, and distributed systems is required.`;

function profile(profileId: string): UserProfile {
  return {
    profileId,
    personalInformation: {
      fullName: "Alex Morgan",
      email: "alex@example.com",
      phone: "+1 555 0100",
      location: "Remote",
      linkedin: "https://www.linkedin.com/in/alex-morgan",
    },
    careerHistory: [
      {
        experienceId: "EXP-001",
        companyName: "Example AI Company",
        startDate: "2022-01",
        endDate: "Present",
      },
      {
        experienceId: "EXP-002",
        companyName: "Example Software Company",
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
  return new ResumeOrchestrator({
    experience: createProductionExperienceEngine().engine,
    summary: createProductionSummaryEngine(),
    skills: createProductionSkillsEngine(),
    template: createProductionTemplateEngine(),
  });
}

describe("Resume Worded readiness and external calibration", () => {
  it("adds evaluation-only readiness metadata without changing resume content", async () => {
    const result = await orchestrator().generate({
      jobDescription: createJobDescription(JD),
      profile: profile("PROFILE-READINESS"),
      locale: "en-US",
    });

    expect(result.readiness).toBeDefined();
    expect(result.readiness?.contentMutated).toBe(false);
    expect(result.readiness?.documentFingerprint).toBe(
      result.document.contentFingerprint,
    );
    expect(result.readiness?.categories).toHaveLength(11);
    expect(result.readiness?.targetInternalScore).toBe(95);
    expect(result.readiness?.internalScore).toBeGreaterThanOrEqual(0);
    expect(result.readiness?.internalScore).toBeLessThanOrEqual(100);
    expect(result.assemblyValidation.overallStatus).toBe("approved");
  });

  it("scores a degraded copy lower and routes issues to responsible engines", async () => {
    const result = await orchestrator().generate({
      jobDescription: createJobDescription(JD),
      profile: profile("PROFILE-DEGRADED"),
      locale: "en-US",
    });
    const evaluator = new ResumeWordedReadinessEngine();
    const baseline = evaluator.assess(result);
    const degraded = structuredClone(result);
    for (const experience of degraded.experience.experiences) {
      for (const bullet of experience.bullets) {
        bullet.result = "Improved operations.";
        bullet.finalBullet = "Worked on systems and improved operations.";
      }
    }
    degraded.experience.validation.exactRepetitionGroups = [
      degraded.experience.experiences.flatMap((entry) =>
        entry.bullets.map((bullet) => bullet.bulletId),
      ),
    ];
    const report = evaluator.assess(degraded);

    expect(report.internalScore).toBeLessThan(baseline.internalScore);
    expect(report.readyForExternalTest).toBe(false);
    expect(report.issues.some((issue) => issue.owner === "experience")).toBe(true);
    expect(
      report.issues.some(
        (issue) => issue.issueCode === "INSUFFICIENT_QUANTIFIED_IMPACT",
      ),
    ).toBe(true);
  });

  it("stores external results only inside the exact generation and document scope", async () => {
    const store = new InMemoryExternalResumeTestStore();
    const service = new ResumeReadinessService(
      new ResumeWordedReadinessEngine(),
      new ExternalResumeCalibrationAnalyzer(),
      store,
    );
    const base = {
      platform: "resume-worded" as const,
      generationId: "GEN-CALIBRATION",
      jdId: "JD-A",
      jdHash: "HASH-A",
      documentFingerprint: "DOC-A",
      internalReadinessScore: 96,
      overallScore: 92,
      relevancyScore: 94,
      feedback: [
        {
          category: "impact" as const,
          message: "Add stronger quantified outcomes.",
        },
      ],
    };

    const record = await service.recordExternalTest(base);
    expect(record.isolationPolicy).toBe("generation-scoped");
    expect(record.overallScoreDelta).toBe(-4);
    expect(record.mappedIssues[0]?.owner).toBe("experience");
    expect((await service.listExternalTests("GEN-CALIBRATION")).total).toBe(1);

    await expect(
      service.recordExternalTest({
        ...base,
        jdId: "JD-B",
        jdHash: "HASH-B",
      }),
    ).rejects.toThrow(/cannot cross JD boundaries/i);

    await expect(
      service.recordExternalTest({
        ...base,
        documentFingerprint: "DOC-B",
      }),
    ).rejects.toThrow(/exact exported resume fingerprint/i);
  });
});
