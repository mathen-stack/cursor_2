import { z } from "zod";

export const EvidenceStrengthSchema = z.enum([
  "strong",
  "moderate",
  "weak",
  "keyword-only",
  "not-found",
  "conflicting",
]);
export type EvidenceStrength = z.infer<typeof EvidenceStrengthSchema>;

export const EvidenceClaimKindSchema = z.enum([
  "skill",
  "tool",
  "metric",
  "responsibility",
  "project",
  "result",
  "title",
  "employer",
  "date-range",
  "other",
]);
export type EvidenceClaimKind = z.infer<typeof EvidenceClaimKindSchema>;

export const EvidenceSectionIdSchema = z.enum([
  "summary",
  "skills",
  "experience",
  "education",
  "projects",
  "other",
]);
export type EvidenceSectionId = z.infer<typeof EvidenceSectionIdSchema>;

export const SourceEvidenceSpanSchema = z.object({
  sectionId: EvidenceSectionIdSchema,
  sourceText: z.string().min(1),
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().positive(),
  employerHint: z.string().optional(),
  titleHint: z.string().optional(),
});
export type SourceEvidenceSpan = z.infer<typeof SourceEvidenceSpanSchema>;

export const SourceEvidenceClaimSchema = z.object({
  claimId: z.string().min(1),
  kind: EvidenceClaimKindSchema,
  text: z.string().min(1),
  normalizedText: z.string().min(1),
  strength: EvidenceStrengthSchema,
  span: SourceEvidenceSpanSchema,
  jdRelevant: z.boolean(),
  usableForFacts: z.boolean(),
  notes: z.array(z.string()).default([]),
});
export type SourceEvidenceClaim = z.infer<typeof SourceEvidenceClaimSchema>;

export const EvidenceTargetSectionSchema = z.enum([
  "summary",
  "skills",
  "experience",
]);
export type EvidenceTargetSection = z.infer<typeof EvidenceTargetSectionSchema>;

export const EvidenceProposalDecisionSchema = z.enum([
  "accepted",
  "rejected",
]);
export type EvidenceProposalDecision = z.infer<
  typeof EvidenceProposalDecisionSchema
>;

export const EvidenceRejectionReasonSchema = z.enum([
  "fails-truthfulness",
  "missing-source-span",
  "conflicting-source",
  "jd-used-as-candidate-proof",
  "not-jd-relevant",
  "keyword-only-too-weak",
  "existing-validator-rejected",
  "would-mutate-employment-history",
  "would-invent-content",
  "style-or-formatting-failed",
  "keeps-original-on-failure",
]);
export type EvidenceRejectionReason = z.infer<
  typeof EvidenceRejectionReasonSchema
>;

export const EvidenceProposalSchema = z.object({
  proposalId: z.string().min(1),
  targetSection: EvidenceTargetSectionSchema,
  claimIds: z.array(z.string().min(1)),
  description: z.string().min(1),
  beforeText: z.string(),
  afterText: z.string(),
  decision: EvidenceProposalDecisionSchema,
  rejectionReasons: z.array(EvidenceRejectionReasonSchema).default([]),
  provenance: z.array(SourceEvidenceSpanSchema).default([]),
});
export type EvidenceProposal = z.infer<typeof EvidenceProposalSchema>;

export const SourceEvidenceBundleSchema = z.object({
  bundleId: z.string().min(1),
  sourceResumeHash: z.string().min(1),
  normalizedText: z.string(),
  claims: z.array(SourceEvidenceClaimSchema),
  extractedAt: z.string().datetime(),
  extractorVersion: z.string().min(1),
});
export type SourceEvidenceBundle = z.infer<typeof SourceEvidenceBundleSchema>;

/**
 * Additive audit trail. Never mutates assembled resume section content by itself.
 */
export const EvidenceEnhancementReportSchema = z.object({
  reportId: z.string().min(1),
  engineName: z.literal("source-evidence-enhancement-engine"),
  engineVersion: z.string().min(1),
  sourceResumeHash: z.string().min(1),
  bundle: SourceEvidenceBundleSchema,
  proposals: z.array(EvidenceProposalSchema),
  acceptedProposalIds: z.array(z.string()),
  rejectedProposalIds: z.array(z.string()),
  originalBehaviorPreservedWhenRejected: z.literal(true),
  ruleHierarchy: z.array(z.string()).min(6),
  createdAt: z.string().datetime(),
});
export type EvidenceEnhancementReport = z.infer<
  typeof EvidenceEnhancementReportSchema
>;

export const RULE_HIERARCHY = [
  "1. Truthfulness and anti-fabrication",
  "2. Source-resume factual grounding",
  "3. Existing resume-generation rules",
  "4. Job-description relevance",
  "5. Evidence enhancement",
  "6. Style and formatting",
] as const;
