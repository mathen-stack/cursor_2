import { z } from "zod";
import type { CandidateProfile } from "./types";

const experienceSchema = z.object({
  company: z.string(),
  title: z.string(),
  period: z.string(),
  location: z.string(),
});

const educationSchema = z.object({
  school: z.string(),
  degree: z.string(),
  period: z.string(),
  location: z.string(),
});

export const candidateProfileSchema = z.object({
  headline: z.string(),
  personal: z.object({
    name: z.string(),
    phone: z.string(),
    linkedin: z.string(),
    email: z.string(),
    location: z.string(),
  }),
  experiences: z.array(experienceSchema),
  education: z.array(educationSchema),
});

export function parseCandidateProfile(body: unknown): CandidateProfile {
  return candidateProfileSchema.parse(body);
}

export const authCredentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});
