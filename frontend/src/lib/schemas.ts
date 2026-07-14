import { z } from "zod"

export const experienceSchema = z.object({
  company: z.string().min(1, "Company is required"),
  role: z.string().min(1, "Role is required"),
  location: z.string(),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().min(1, "End date is required"),
  description: z.string(),
  bulletsText: z.string(),
})

export const educationSchema = z.object({
  school: z.string().min(1, "School is required"),
  degree: z.string().min(1, "Degree is required"),
  field: z.string(),
  location: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  details: z.string(),
})

export const certificationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  issuer: z.string(),
  date: z.string(),
  credential_id: z.string(),
})

export const profileFormSchema = z.object({
  full_name: z.string().min(1, "Full name is required"),
  location: z.string(),
  email: z.string().email("Valid email required"),
  phone: z.string(),
  linkedin_url: z.string(),
  summary: z.string(),
  skillsText: z.string(),
  experiences: z.array(experienceSchema).min(1).max(8),
  education: z.array(educationSchema).min(1).max(5),
  certifications: z.array(certificationSchema).max(10),
})

export type ProfileFormValues = z.infer<typeof profileFormSchema>

export const jobFormSchema = z.object({
  job_title: z.string(),
  company_name: z.string(),
  job_description: z.string().min(50, "Paste at least 50 characters of the job description"),
  resume_length: z.enum(["one_page", "two_page"]),
  tone: z.enum(["professional", "confident", "conversational", "executive"]),
  template: z.enum(["classic", "modern", "minimal"]),
  seniority_level: z.enum(["junior", "mid", "senior", "lead", "executive"]),
  prioritize_ats_keywords: z.boolean(),
})

export type JobFormValues = z.infer<typeof jobFormSchema>
