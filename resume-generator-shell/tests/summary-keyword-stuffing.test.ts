import { describe, expect, it } from "vitest";
import type { SummaryEngineInput, UserProfile } from "@resume/contracts";
import {
  createGenerationContext,
  createJobDescription,
} from "@resume/core";
import { createProductionSummaryEngine } from "@resume/engines";

const DENSE_JD = `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments with high availability and security.
Implement model monitoring, improve inference performance and throughput, and automate CI/CD workflows.
Collaborate with product, data, and platform teams to translate business requirements into technical solutions.
Mentor engineers and communicate architecture decisions to technical and non-technical stakeholders.
Lead technical strategy and improve customer-facing AI reliability and customer experience.
Experience with Python, Docker, Kubernetes, MLflow, AWS, PyTorch, and distributed systems is required.`;

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
});
