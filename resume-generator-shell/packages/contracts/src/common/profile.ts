import { z } from "zod";

export const PersonalInformationSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(3),
  location: z.string().min(1),
  linkedin: z.string().url().optional(),
  portfolio: z.string().url().optional(),
});

export const CareerEntrySchema = z.object({
  experienceId: z.string().min(1),
  companyName: z.string().min(1),
  startDate: z.string().min(4),
  endDate: z.string().min(4),
});

export const EducationEntrySchema = z.object({
  educationId: z.string().min(1),
  institution: z.string().min(1),
  degree: z.string().min(1),
  field: z.string().min(1),
  graduationDate: z.string().min(4).optional(),
});

export const UserProfileSchema = z.object({
  profileId: z.string().min(1),
  personalInformation: PersonalInformationSchema,
  careerHistory: z.array(CareerEntrySchema).min(1),
  education: z.array(EducationEntrySchema).min(1),
});

export type CareerEntry = z.infer<typeof CareerEntrySchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
