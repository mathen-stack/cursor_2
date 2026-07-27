import { describe, expect, it } from "vitest";
import {
  ImmutableFinalResumeAssembler,
  ResumeOrchestrator,
  createJobDescription,
} from "@resume/core";
import {
  createProductionExperienceEngine,
  createProductionSkillsEngine,
  createProductionSummaryEngine,
  createProductionTemplateEngine,
} from "@resume/engines";
import { ProductionResumeRenderer } from "@resume/rendering";
import {
  SOFTWARE_MIND_EXPECTED_ROLE_PROGRESSION,
  SOFTWARE_MIND_REQUIRED_SKILLS,
  SOFTWARE_MIND_SENIOR_FRONTEND_JD,
  softwareMindCareerProfile,
} from "./fixtures/software-mind-senior-frontend";

const REFERENCE_DATE = new Date("2026-07-27T00:00:00.000Z");

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

function openingVerb(bullet: string): string {
  const match = /^([A-Za-z]+)/.exec(bullet.trim());
  return match?.[1]?.toLocaleLowerCase() ?? "";
}

describe("Software Mind Senior Frontend Engineer regression fixture", () => {
  it("generates an isolated ATS-ready resume for HP, Visa, and Plutora", async () => {
    const profile = softwareMindCareerProfile("PROFILE-SOFTWARE-MIND");
    const jobDescription = createJobDescription(SOFTWARE_MIND_SENIOR_FRONTEND_JD);

    const resume = await orchestrator().generate({
      jobDescription,
      profile,
      locale: "en-US",
    });

    expect(resume.assemblyValidation.overallStatus).toBe("approved");
    expect(resume.experience.status).toBe("approved");
    expect(resume.summary.status).toBe("approved");
    expect(resume.skills.status).toBe("approved");
    expect(resume.template.status).toBe("approved");
    expect(resume.assemblyValidation.sourceOutputsUnmodified).toBe(true);

    const roles = resume.experience.experiences.map((experience) => experience.assignedRole);
    expect(roles).toEqual([...SOFTWARE_MIND_EXPECTED_ROLE_PROGRESSION]);
    expect(resume.experience.experiences.map((experience) => experience.companyName)).toEqual([
      "HP",
      "Visa",
      "Plutora",
    ]);

    for (const experience of resume.experience.experiences) {
      expect(experience.bullets.length).toBeGreaterThanOrEqual(5);
      const texts = experience.bullets.map((bullet) => bullet.finalBullet);
      expect(new Set(texts).size).toBe(texts.length);

      const verbs = texts.map(openingVerb);
      expect(new Set(verbs).size).toBe(verbs.length);

      for (const bullet of texts) {
        expect(bullet.split(/\s+/).length).toBeGreaterThanOrEqual(12);
        expect(bullet).toMatch(/[.!?]$/);
        expect(bullet).not.toMatch(/\b(?:I|me|my|we|our)\b/i);
        expect(bullet).not.toMatch(
          /\b(?:Spark|Airflow|Kafka|Snowflake|PyTorch|Kubernetes|MLflow)\b/,
        );
      }
    }

    const recent = resume.experience.experiences[0];
    expect(recent?.bullets.length).toBeGreaterThanOrEqual(6);
    expect(
      recent?.bullets.some(
        (bullet) =>
          bullet.communicationFocused ||
          /\b(?:collaborat|partner|cross-functional|stakeholder|communicat|team)\b/i.test(
            bullet.finalBullet,
          ),
      ),
    ).toBe(true);

    const skillNames = new Set(resume.skills.skills.map((skill) => skill.name));
    for (const required of SOFTWARE_MIND_REQUIRED_SKILLS) {
      expect(skillNames.has(required), `missing required skill: ${required}`).toBe(true);
    }
    expect(resume.skills.validation.explicitSkillsCovered).toBe(true);

    const summaryWords = resume.summary.summary.trim().split(/\s+/).length;
    expect(summaryWords).toBeGreaterThanOrEqual(50);
    expect(summaryWords).toBeLessThanOrEqual(80);
    expect(resume.summary.summary).toMatch(/Senior Frontend Engineer/i);
    expect(resume.summary.summary).not.toMatch(/\b(?:I|me|my|we|our)\b/i);

    expect(resume.readiness?.contentMutated).toBe(false);
    expect(resume.readiness?.readyForExternalTest).toBe(true);
    expect(resume.readiness?.targetInternalScore).toBe(95);
    expect((resume.readiness?.internalScore ?? 0) >= 95).toBe(true);

    for (const experience of resume.experience.experiences) {
      for (const bullet of experience.bullets) {
        expect(bullet.finalBullet).not.toMatch(/\bCSS(?:\s+CSS)+\b/);
        expect(bullet.finalBullet).not.toMatch(
          /\b(?:Led|Developed|Secured)\s+(?:strong verbal|builds reliable|verbal and written)\b/i,
        );
        expect(bullet.finalBullet).not.toMatch(/\bFacilitated closely\b/i);
        expect(bullet.finalBullet).not.toMatch(/\bwhile (?:made|cut)\b/i);
        expect(bullet.finalBullet).not.toMatch(/\bproduction frontend delivery outcomes\b/i);
        expect(bullet.finalBullet).not.toMatch(
          /\bthrough\s+([a-z][a-z0-9+./\s-]{3,40})\s+through\s+\1\b/i,
        );
        expect(bullet.finalBullet).not.toMatch(
          /\b(solution design and design reviews|cross-functional planning and product partnership|canary releases and CI\/CD|stakeholder updates and risk communication)\b.*\bthrough\s+\1\b/i,
        );
        expect(bullet.finalBullet).not.toMatch(/\bAligned stakeholder alignment\b/i);
        expect(bullet.finalBullet).not.toMatch(/\bCommunicated real-time communication\b/i);
        expect(bullet.finalBullet).not.toMatch(/\breduction in system interoperability\b/i);
        expect(bullet.finalBullet).not.toMatch(/\bmake an impact for companies\b/i);
        expect(bullet.finalBullet).not.toMatch(/\bperformance and enhance\b/i);
      }
    }

    const renderer = new ProductionResumeRenderer();
    for (const format of ["docx", "pdf", "html", "txt"] as const) {
      const artifact = await renderer.export(resume, format);
      expect(artifact.validation.overallStatus).toBe("approved");
      expect(artifact.sourceDocumentFingerprint).toBe(resume.document.contentFingerprint);
      expect(artifact.byteLength).toBeGreaterThan(100);
    }
  });
});
