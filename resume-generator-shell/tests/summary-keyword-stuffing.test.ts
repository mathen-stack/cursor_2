import { describe, expect, it } from "vitest";
import type {
  SummaryEngineInput,
  SummaryKeyword,
  UserProfile,
} from "@resume/contracts";
import {
  createGenerationContext,
  createJobDescription,
} from "@resume/core";
import { createProductionSummaryEngine } from "@resume/engines";
import { SummaryValidator } from "../packages/engines/src/summary/validation/summary-validator";

const DENSE_JD = `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments with high availability and security.
Implement model monitoring, improve inference performance and throughput, and automate CI/CD workflows.
Collaborate with product, data, and platform teams to translate business requirements into technical solutions.
Mentor engineers and communicate architecture decisions to technical and non-technical stakeholders.
Lead technical strategy and improve customer-facing AI reliability and customer experience.
Experience with Python, Docker, Kubernetes, MLflow, AWS, PyTorch, and distributed systems is required.`;

const SECURITY_JD = `Senior Security Engineer | Target Company
Design and deliver security architecture, threat modeling, and secure software systems for cloud platforms.
Improve detection coverage, reduce risk, and harden authentication, authorization, and identity controls.
Collaborate with product and platform teams on security reviews and incident response readiness.
Mentor engineers and provide technical leadership on secure design decisions.
Experience with AWS, Kubernetes, Python, SIEM, zero trust, and vulnerability management is required.`;

function profile(profileId: string): UserProfile {
  return {
    profileId,
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
        startDate: "2014-09",
        endDate: "2018-06",
      },
    ],
  };
}

function input(jdText: string, suffix: string): SummaryEngineInput {
  const jobDescription = createJobDescription(jdText);
  const userProfile = profile(`PROFILE-${suffix}`);
  return {
    context: createGenerationContext(userProfile.profileId, jobDescription),
    jobDescription,
    profile: userProfile,
  };
}

function keyword(text: string, overrides: Partial<SummaryKeyword> = {}): SummaryKeyword {
  return {
    keywordId: `KW-${text}`,
    text,
    normalizedKey: text.toUpperCase().replace(/\s+/g, "_"),
    category: "technical",
    source: "direct",
    priority: 80,
    evidence: [],
    ...overrides,
  };
}

describe("summary keyword stuffing guardrails", () => {
  it("approves dense JD summaries without false overload rejects", async () => {
    const output = await createProductionSummaryEngine({
      experienceYears: { referenceDate: new Date("2026-07-27T00:00:00Z") },
    }).execute(input(DENSE_JD, "DENSE"));

    expect(output.status).toBe("approved");
    expect(output.validation.noKeywordStuffing).toBe(true);
    expect(output.keywords.length).toBeLessThanOrEqual(14);
    expect(output.summary).toContain("Python");
    expect(output.summary).toMatch(/Kubernetes|Docker|MLflow|AWS|PyTorch/i);
    expect(output.summary).not.toMatch(/Cross-Functional Collaboration/i);
  });

  it("approves security-role summaries without title/domain keyword echo rejects", async () => {
    const output = await createProductionSummaryEngine({
      experienceYears: { referenceDate: new Date("2026-07-27T00:00:00Z") },
    }).execute(input(SECURITY_JD, "SEC"));

    expect(output.status).toBe("approved");
    expect(
      output.validation.issues.filter(
        (issue) =>
          issue.issueCode === "KEYWORD_STUFFING" && issue.severity === "error",
      ),
    ).toEqual([]);
    expect(output.summary).toMatch(/Senior Security Engineer/i);
  });

  it("soft-fails residual keyword overload instead of hard-rejecting", () => {
    const jobDescription = createJobDescription(
      "security architecture security controls",
    );
    const security = keyword("security", { category: "domain" });
    const summary =
      "Senior Security Engineer with 8+ years of experience designing and delivering security for complex business and engineering needs. " +
      "Expertise includes AWS, Kubernetes, Python, and SIEM, with engineering decisions focused on reliability and scalability. " +
      "Demonstrated measurable impact through a 35% improvement in release predictability and a 28% improvement in production change success rate.";

    const validation = new SummaryValidator().validate({
      jobDescription,
      summary,
      targetRole: {
        title: "Senior Security Engineer",
        family: "security-engineering",
        seniority: "senior",
        confidence: 1,
        evidence: [],
      },
      experienceYears: {
        value: 8,
        display: "8+ years",
        source: "seniority-inference",
        jdRequiredYears: null,
        calculatedCareerYears: 8,
      },
      allocatedKeywords: [
        security,
        keyword("AWS"),
        keyword("Kubernetes"),
        keyword("Python"),
        keyword("SIEM"),
      ],
      usedKeywords: [
        security,
        keyword("AWS"),
        keyword("Kubernetes"),
        keyword("Python"),
        keyword("SIEM"),
      ],
      minimumWords: 50,
      maximumWords: 80,
    });

    expect(validation.noKeywordStuffing).toBe(false);
    expect(
      validation.issues.find((issue) => issue.issueCode === "KEYWORD_STUFFING"),
    ).toMatchObject({
      severity: "warning",
      message: "Summary repeats or overloads JD keywords.",
    });
    expect(validation.overallStatus).toBe("approved");
  });
});
