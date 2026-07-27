import { z } from "zod";

/**
 * Canonical engineering stack identifiers used across generation engines.
 * Existing AI/ML families remain first-class; additional stacks are additive.
 */
export const EngineeringStackIdSchema = z.enum([
  "ai-ml",
  "backend",
  "frontend",
  "full-stack",
  "data-engineering",
  "data-science",
  "cloud",
  "devops-platform",
  "cybersecurity",
  "mobile",
  "qa-test-automation",
  "database",
  "embedded",
  "blockchain",
  "general-software",
]);
export type EngineeringStackId = z.infer<typeof EngineeringStackIdSchema>;

export const StackSignalEvidenceSchema = z.object({
  phrase: z.string().min(1),
  weight: z.number(),
  startIndex: z.number().int().nonnegative().optional(),
});
export type StackSignalEvidence = z.infer<typeof StackSignalEvidenceSchema>;

export const StackScoreSchema = z.object({
  stackId: EngineeringStackIdSchema,
  score: z.number().nonnegative(),
  evidence: z.array(StackSignalEvidenceSchema),
});
export type StackScore = z.infer<typeof StackScoreSchema>;

/**
 * Additive metadata describing which engineering stacks a JD targets.
 * Original generation outputs remain valid when this field is omitted.
 */
export const StackContextSchema = z.object({
  primaryStack: EngineeringStackIdSchema,
  secondaryStacks: z.array(EngineeringStackIdSchema),
  scores: z.array(StackScoreSchema),
  confidence: z.number().min(0).max(1),
  detectorVersion: z.string().min(1),
});
export type StackContext = z.infer<typeof StackContextSchema>;
