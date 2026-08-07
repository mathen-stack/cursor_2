import type {
  BaseResumeExtracted,
  UserProfile,
} from "@resume/contracts";
import { createEmptyProfile } from "./saved-profile-store";

type PersonalInformation = UserProfile["personalInformation"];

/**
 * Maps an extracted base resume into the UserProfile shape used by the
 * existing generation pipeline (so all bullet quality rules still apply).
 *
 * Identification / contact fields always come from the signed-in user's
 * saved profile when provided — never from the uploaded resume's header.
 */
export function baseResumeToUserProfile(
  extracted: BaseResumeExtracted,
  options?: {
    profileId?: string;
    /** User's saved personal info — replaces uploaded resume identity. */
    identityFrom?: PersonalInformation | null;
  },
): UserProfile {
  const empty = createEmptyProfile();
  const profileId = options?.profileId ?? "PROFILE-FROM-BASE-RESUME";
  const identity = options?.identityFrom;

  const careerHistory =
    extracted.experiences.length > 0
      ? extracted.experiences.map((entry, index) => ({
          experienceId: entry.experienceId || `EXP-${String(index + 1).padStart(3, "0")}`,
          companyName: entry.companyName || "Company",
          ...(entry.role?.trim() ? { role: entry.role.trim() } : {}),
          startDate: entry.startDate || "2018",
          endDate: entry.endDate || "Present",
        }))
      : empty.careerHistory;

  const education =
    extracted.education.length > 0
      ? extracted.education.map((entry, index) => ({
          educationId: entry.educationId || `EDU-${String(index + 1).padStart(3, "0")}`,
          institution: entry.institution || "University",
          degree: entry.degree || "Degree",
          field: entry.field || "General Studies",
          startDate: entry.startDate || "2012",
          endDate: entry.endDate || "2016",
        }))
      : empty.education;

  // Never copy name/email/phone/location/links from the uploaded resume.
  const personalInformation: PersonalInformation = {
    fullName: identity?.fullName?.trim() || "Candidate",
    email: identity?.email?.trim() || "candidate@example.com",
    phone: identity?.phone?.trim() || "+1 555 000 0000",
    location: identity?.location?.trim() || "Remote",
    ...(identity?.linkedin?.trim()
      ? { linkedin: identity.linkedin.trim() }
      : {}),
    ...(identity?.portfolio?.trim()
      ? { portfolio: identity.portfolio.trim() }
      : {}),
  };

  return {
    profileId,
    personalInformation,
    careerHistory,
    education,
  };
}
