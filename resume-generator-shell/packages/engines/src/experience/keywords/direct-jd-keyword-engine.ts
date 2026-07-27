import type { JobDescription } from "@resume/contracts";
import type { BulletPlanItem } from "../types/bullet-plan";
import type { DirectKeywordEvidence } from "../types/keyword-package";
import type { JDRequirement } from "../types/requirement";
import {
  DIRECT_JD_PHRASE_PATTERNS,
  EXPLICIT_TOOL_PATTERNS,
  type PhrasePattern,
} from "./keyword-taxonomy";
import { canonicalKeywordKey } from "./keyword-normalizer";

interface DirectKeywordCandidate extends DirectKeywordEvidence {
  canonicalKey: string;
  score: number;
}

export interface DirectKeywordSelection {
  keywords: string[];
  evidence: DirectKeywordEvidence[];
  controlledReuse: string[];
}

const LEADING_NOISE = /^(?:(?:you(?:'ll| will)?|the successful candidate(?: will)?|this role(?: will)?|responsible for|must|should|will|required to|expected to)\s+)?(?:architect|automate|build|collaborate|communicate|coordinate|conduct|create|define|deliver|deploy|design|develop|drive|ensure|establish|evaluate|implement|improve|integrate|lead|maintain|manage|mentor|monitor|optimize|own|partner|perform|present|productionize|reduce|scale|secure|support|test|translate|troubleshoot)(?:s|ed|ing)?\s+(?:with\s+|on\s+|for\s+|to\s+)?/i;

const GENERIC_PATTERNS: readonly PhrasePattern[] = [
  { label: "action-object", pattern: /\b(?:deploy|monitor|optimize|build|design|develop|implement|integrate|lead|manage|automate|scale|secure|collaborate|communicate|conduct|perform)(?:s|ed|ing)?\s+(?:with\s+|on\s+|for\s+|to\s+)?[^.;:]{3,80}/gi },
  { label: "stakeholders", pattern: /\b(?:product|platform|engineering|business|technical|executive|customer)(?:\s+and\s+(?:product|platform|engineering|business|technical|executive|customer))*\s+stakeholders?\b/gi },
  { label: "platform-system", pattern: /\b(?:cloud|data|ml|ai|software|backend|frontend|platform)\s+(?:platforms?|systems?|services?|pipelines?|applications?|infrastructure)\b/gi },
];

function cloneRegExp(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
}

function cleanMatchedText(value: string): string {
  return value
    .replace(/^[\s,;:()\[\]{}-]+/, "")
    .replace(/[\s,;:()\[\]{}.-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceOffsetForRequirement(requirement: JDRequirement): number {
  return requirement.evidence[0]?.startIndex ?? 0;
}

function collectPatternCandidates(
  requirement: JDRequirement,
  patterns: readonly PhrasePattern[],
  baseScore: number,
): DirectKeywordCandidate[] {
  const candidates: DirectKeywordCandidate[] = [];
  const offset = sourceOffsetForRequirement(requirement);

  for (const definition of patterns) {
    const pattern = cloneRegExp(definition.pattern);
    for (const match of requirement.sourceText.matchAll(pattern)) {
      const matched = cleanMatchedText(match[0]);
      const localStart = match.index ?? -1;
      if (!matched || localStart < 0) {
        continue;
      }
      const exactStart = requirement.sourceText.indexOf(matched, localStart);
      if (exactStart < 0) {
        continue;
      }
      const canonicalKey = canonicalKeywordKey(matched);
      if (!canonicalKey) {
        continue;
      }
      candidates.push({
        keyword: matched,
        requirementId: requirement.requirementId,
        sourceText: requirement.sourceText,
        startIndex: offset + exactStart,
        endIndex: offset + exactStart + matched.length,
        canonicalKey,
        score: baseScore + Math.min(20, matched.split(/\s+/).length * 2),
      });
    }
  }

  return candidates;
}

function fallbackCandidate(requirement: JDRequirement): DirectKeywordCandidate | null {
  const source = requirement.sourceText.trim().replace(/[.?!]+$/, "");
  if (!source) {
    return null;
  }

  const stripped = source.replace(LEADING_NOISE, "").trim();
  const candidateText = cleanMatchedText(
    stripped.length >= 3 && stripped.length <= 100 ? stripped : source,
  );
  if (!candidateText) {
    return null;
  }

  const localStart = requirement.sourceText.toLocaleLowerCase().indexOf(
    candidateText.toLocaleLowerCase(),
  );
  if (localStart < 0) {
    return null;
  }

  const keyword = requirement.sourceText.slice(
    localStart,
    localStart + candidateText.length,
  );
  const canonicalKey = canonicalKeywordKey(keyword);
  if (!canonicalKey) {
    return null;
  }

  const offset = sourceOffsetForRequirement(requirement);
  return {
    keyword,
    requirementId: requirement.requirementId,
    sourceText: requirement.sourceText,
    startIndex: offset + localStart,
    endIndex: offset + localStart + keyword.length,
    canonicalKey,
    score: 25,
  };
}

function semanticOverlap(left: string, right: string): number {
  const leftTokens = new Set(left.split("|").filter(Boolean));
  const rightTokens = new Set(right.split("|").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function dedupeCandidates(candidates: DirectKeywordCandidate[]): DirectKeywordCandidate[] {
  const bestByKey = new Map<string, DirectKeywordCandidate>();
  for (const candidate of candidates) {
    const existing = bestByKey.get(candidate.canonicalKey);
    if (!existing || candidate.score > existing.score) {
      bestByKey.set(candidate.canonicalKey, candidate);
    }
  }

  const ordered = [...bestByKey.values()].sort(
    (left, right) =>
      right.score - left.score ||
      left.keyword.length - right.keyword.length ||
      left.keyword.localeCompare(right.keyword),
  );
  const selected: DirectKeywordCandidate[] = [];
  for (const candidate of ordered) {
    const nearDuplicateIndex = selected.findIndex(
      (existing) =>
        existing.requirementId === candidate.requirementId &&
        semanticOverlap(existing.canonicalKey, candidate.canonicalKey) >= 0.75,
    );
    if (nearDuplicateIndex < 0) {
      selected.push(candidate);
      continue;
    }

    const existing = selected[nearDuplicateIndex];
    if (
      existing &&
      candidate.keyword.length < existing.keyword.length &&
      candidate.score >= existing.score - 10
    ) {
      selected[nearDuplicateIndex] = candidate;
    }
  }

  return selected.sort(
    (left, right) =>
      right.score - left.score ||
      left.keyword.length - right.keyword.length ||
      left.keyword.localeCompare(right.keyword),
  );
}

export class DirectJDKeywordEngine {
  select(input: {
    jobDescription: JobDescription;
    plan: BulletPlanItem;
    requirementsById: ReadonlyMap<string, JDRequirement>;
    usedCanonicalKeys: ReadonlySet<string>;
    maximumKeywords?: number;
  }): DirectKeywordSelection {
    const maximumKeywords = input.maximumKeywords ?? 2;
    const primary = input.requirementsById.get(input.plan.requirementId);
    if (!primary) {
      throw new Error(`Direct keyword allocation cannot find ${input.plan.requirementId}.`);
    }

    const requirementIds = [
      primary.requirementId,
      ...input.plan.supportingRequirementIds,
    ];
    const requirements = requirementIds
      .map((requirementId) => input.requirementsById.get(requirementId))
      .filter((requirement): requirement is JDRequirement => Boolean(requirement));

    const candidates = dedupeCandidates(
      requirements.flatMap((requirement) => {
        const normalizedTokens = new Set(
          canonicalKeywordKey(requirement.normalizedText).split("|").filter(Boolean),
        );
        const toolMatches =
          requirement.category === "tool-or-platform" ||
          requirement.category === "technical-skill"
            ? collectPatternCandidates(requirement, EXPLICIT_TOOL_PATTERNS, 65)
            : [];
        const matches = [
          ...collectPatternCandidates(requirement, DIRECT_JD_PHRASE_PATTERNS, 80),
          ...toolMatches,
          ...collectPatternCandidates(requirement, GENERIC_PATTERNS, 45),
        ].map((candidate) => {
          const candidateTokens = candidate.canonicalKey.split("|").filter(Boolean);
          const overlap = candidateTokens.filter((token) => normalizedTokens.has(token)).length;
          return {
            ...candidate,
            score: candidate.score + Math.min(48, overlap * 16),
          };
        });
        const fallback = fallbackCandidate(requirement);
        const alignedFallback = fallback
          ? {
              ...fallback,
              score:
                fallback.score +
                Math.min(
                  32,
                  fallback.canonicalKey
                    .split("|")
                    .filter((token) => normalizedTokens.has(token)).length * 8,
                ),
            }
          : null;
        return alignedFallback ? [...matches, alignedFallback] : matches;
      }),
    );

    if (candidates.length === 0) {
      throw new Error(`No JD-grounded direct keyword could be extracted for ${input.plan.bulletId}.`);
    }

    const unused = candidates.filter(
      (candidate) => !input.usedCanonicalKeys.has(candidate.canonicalKey),
    );
    const selected: DirectKeywordCandidate[] = [];

    // Communication and leadership plans often combine a technical primary
    // requirement with a supporting people/leadership requirement. Reserve one
    // direct phrase for that supporting requirement so the final bullet cannot
    // silently lose the JD's collaboration or leadership signal.
    if (
      maximumKeywords >= 2 &&
      input.plan.supportingRequirementIds.length > 0
    ) {
      const supportingIds = new Set(input.plan.supportingRequirementIds);
      const supportingCandidate = unused.find(
        (candidate) => supportingIds.has(candidate.requirementId),
      ) ?? candidates.find(
        (candidate) => supportingIds.has(candidate.requirementId),
      );
      if (supportingCandidate) {
        selected.push(supportingCandidate);
      }
    }

    for (const candidate of unused) {
      if (selected.length >= maximumKeywords) {
        break;
      }
      if (selected.some((item) => item.canonicalKey === candidate.canonicalKey)) {
        continue;
      }
      selected.push(candidate);
    }

    // Reuse direct JD wording only when no unused grounded phrase remains at
    // all. The requested count is a maximum, not a reason to stuff a second
    // repeated keyword into the package.
    if (selected.length === 0) {
      const fallback = candidates[0];
      if (fallback) {
        selected.push(fallback);
      }
    }

    const controlledReuse = selected
      .filter((candidate) => input.usedCanonicalKeys.has(candidate.canonicalKey))
      .map((candidate) => candidate.keyword);

    for (const candidate of selected) {
      const actual = input.jobDescription.rawText.slice(
        candidate.startIndex,
        candidate.endIndex,
      );
      if (actual.toLocaleLowerCase() !== candidate.keyword.toLocaleLowerCase()) {
        throw new Error(
          `Direct keyword evidence range is invalid for "${candidate.keyword}" in ${input.plan.bulletId}.`,
        );
      }
    }

    return {
      keywords: selected.map((candidate) => candidate.keyword),
      evidence: selected.map(({ canonicalKey: _canonicalKey, score: _score, ...evidence }) => evidence),
      controlledReuse,
    };
  }
}
