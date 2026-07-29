import { describe, expect, it } from "vitest";
import {
  createEmptyProfile,
  normalizeStoredProfile,
  savedProfileStorageKey,
} from "../apps/web/lib/saved-profile-store";
import {
  authenticateCredentials,
  createSessionToken,
  verifySessionToken,
} from "../apps/web/lib/auth";

describe("saved profile store", () => {
  it("creates an empty editable profile shell", () => {
    const profile = createEmptyProfile();
    expect(profile.profileId).toBe("PROFILE-LOCAL");
    expect(profile.personalInformation.fullName).toBe("");
    expect(profile.careerHistory).toHaveLength(1);
    expect(profile.education).toHaveLength(1);
  });

  it("scopes storage keys by username", () => {
    expect(savedProfileStorageKey("Demo User")).toContain(":demo-user");
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

describe("auth session", () => {
  it("authenticates the demo user and verifies a session token", () => {
    const user = authenticateCredentials("demo", "demo123");
    expect(user?.username).toBe("demo");
    const token = createSessionToken(user!);
    const session = verifySessionToken(token);
    expect(session?.username).toBe("demo");
  });

  it("rejects invalid credentials", () => {
    expect(authenticateCredentials("demo", "wrong")).toBeNull();
  });
});
