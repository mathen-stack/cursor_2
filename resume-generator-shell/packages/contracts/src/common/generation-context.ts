import { z } from "zod";

export const GenerationContextSchema = z.object({
  generationId: z.string().min(1),
  profileId: z.string().min(1),
  jdId: z.string().min(1),
  jdHash: z.string().min(16),
  createdAt: z.string().datetime(),
  locale: z.string().default("en-US"),
});

export type GenerationContext = z.infer<typeof GenerationContextSchema>;

export const EngineMetadataSchema = z.object({
  generationId: z.string().min(1),
  profileId: z.string().min(1),
  jdId: z.string().min(1),
  jdHash: z.string().min(16),
  engineName: z.string().min(1),
  engineVersion: z.string().min(1),
});

export type EngineMetadata = z.infer<typeof EngineMetadataSchema>;
