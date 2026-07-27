import type {
  EvidenceRejectionReason,
  EvidenceStrength,
  SourceEvidenceClaim,
  SourceEvidenceSpan,
} from "@resume/contracts";

const USABLE_STRENGTHS: ReadonlySet<EvidenceStrength> = new Set([
  "strong",
  "moderate",
]);

/**
 * Hierarchy gate for a single evidence claim.
 * Lower-priority evidence enhancement cannot override higher rules.
 */
export function validateEvidenceClaim(input: {
  claim: SourceEvidenceClaim;
  sourceNormalizedText: string;
  allowKeywordOnly?: boolean;
}): { ok: true } | { ok: false; reasons: EvidenceRejectionReason[] } {
  const reasons: EvidenceRejectionReason[] = [];
  const { claim, sourceNormalizedText } = input;

  // 1. Truthfulness / anti-fabrication
  if (claim.strength === "not-found" || !claim.usableForFacts && !input.allowKeywordOnly) {
    if (claim.strength === "not-found") {
      reasons.push("fails-truthfulness");
    }
  }
  if (claim.strength === "conflicting") {
    reasons.push("conflicting-source");
  }

  // 2. Source-resume factual grounding
  if (!spanMatchesSource(claim.span, sourceNormalizedText)) {
    reasons.push("missing-source-span");
  }

  // 4. JD relevance (skills/tools must be JD-relevant to strengthen those sections)
  if ((claim.kind === "skill" || claim.kind === "tool") && !claim.jdRelevant) {
    reasons.push("not-jd-relevant");
  }

  // 5. Evidence enhancement strength policy
  if (!USABLE_STRENGTHS.has(claim.strength)) {
    if (claim.strength === "keyword-only") {
      if (!input.allowKeywordOnly) {
        reasons.push("keyword-only-too-weak");
      }
    } else if (claim.strength === "weak") {
      reasons.push("fails-truthfulness");
    }
  }

  if (reasons.length > 0) {
    return { ok: false, reasons: [...new Set(reasons)] };
  }
  return { ok: true };
}

export function spanMatchesSource(
  span: SourceEvidenceSpan,
  sourceNormalizedText: string,
): boolean {
  if (span.endIndex <= span.startIndex) return false;
  if (span.endIndex > sourceNormalizedText.length) return false;
  const slice = sourceNormalizedText.slice(span.startIndex, span.endIndex);
  return slice === span.sourceText;
}
