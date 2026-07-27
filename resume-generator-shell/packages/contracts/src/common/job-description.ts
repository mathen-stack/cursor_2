import { z } from "zod";

export const JobDescriptionSchema = z.object({
  jdId: z.string().min(1),
  rawText: z.string().min(50),
  normalizedText: z.string().min(50),
  contentHash: z.string().min(16),
});

export type JobDescription = z.infer<typeof JobDescriptionSchema>;
