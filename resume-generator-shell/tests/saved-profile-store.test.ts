import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createEmptyProfile,
  normalizeStoredProfile,
  savedProfileStorageKey,
} from "../apps/web/lib/saved-profile-store";
import {
  authenticateCredentials,
  createSessionToken,
  listAuthUsers,
  verifySessionToken,
} from "../apps/web/lib/auth";
import {
  deleteUserProfileRecord,
  listUserProfileSummaries,
  readUserProfileRecord,
  writeUserProfileRecord,
} from "../apps/web/lib/user-profile-store";

describe("saved profile helpers", () => {
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

describe("auth roles", () => {
  it("includes an administrator account by default", () => {
    const users = listAuthUsers();
    expect(users.some((user) => user.username === "admin" && user.role === "admin")).toBe(
      true,
    );
    expect(users.some((user) => user.username === "demo" && user.role === "user")).toBe(
      true,
    );
  });

  it("authenticates admin and encodes role in the session", () => {
    const user = authenticateCredentials("admin", "admin123");
    expect(user?.role).toBe("admin");
    const session = verifySessionToken(createSessionToken(user!));
    expect(session?.role).toBe("admin");
  });

  it("rejects invalid credentials", () => {
    expect(authenticateCredentials("demo", "wrong")).toBeNull();
  });
});

describe("server user profile store", () => {
  it("writes, reads, lists, and deletes profiles", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resume-profiles-"));
    const previousCwd = process.cwd();
    process.chdir(tempRoot);
    try {
      const profile = createEmptyProfile();
      profile.personalInformation.fullName = "Alex Morgan";
      profile.personalInformation.email = "alex@example.com";
      profile.personalInformation.phone = "+1 555 0100";
      profile.personalInformation.location = "Remote";
      profile.careerHistory[0] = {
        experienceId: "EXP-001",
        companyName: "Example AI Company",
        startDate: "Jan 2022",
        endDate: "Present",
      };
      profile.education[0] = {
        educationId: "EDU-001",
        institution: "Example University",
        degree: "Bachelor of Science",
        field: "Computer Science",
        startDate: "Sep 2014",
        endDate: "Jun 2018",
      };

      const saved = await writeUserProfileRecord({
        username: "demo",
        profile,
        updatedBy: "admin",
      });
      expect(saved.updatedBy).toBe("admin");

      const loaded = await readUserProfileRecord("demo");
      expect(loaded?.profile.personalInformation.fullName).toBe("Alex Morgan");

      const summaries = await listUserProfileSummaries(["demo", "admin"]);
      expect(summaries.find((item) => item.username === "demo")?.hasProfile).toBe(
        true,
      );
      expect(summaries.find((item) => item.username === "admin")?.hasProfile).toBe(
        false,
      );

      await deleteUserProfileRecord("demo");
      expect(await readUserProfileRecord("demo")).toBeNull();
    } finally {
      process.chdir(previousCwd);
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
