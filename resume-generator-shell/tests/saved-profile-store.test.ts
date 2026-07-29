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
  createStoredAccount,
  deleteStoredAccount,
  signUpStoredAccount,
  updateStoredAccount,
} from "../apps/web/lib/user-account-store";
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
    expect(normalized?.careerHistory[0]?.role).toBe("");
  });

  it("preserves an optional career role title", () => {
    const normalized = normalizeStoredProfile({
      profileId: "PROFILE-1",
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
          role: "  Senior ML Engineer  ",
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

    expect(normalized?.careerHistory[0]?.role).toBe("Senior ML Engineer");
  });
});

describe("auth roles", () => {
  it("includes an administrator account by default", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resume-auth-"));
    const previousCwd = process.cwd();
    process.chdir(tempRoot);
    try {
      const users = await listAuthUsers();
      expect(
        users.some((user) => user.username === "admin" && user.role === "admin"),
      ).toBe(true);
      expect(
        users.some((user) => user.username === "demo" && user.role === "user"),
      ).toBe(true);
    } finally {
      process.chdir(previousCwd);
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("authenticates admin and encodes role in the session", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resume-auth-"));
    const previousCwd = process.cwd();
    process.chdir(tempRoot);
    try {
      const result = await authenticateCredentials("admin", "admin123");
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected admin auth");
      expect(result.user.role).toBe("admin");
      const session = verifySessionToken(createSessionToken(result.user));
      expect(session?.role).toBe("admin");
    } finally {
      process.chdir(previousCwd);
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects invalid credentials", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resume-auth-"));
    const previousCwd = process.cwd();
    process.chdir(tempRoot);
    try {
      expect(await authenticateCredentials("demo", "wrong")).toEqual({
        ok: false,
        reason: "invalid",
      });
    } finally {
      process.chdir(previousCwd);
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("admin account updates", () => {
  it("lets an admin change username and password", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resume-accounts-"));
    const previousCwd = process.cwd();
    process.chdir(tempRoot);
    try {
      await createStoredAccount({
        username: "member",
        password: "secret1",
        role: "user",
        updatedBy: "admin",
      });

      const renamed = await updateStoredAccount({
        username: "member",
        nextUsername: "member-two",
        password: "secret2",
        updatedBy: "admin",
      });
      expect(renamed.account.username).toBe("member-two");
      expect(renamed.renamedFrom).toBe("member");

      expect(await authenticateCredentials("member", "secret1")).toEqual({
        ok: false,
        reason: "invalid",
      });
      const next = await authenticateCredentials("member-two", "secret2");
      expect(next.ok).toBe(true);
    } finally {
      process.chdir(previousCwd);
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("signup approval", () => {
  it("keeps self-signup accounts pending until an admin approves them", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resume-signup-"));
    const previousCwd = process.cwd();
    process.chdir(tempRoot);
    try {
      const pending = await signUpStoredAccount({
        username: "newcomer",
        password: "secret99",
      });
      expect(pending.status).toBe("pending");
      expect(await authenticateCredentials("newcomer", "secret99")).toEqual({
        ok: false,
        reason: "pending",
      });

      const approved = await updateStoredAccount({
        username: "newcomer",
        status: "approved",
        updatedBy: "admin",
      });
      expect(approved.account.status).toBe("approved");
      const result = await authenticateCredentials("newcomer", "secret99");
      expect(result.ok).toBe(true);
    } finally {
      process.chdir(previousCwd);
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("admin account removal", () => {
  it("lets an admin remove another user account", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resume-remove-"));
    const previousCwd = process.cwd();
    process.chdir(tempRoot);
    try {
      await createStoredAccount({
        username: "member",
        password: "secret1",
        role: "user",
        updatedBy: "admin",
      });
      const removed = await deleteStoredAccount({
        username: "member",
        deletedBy: "admin",
      });
      expect(removed.username).toBe("member");
      expect(await authenticateCredentials("member", "secret1")).toEqual({
        ok: false,
        reason: "invalid",
      });
    } finally {
      process.chdir(previousCwd);
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("blocks an admin from removing their own account", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "resume-remove-self-"));
    const previousCwd = process.cwd();
    process.chdir(tempRoot);
    try {
      await expect(
        deleteStoredAccount({ username: "admin", deletedBy: "admin" }),
      ).rejects.toThrow(/own account/i);
    } finally {
      process.chdir(previousCwd);
      await rm(tempRoot, { recursive: true, force: true });
    }
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
