export type ResumeLength = "one_page" | "two_page"
export type Tone = "professional" | "confident" | "conversational" | "executive"
export type TemplateStyle = "classic" | "modern" | "minimal"
export type SeniorityLevel = "junior" | "mid" | "senior" | "lead" | "executive"

export interface ExperienceItem {
  company: string
  role: string
  location: string
  start_date: string
  end_date: string
  bullets: string[]
  description: string
}

export interface EducationItem {
  school: string
  degree: string
  field: string
  location: string
  start_date: string
  end_date: string
  details: string
}

export interface CertificationItem {
  name: string
  issuer: string
  date: string
  credential_id: string
}

export interface Profile {
  full_name: string
  location: string
  email: string
  phone: string
  linkedin_url: string
  summary: string
  skills: string[]
  experiences: ExperienceItem[]
  education: EducationItem[]
  certifications: CertificationItem[]
}

export interface GenerationOptions {
  resume_length: ResumeLength
  tone: Tone
  template: TemplateStyle
  seniority_level: SeniorityLevel
  prioritize_ats_keywords: boolean
}

export interface JobInput {
  job_title: string
  company_name: string
  job_description: string
}

export interface GeneratedExperience {
  company: string
  role: string
  location: string
  start_date: string
  end_date: string
  bullets: string[]
}

export interface GeneratedEducation {
  school: string
  degree: string
  field: string
  location: string
  start_date: string
  end_date: string
  details: string
}

export interface GeneratedCertification {
  name: string
  issuer: string
  date: string
}

export interface TailoredResume {
  full_name: string
  location: string
  email: string
  phone: string
  linkedin_url: string
  headline: string
  summary: string
  skills: string[]
  experiences: GeneratedExperience[]
  education: GeneratedEducation[]
  certifications: GeneratedCertification[]
}

export interface CoverLetter {
  greeting: string
  body_paragraphs: string[]
  closing: string
  signature_name: string
}

export interface GenerateResponse {
  resume: TailoredResume
  cover_letter: CoverLetter
  matched_keywords: string[]
  options: GenerationOptions
}

export const defaultOptions: GenerationOptions = {
  resume_length: "one_page",
  tone: "professional",
  template: "classic",
  seniority_level: "mid",
  prioritize_ats_keywords: true,
}

export const emptyExperience = (): ExperienceItem => ({
  company: "",
  role: "",
  location: "",
  start_date: "",
  end_date: "",
  bullets: [],
  description: "",
})

export const emptyEducation = (): EducationItem => ({
  school: "",
  degree: "",
  field: "",
  location: "",
  start_date: "",
  end_date: "",
  details: "",
})

export const emptyCertification = (): CertificationItem => ({
  name: "",
  issuer: "",
  date: "",
  credential_id: "",
})

export const defaultProfile: Profile = {
  full_name: "",
  location: "",
  email: "",
  phone: "",
  linkedin_url: "",
  summary: "",
  skills: [],
  experiences: [emptyExperience()],
  education: [emptyEducation()],
  certifications: [],
}
