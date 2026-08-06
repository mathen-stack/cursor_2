import { describe, expect, it } from "vitest";
import {
  PersonalInformationSchema,
  ResumeGenerationSubmissionSchema,
  normalizeOptionalHttpUrl,
} from "@resume/contracts";

describe("optional profile URL normalization", () => {
  it("keeps valid absolute URLs unchanged", () => {
    expect(normalizeOptionalHttpUrl("https://www.linkedin.com/in/alex-morgan")).toBe(
      "https://www.linkedin.com/in/alex-morgan",
    );
  });

  it("prefixes https for protocol-relative host paths", () => {
    expect(normalizeOptionalHttpUrl("linkedin.com/in/alex-morgan")).toBe(
      "https://linkedin.com/in/alex-morgan",
    );
    expect(normalizeOptionalHttpUrl("www.example.com")).toBe("https://www.example.com");
  });

  it("omits blank and unusable values instead of throwing", () => {
    expect(normalizeOptionalHttpUrl("")).toBeUndefined();
    expect(normalizeOptionalHttpUrl("   ")).toBeUndefined();
    expect(normalizeOptionalHttpUrl("not a url")).toBeUndefined();
    expect(normalizeOptionalHttpUrl("linkedin")).toBeUndefined();
  });

  it("parses personal information with incomplete linkedin without failing", () => {
    const parsed = PersonalInformationSchema.parse({
      fullName: "Kenny User",
      email: "kenny@example.com",
      phone: "+1 555 0100",
      location: "Austin, TX",
      linkedin: "linkedin.com/in/kenny-user",
      portfolio: "not a url",
    });

    expect(parsed.linkedin).toBe("https://linkedin.com/in/kenny-user");
    expect(parsed.portfolio).toBeUndefined();
  });

  it("allows generate submission when linkedin is an incomplete URL", () => {
    const parsed = ResumeGenerationSubmissionSchema.parse({
      jobDescriptionText:
        "Senior Frontend Engineer building React and TypeScript apps with measurable delivery outcomes and collaboration across product teams.",
      profile: {
        profileId: "PROFILE-1",
        personalInformation: {
          fullName: "Kenny User",
          email: "kenny@example.com",
          phone: "+1 555 0100",
          location: "Austin, TX",
          linkedin: "www.linkedin.com/in/kenny",
        },
        careerHistory: [
          {
            experienceId: "EXP-001",
            companyName: "Kenny Corp",
            role: "Engineer",
            startDate: "2022-01",
            endDate: "Present",
          },
        ],
        education: [
          {
            educationId: "EDU-001",
            institution: "Kenny University",
            degree: "Bachelor of Science",
            field: "Computer Science",
            startDate: "2014-01",
            endDate: "2018-01",
          },
        ],
      },
      locale: "en-US",
    });

    expect(parsed.profile.personalInformation.linkedin).toBe(
      "https://www.linkedin.com/in/kenny",
    );
  });
});
