import { describe, expect, it } from "vitest";
import { createGenerationContext, createJobDescription } from "@resume/core";
import {
  createProductionCoverLetterEngine,
  extractCompanyNameFromJd,
} from "@resume/engines";

const profile = {
  profileId: "PROFILE-COVER",
  personalInformation: {
    fullName: "Kenny User",
    email: "kenny@example.com",
    location: "Austin, TX",
  },
  careerHistory: [
    {
      experienceId: "EXP-001",
      companyName: "Kenny Corp",
      role: "Staff Frontend Engineer",
      startDate: "2022-01",
      endDate: "Present",
    },
    {
      experienceId: "EXP-002",
      companyName: "Kenny Labs",
      role: "Frontend Engineer",
      startDate: "2019-01",
      endDate: "2021-12",
    },
  ],
  education: [
    {
      educationId: "EDU-001",
      institution: "Kenny University",
      degree: "Bachelor of Science",
      field: "Computer Science",
      startDate: "2011-09",
      endDate: "2015-06",
    },
  ],
};

describe("cover letter engine", () => {
  it("extracts a plausible company name from the JD", () => {
    expect(
      extractCompanyNameFromJd(
        "Senior Frontend Engineer at Acme Platforms\nBuild React apps with TypeScript.",
      ),
    ).toBe("Acme Platforms");
  });

  it("generates an approved cover letter from JD + profile", async () => {
    const jobDescription = createJobDescription(`Senior Frontend Engineer at Acme Platforms

We are looking for a Senior Frontend Engineer to build React and TypeScript applications.
Improve delivery reliability, collaborate with product teams, and ship accessible user experiences.
5+ years of experience preferred.`);

    const context = createGenerationContext(profile.profileId, jobDescription);
    const output = await createProductionCoverLetterEngine().execute({
      context,
      jobDescription,
      profile,
      highlightBullets: [
        "Built React and TypeScript interfaces with Next.js, improving checkout conversion by 18%.",
        "Improved WebSocket reliability for realtime UX, sustaining 99.9% session continuity.",
      ],
    });

    expect(output.status).toBe("approved");
    expect(output.coverLetter).toMatch(/Dear Hiring Manager/i);
    expect(output.coverLetter).toMatch(/Senior Frontend Engineer/i);
    expect(output.coverLetter).toMatch(/Kenny User/);
    expect(output.coverLetter).toMatch(/Acme Platforms|Kenny Corp|React|TypeScript/i);
    expect(output.wordCount).toBeGreaterThanOrEqual(120);
    expect(output.validation.targetRolePresent).toBe(true);
  });
});
