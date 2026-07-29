import { describe, expect, it } from "vitest";
import {
  createEmptyProfile,
  normalizeStoredProfile,
} from "../apps/web/lib/saved-profile-store";

describe("saved profile store", () => {
  it("creates an empty editable profile shell", () => {
    const profile = createEmptyProfile();
    expect(profile.profileId).toBe("PROFILE-LOCAL");
    expect(profile.personalInformation.fullName).toBe("");
    expect(profile.careerHistory).toHaveLength(1);
    expect(profile.education).toHaveLength(1);
  });

  it("normalizes a saved profile for reload", () => {
    const normalized = normalizeStoredProfile({
      profileId: "PROFILE-1",
      personalInformation: {
        fullName: " Alex Morgan ",
        email: "alex@example.com",
        phone: "+1 555 0100",
        location: "Remote",
        linkedin: "https://www.linkedin.com/in/alex-morgan",
        portfolio: "",
      },
      careerHistory: [
        {
          experienceId: "EXP-001",
          companyName: " Example AI Company ",
          startDate: "Jan 2022",
          endDate: "Present",
        },
      ],
      education: [
        {
          educationId: "EDU-001",
          institution: "Example University",
          degree: "Bachelor of Science",
          field: "Computer Science",
          startDate: "Sep 2014",
          endDate: "Jun 2018",
        },
      ],
    });

    expect(normalized?.personalInformation.fullName).toBe("Alex Morgan");
    expect(normalized?.personalInformation.linkedin).toBe(
      "https://www.linkedin.com/in/alex-morgan",
    );
    expect(normalized?.personalInformation.portfolio).toBeUndefined();
    expect(normalized?.careerHistory[0]?.companyName).toBe("Example AI Company");
  });
});
