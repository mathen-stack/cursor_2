import type { CareerEntry, UserProfile } from "@resume/contracts";

export const SAVED_PROFILE_STORAGE_KEY_PREFIX = "resume-tailor:saved-profile:v1";

export function savedProfileStorageKey(username?: string | null): string {
  const safeUser =
    username
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "guest";
  return `${SAVED_PROFILE_STORAGE_KEY_PREFIX}:${safeUser}`;
}

type SavedProfileRecord = {
  version: 1;
  savedAt: string;
  profile: UserProfile;
};

function newCareerEntry(index: number): CareerEntry {
  return {
    experienceId: `EXP-${String(index + 1).padStart(3, "0")}`,
    companyName: "",
    role: "",
    startDate: "",
    endDate: "",
  };
}

function newEducationEntry(index: number): UserProfile["education"][number] {
  return {
    educationId: `EDU-${String(index + 1).padStart(3, "0")}`,
    institution: "",
    degree: "",
    field: "",
    startDate: "",
    endDate: "",
  };
}

export function createEmptyProfile(): UserProfile {
  return {
    profileId: "PROFILE-LOCAL",
    personalInformation: {
      fullName: "",
      email: "",
      phone: "",
      location: "",
    },
    careerHistory: [newCareerEntry(0)],
    education: [newEducationEntry(0)],
  };
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCareerEntry(
  value: unknown,
  index: number,
): CareerEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<CareerEntry>;
  const role = asTrimmedString(entry.role);
  return {
    experienceId:
      asTrimmedString(entry.experienceId) ||
      `EXP-${String(index + 1).padStart(3, "0")}`,
    companyName: asTrimmedString(entry.companyName),
    ...(role ? { role } : { role: "" }),
    startDate: asTrimmedString(entry.startDate),
    endDate: asTrimmedString(entry.endDate),
  };
}

function normalizeEducationEntry(
  value: unknown,
  index: number,
): UserProfile["education"][number] | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<UserProfile["education"][number]>;
  return {
    educationId:
      asTrimmedString(entry.educationId) ||
      `EDU-${String(index + 1).padStart(3, "0")}`,
    institution: asTrimmedString(entry.institution),
    degree: asTrimmedString(entry.degree),
    field: asTrimmedString(entry.field),
    startDate: asTrimmedString(entry.startDate),
    endDate: asTrimmedString(entry.endDate),
  };
}

export function normalizeStoredProfile(value: unknown): UserProfile | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<UserProfile>;
  const personal = raw.personalInformation;
  if (!personal || typeof personal !== "object") return null;

  const careerHistory = Array.isArray(raw.careerHistory)
    ? raw.careerHistory
        .map((entry, index) => normalizeCareerEntry(entry, index))
        .filter((entry): entry is CareerEntry => entry !== null)
    : [];
  const education = Array.isArray(raw.education)
    ? raw.education
        .map((entry, index) => normalizeEducationEntry(entry, index))
        .filter(
          (entry): entry is UserProfile["education"][number] => entry !== null,
        )
    : [];

  const linkedin = asTrimmedString(
    (personal as { linkedin?: unknown }).linkedin,
  );
  const portfolio = asTrimmedString(
    (personal as { portfolio?: unknown }).portfolio,
  );

  return {
    profileId: asTrimmedString(raw.profileId) || "PROFILE-LOCAL",
    personalInformation: {
      fullName: asTrimmedString(personal.fullName),
      email: asTrimmedString(personal.email),
      phone: asTrimmedString(personal.phone),
      location: asTrimmedString(personal.location),
      ...(linkedin ? { linkedin } : {}),
      ...(portfolio ? { portfolio } : {}),
    },
    careerHistory: careerHistory.length > 0 ? careerHistory : [newCareerEntry(0)],
    education: education.length > 0 ? education : [newEducationEntry(0)],
  };
}

export function loadSavedProfile(username?: string | null): {
  profile: UserProfile;
  savedAt: string;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(savedProfileStorageKey(username));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedProfileRecord>;
    const profile = normalizeStoredProfile(parsed.profile);
    if (!profile) return null;
    return {
      profile,
      savedAt:
        typeof parsed.savedAt === "string" && parsed.savedAt
          ? parsed.savedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveProfileToStorage(
  profile: UserProfile,
  username?: string | null,
): {
  savedAt: string;
  profile: UserProfile;
} {
  if (typeof window === "undefined") {
    throw new Error("Profile can only be saved in the browser.");
  }
  const normalized = normalizeStoredProfile(profile) ?? createEmptyProfile();
  const savedAt = new Date().toISOString();
  const record: SavedProfileRecord = {
    version: 1,
    savedAt,
    profile: normalized,
  };
  window.localStorage.setItem(
    savedProfileStorageKey(username),
    JSON.stringify(record),
  );
  return { savedAt, profile: normalized };
}

export function clearSavedProfile(username?: string | null): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(savedProfileStorageKey(username));
}
