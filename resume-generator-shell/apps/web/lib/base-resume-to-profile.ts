import type { BaseResumeExtracted, UserProfile } from "@resume/contracts";
import { createEmptyProfile } from "./saved-profile-store";

/**
 * Maps an extracted base resume into the UserProfile shape used by the
 * existing generation pipeline (so all bullet quality rules still apply).
 */
export function baseResumeToUserProfile(
  extracted: BaseResumeExtracted,
  profileId = "PROFILE-FROM-BASE-RESUME",
): UserProfile {
  const empty = createEmptyProfile();
  const personal = extracted.personalInformation;

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

  return {
    profileId,
    personalInformation: {
      fullName: personal.fullName?.trim() || empty.personalInformation.fullName || "Candidate",
      email: personal.email?.trim() || "candidate@example.com",
      phone: personal.phone?.trim() || "+1 555 000 0000",
      location: personal.location?.trim() || "Remote",
      ...(personal.linkedin?.trim() ? { linkedin: personal.linkedin.trim() } : {}),
      ...(personal.portfolio?.trim() ? { portfolio: personal.portfolio.trim() } : {}),
    },
    careerHistory,
    education,
  };
}
