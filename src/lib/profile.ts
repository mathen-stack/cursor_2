import type {
  CandidateProfile,
  EducationInput,
  ExperienceInput,
  PersonalInfo,
} from "./types";

export function emptyPersonal(): PersonalInfo {
  return {
    name: "",
    phone: "",
    linkedin: "",
    email: "",
    location: "",
  };
}

export function emptyExperience(): ExperienceInput {
  return {
    company: "",
    title: "",
    period: "",
    location: "",
  };
}

export function emptyEducation(): EducationInput {
  return {
    school: "",
    degree: "",
    period: "",
    location: "",
  };
}

export function emptyProfile(): CandidateProfile {
  return {
    personal: emptyPersonal(),
    experiences: [emptyExperience()],
    education: [emptyEducation()],
  };
}

export function normalizeProfile(profile: CandidateProfile): CandidateProfile {
  const personal: PersonalInfo = {
    name: profile.personal.name.trim(),
    phone: profile.personal.phone.trim(),
    linkedin: profile.personal.linkedin.trim(),
    email: profile.personal.email.trim(),
    location: profile.personal.location.trim(),
  };

  const experiences = profile.experiences
    .map((exp) => ({
      company: exp.company.trim(),
      title: exp.title.trim(),
      period: exp.period.trim(),
      location: exp.location.trim(),
    }))
    .filter((exp) => exp.company || exp.title || exp.period || exp.location);

  const education = profile.education
    .map((edu) => ({
      school: edu.school.trim(),
      degree: edu.degree.trim(),
      period: edu.period.trim(),
      location: edu.location.trim(),
    }))
    .filter((edu) => edu.school || edu.degree || edu.period || edu.location);

  return { personal, experiences, education };
}

export function isExperienceComplete(exp: ExperienceInput): boolean {
  return Boolean(
    exp.company.trim() &&
      exp.title.trim() &&
      exp.period.trim() &&
      exp.location.trim(),
  );
}

export function isEducationComplete(edu: EducationInput): boolean {
  return Boolean(
    edu.school.trim() &&
      edu.degree.trim() &&
      edu.period.trim() &&
      edu.location.trim(),
  );
}

export function isProfileReady(profile: CandidateProfile): boolean {
  const normalized = normalizeProfile(profile);
  if (normalized.personal.name.length < 2) return false;
  if (!normalized.experiences.some(isExperienceComplete)) return false;
  if (
    normalized.education.length > 0 &&
    !normalized.education.every(isEducationComplete)
  ) {
    return false;
  }
  return true;
}
