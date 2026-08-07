import { z } from "zod";

/**
 * Coerce optional profile URLs for generate/tailor:
 * - blank → omitted
 * - missing protocol → prefix https://
 * - still invalid → omitted (do not fail the whole run)
 * Valid absolute URLs are kept as-is.
 */
export function normalizeOptionalHttpUrl(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    if (!parsed.hostname.includes(".")) {
      return undefined;
    }
    // Preserve the user's trimmed form when it was already a valid URL.
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return candidate;
  } catch {
    return undefined;
  }
}

export const OptionalHttpUrlSchema = z.preprocess(
  (value) => normalizeOptionalHttpUrl(value),
  z.string().url().optional(),
);

export const PersonalInformationSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(3),
  location: z.string().min(1),
  linkedin: OptionalHttpUrlSchema,
  portfolio: OptionalHttpUrlSchema,
});

export const CareerEntrySchema = z.object({
  experienceId: z.string().min(1),
  companyName: z.string().min(1),
  /** Optional job title. When blank, role assignment auto-detects from the JD. */
  role: z.string().optional(),
  startDate: z.string().min(4),
  endDate: z.string().min(4),
});

export const EducationEntrySchema = z.object({
  educationId: z.string().min(1),
  institution: z.string().min(1),
  degree: z.string().min(1),
  field: z.string().min(1),
  startDate: z.string().min(4),
  endDate: z.string().min(4),
});

export const UserProfileSchema = z.object({
  profileId: z.string().min(1),
  personalInformation: PersonalInformationSchema,
  careerHistory: z.array(CareerEntrySchema).min(1),
  education: z.array(EducationEntrySchema).min(1),
});

export type CareerEntry = z.infer<typeof CareerEntrySchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
