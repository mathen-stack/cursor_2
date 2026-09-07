import type { CandidateProfile } from "./types";

export function createBlankProfile(email = ""): CandidateProfile {
  return {
    headline: "",
    personal: {
      name: "",
      phone: "",
      linkedin: "",
      email,
      location: "",
    },
    experiences: [{ company: "", title: "", period: "", location: "" }],
    education: [{ school: "", degree: "", period: "", location: "" }],
  };
}

/** Example data users can load while filling their profile. */
export const SAMPLE_PROFILE: CandidateProfile = {
  headline: "Senior Software Engineer",
  personal: {
    name: "Saul D. Trujillo",
    phone: "+57 313 6512121",
    linkedin: "https://www.linkedin.com/in/saul-d-trujillo-58aa623b7",
    email: "saul2001trujillo@gmail.com",
    location: "Valledupar, Colombia",
  },
  experiences: [
    {
      company: "ChartMogul",
      title: "Senior Software Engineer",
      period: "Oct 2022 – Mar 2026",
      location: "Remote",
    },
    {
      company: "Tpaga",
      title: "Software Engineer",
      period: "Aug 2017 – Aug 2022",
      location: "Remote",
    },
    {
      company: "Nearshore Software Development Agency",
      title: "Software Developer",
      period: "May 2013 – Jul 2017",
      location: "OnSite",
    },
  ],
  education: [
    {
      school: "Universidad Popular del César",
      degree: "Bachelor of Degree in Systems Engineering",
      period: "2009 – 2013",
      location: "Valledupar, Colombia",
    },
  ],
};

export function isProfileReady(profile: CandidateProfile | null | undefined): boolean {
  if (!profile) return false;
  const name = profile.personal.name.trim();
  const hasRole = profile.experiences.some(
    (exp) => exp.company.trim() && exp.title.trim(),
  );
  return Boolean(name && hasRole);
}

export function compactProfile(profile: CandidateProfile): CandidateProfile {
  return {
    headline: profile.headline.trim(),
    personal: {
      name: profile.personal.name.trim(),
      phone: profile.personal.phone.trim(),
      linkedin: profile.personal.linkedin.trim(),
      email: profile.personal.email.trim(),
      location: profile.personal.location.trim(),
    },
    experiences: profile.experiences.filter(
      (exp) =>
        exp.company.trim() ||
        exp.title.trim() ||
        exp.period.trim() ||
        exp.location.trim(),
    ),
    education: profile.education.filter(
      (edu) =>
        edu.school.trim() ||
        edu.degree.trim() ||
        edu.period.trim() ||
        edu.location.trim(),
    ),
  };
}
