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

const DANGLING_TAIL = /^(?:a|an|and|as|at|by|for|from|in|into|of|on|or|the|to|with|using|via|across|through|over|under|between|within|without|per|vs|versus)$/i;

const GENERIC_PATTERNS: readonly PhrasePattern[] = [
  {
    label: "action-object",
    // Bound to complete words (max 8) so the matcher cannot truncate mid-token
    // at a fixed character budget like "polished user in".
    pattern:
      /\b(?:deploy|monitor|optimize|build|design|develop|implement|integrate|lead|manage|automate|scale|secure|collaborate|communicate|conduct|perform)(?:s|ed|ing)?\s+(?:with\s+|on\s+|for\s+|to\s+)?[A-Za-z][\w.+#/-]*(?:\s+[A-Za-z][\w.+#/-]*){0,7}/gi,
  },
  { label: "stakeholders", pattern: /\b(?:product|platform|engineering|business|technical|executive|customer)(?:\s+and\s+(?:product|platform|engineering|business|technical|executive|customer))*\s+stakeholders?\b/gi },
  { label: "platform-system", pattern: /\b(?:cloud|data|ml|ai|software|backend|frontend|front-end|platform)\s+(?:platforms?|systems?|services?|pipelines?|applications?|infrastructure|experiences?)\b/gi },
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

function finalizeKeywordPhrase(value: string): string | null {
  const words = cleanMatchedText(value)
    .split(/\s+/)
    .map((word) =>
      word
        .replace(/^[\s,;:()\[\]{}-]+/, "")
        .replace(/[\s,;:()\[\]{}.-]+$/, ""),
    )
    .filter(Boolean)
    .slice(0, 8);
  while (words.length > 0 && DANGLING_TAIL.test(words[words.length - 1] ?? "")) {
    words.pop();
  }
  // Soft-skill JD lines often include adverbs that sentence normalization later
  // removes as weak filler; drop them from allocated keywords up front.
  const withoutWeak = words.filter(
    (word) => !/^(?:successfully|effectively|various|closely|clearly)$/i.test(word),
  );
  const chosen = withoutWeak.length >= 2 ? withoutWeak : words;
  if (chosen.length === 0) {
    return null;
  }
  if (chosen.length === 1) {
    const token = chosen[0] ?? "";
    // Keep single-token tools/products (React.js, Vitest, Git) but reject tiny remnants.
    if (!/[A-Z.]/.test(token) && token.length < 3) {
      return null;
    }
  }

  const finalized = chosen.join(" ");
  // Reject adjective-only or soft-skill fragments that produce ungrammatical
  // bullets such as "builds reliable" or "Led strong verbal ... skills".
  if (
    /^(?:strong|excellent|good|proven)\s+(?:verbal|written|communication|soft)\b/i.test(
      finalized,
    ) ||
    /^verbal and written communication skills\b/i.test(finalized)
  ) {
    return null;
  }
  if (
    /\b(?:build|builds|building|develop|develops|secure|secures)\s+(?:reliable|secure|scalable|robust|strong)\b/i.test(
      finalized,
    ) &&
    finalized.split(/\s+/).length <= 3
  ) {
    return null;
  }
  if (/^(?:closely|effectively|successfully|clearly)\b/i.test(finalized)) {
    return null;
  }
  return finalized;
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
      const matched = finalizeKeywordPhrase(match[0] ?? "");
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
  const candidateText = finalizeKeywordPhrase(
    stripped.length >= 3 && stripped.split(/\s+/).length <= 8 ? stripped : source,
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
      // When requirement-local matches are all rejected as weak fragments,
      // fall back to unused curated JD phrases so planning can still allocate
      // a grounded direct keyword without inventing unsupported wording.
      const jdFallbacks = dedupeCandidates(
        collectPatternCandidates(
          {
            ...primary,
            sourceText: input.jobDescription.rawText,
            evidence: [
              {
                sourceText: input.jobDescription.rawText,
                startIndex: 0,
                endIndex: input.jobDescription.rawText.length,
              },
            ],
          },
          [...DIRECT_JD_PHRASE_PATTERNS, ...EXPLICIT_TOOL_PATTERNS],
          40,
        ),
      );
      const unusedJdFallbacks = jdFallbacks.filter(
        (candidate) => !input.usedCanonicalKeys.has(candidate.canonicalKey),
      );
      // Prefer unused phrases. If the document-wide inventory is exhausted
      // (common for EXP-*-B-006+ on dense plans), allow controlled reuse of
      // already-claimed JD phrases instead of failing the entire generation.
      candidates.push(
        ...(unusedJdFallbacks.length > 0 ? unusedJdFallbacks : jdFallbacks).slice(
          0,
          3,
        ),
      );
    }

    if (candidates.length === 0) {
      const lastResort = fallbackCandidate(primary);
      if (lastResort) {
        candidates.push(lastResort);
      }
    }

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
