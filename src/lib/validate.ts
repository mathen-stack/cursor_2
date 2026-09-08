import { z } from "zod";
import { MIN_JOB_DESCRIPTION_CHARS } from "./limits";

export const tailorRequestSchema = z
  .object({
    jobDescriptions: z
      .array(
        z
          .string()
          .trim()
          .min(
            MIN_JOB_DESCRIPTION_CHARS,
            `Each job description must be at least ${MIN_JOB_DESCRIPTION_CHARS} characters`,
          ),
      )
      .min(1),
    indices: z.array(z.number().int().positive()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.indices && value.indices.length !== value.jobDescriptions.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "indices length must match jobDescriptions length",
        path: ["indices"],
      });
    }
  });

export function parseTailorRequest(body: unknown): {
  jobDescriptions: string[];
  indices?: number[];
} {
  return tailorRequestSchema.parse(body);
}
