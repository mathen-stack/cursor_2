import { describe, expect, it } from "vitest";
import {
  ImmutableFinalResumeAssembler,
  ResumeOrchestrator,
  createJobDescription,
} from "@resume/core";
import {
  SourceEvidenceEnhancementEngine,
  createProductionExperienceEngine,
  createProductionSkillsEngine,
  createProductionSummaryEngine,
  createProductionTemplateEngine,
  extractSourceEvidence,
  validateEvidenceClaim,
} from "@resume/engines";
import type { UserProfile } from "@resume/contracts";

const REFERENCE_DATE = new Date("2026-07-27T00:00:00.000Z");

const PROFILE: UserProfile = {
  profileId: "PROFILE-EVIDENCE",
  personalInformation: {
    fullName: "Alex Morgan",
    email: "alex@example.com",
    phone: "+1 555 0100",
    location: "Remote",
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
};

const JD = `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments.
Implement model monitoring, improve inference performance, and automate CI/CD workflows.
Collaborate with product, data, and platform teams to translate business requirements into technical solutions.
Mentor engineers and communicate architecture decisions to technical and non-technical stakeholders.
Experience with Python, Docker, Kubernetes, MLflow, AWS, and distributed systems is required.`;

const SOURCE_RESUME = `Alex Morgan
Professional Summary
Machine learning engineer with production delivery experience.

Skills
Python, Docker, Kubernetes, MLflow, AWS, React

Experience
Example AI Company | Senior Machine Learning Engineer | 2022-01 – Present
- Deployed machine learning models on Kubernetes, reducing inference latency by 37% using MLflow and Python.
- Collaborated with product stakeholders on model monitoring and CI/CD automation.

Example Software Company | Software Engineer | 2018-03 – 2021-12
- Built backend services with Python and Docker, improving release reliability by 22%.

Education
Example University — B.S. Computer Science, 2018
`;

function orchestrator(withEvidence = true): ResumeOrchestrator {
  const enhancer = new SourceEvidenceEnhancementEngine();
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
    undefined,
    withEvidence ? (input) => enhancer.enhance(input) : undefined,
  );
}

describe("source evidence enhancement layer", () => {
  it("preserves original behavior when no source resume is provided", async () => {
    const jobDescription = createJobDescription(JD);
    const baseline = await orchestrator(false).generate({
      jobDescription,
      profile: PROFILE,
      locale: "en-US",
    });
    const withOptionalMissing = await orchestrator(true).generate({
      jobDescription: createJobDescription(JD),
      profile: PROFILE,
      locale: "en-US",
    });

    expect(baseline.assemblyValidation.overallStatus).toBe("approved");
    expect(withOptionalMissing.assemblyValidation.overallStatus).toBe("approved");
    expect(withOptionalMissing.evidenceEnhancement).toBeUndefined();
    expect(baseline.experience.experiences.map((item) => item.companyName)).toEqual(
      withOptionalMissing.experience.experiences.map((item) => item.companyName),
    );
    expect(baseline.experience.experiences.map((item) => item.startDate)).toEqual(
      withOptionalMissing.experience.experiences.map((item) => item.startDate),
    );
  });

  it("extracts grounded source evidence with strength and provenance spans", () => {
    const jobDescription = createJobDescription(JD);
    const bundle = extractSourceEvidence({
      sourceResumeText: SOURCE_RESUME,
      jobDescription,
    });

    expect(bundle.claims.length).toBeGreaterThan(0);
    expect(bundle.claims.some((claim) => claim.kind === "metric")).toBe(true);
    expect(bundle.claims.some((claim) => claim.kind === "tool" && claim.jdRelevant)).toBe(true);

    for (const claim of bundle.claims) {
      const slice = bundle.normalizedText.slice(
        claim.span.startIndex,
        claim.span.endIndex,
      );
      expect(slice).toBe(claim.span.sourceText);
    }

    const reactClaim = bundle.claims.find(
      (claim) => claim.normalizedText === "react",
    );
    expect(reactClaim).toBeDefined();
    expect(reactClaim?.jdRelevant).toBe(false);
    expect(reactClaim?.usableForFacts).toBe(false);
    expect(
      validateEvidenceClaim({
        claim: reactClaim!,
        sourceNormalizedText: bundle.normalizedText,
      }).ok,
    ).toBe(false);
  });

  it("accepts only validated evidence proposals and records rejections", async () => {
    const resume = await orchestrator(true).generate({
      jobDescription: createJobDescription(JD),
      profile: PROFILE,
      locale: "en-US",
      sourceResumeText: SOURCE_RESUME,
    });

    expect(resume.assemblyValidation.overallStatus).toBe("approved");
    expect(resume.evidenceEnhancement).toBeDefined();
    expect(resume.evidenceEnhancement?.ruleHierarchy).toHaveLength(6);
    expect(resume.evidenceEnhancement?.originalBehaviorPreservedWhenRejected).toBe(
      true,
    );

    for (const proposal of resume.evidenceEnhancement?.proposals ?? []) {
      if (proposal.decision === "accepted") {
        expect(proposal.provenance.length).toBeGreaterThan(0);
        expect(proposal.afterText.length).toBeGreaterThan(0);
        expect(proposal.rejectionReasons).toEqual([]);
      } else {
        expect(proposal.rejectionReasons.length).toBeGreaterThan(0);
        expect(proposal.rejectionReasons).toContain("keeps-original-on-failure");
      }
    }

    // Employment history must remain identical to profile facts.
    expect(resume.experience.experiences.map((item) => item.companyName)).toEqual([
      "Example AI Company",
      "Example Software Company",
    ]);
    expect(resume.experience.experiences.map((item) => item.startDate)).toEqual([
      "2022-01",
      "2018-03",
    ]);
  });

  it("never treats JD-only content as candidate proof", () => {
    const jobDescription = createJobDescription(JD);
    const bundle = extractSourceEvidence({
      sourceResumeText: SOURCE_RESUME,
      jobDescription,
    });
    const jdOnlyClaim = {
      claimId: "EV-FAKE",
      kind: "tool" as const,
      text: "distributed systems",
      normalizedText: "distributed systems",
      strength: "strong" as const,
      span: {
        sectionId: "skills" as const,
        sourceText: "distributed systems",
        startIndex: 0,
        endIndex: "distributed systems".length,
      },
      jdRelevant: true,
      usableForFacts: true,
      notes: [],
    };
    // Span does not match source resume text at those indexes.
    const result = validateEvidenceClaim({
      claim: jdOnlyClaim,
      sourceNormalizedText: bundle.normalizedText,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContain("missing-source-span");
    }
  });

  it("keeps original section text when enhancement validation fails", () => {
    const enhancer = new SourceEvidenceEnhancementEngine();
    const jobDescription = createJobDescription(JD);
    // Tiny source with conflicting/weak signals only.
    const weakSource = `Skills
React, Vue, Angular
`;
    // Build minimal approved-looking outputs by running full pipeline first, then
    // force a weak source through the enhancer and ensure originals survive.
    return orchestrator(false)
      .generate({
        jobDescription,
        profile: PROFILE,
        locale: "en-US",
      })
      .then((baseline) => {
        const enhanced = enhancer.enhance({
          sourceResumeText: weakSource.padEnd(40, " "),
          jobDescription,
          profile: PROFILE,
          summary: baseline.summary,
          skills: baseline.skills,
          experience: baseline.experience,
        });
        expect(enhanced.summary.summary).toBe(baseline.summary.summary);
        expect(enhanced.skills.skills.map((skill) => skill.name)).toEqual(
          baseline.skills.skills.map((skill) => skill.name),
        );
        expect(
          enhanced.experience.experiences.flatMap((item) =>
            item.bullets.map((bullet) => bullet.finalBullet),
          ),
        ).toEqual(
          baseline.experience.experiences.flatMap((item) =>
            item.bullets.map((bullet) => bullet.finalBullet),
          ),
        );
        expect(
          enhanced.report.proposals.every((proposal) => proposal.decision === "rejected") ||
            enhanced.report.proposals.length === 0,
        ).toBe(true);
      });
  });
});
