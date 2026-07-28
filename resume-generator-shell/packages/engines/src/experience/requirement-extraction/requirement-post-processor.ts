import type {
  JDRequirement,
  RequirementEvidence,
  RequirementNecessity,
  RequirementPriority,
} from "../types/requirement";
import type { RequirementCandidate } from "./candidate-schema";
import {
  atomizeCandidate,
  inferCategory,
  inferNecessity,
  inferPriority,
  containsTool,
  TOOL_NAMES,
} from "./requirement-heuristics";

interface WorkingRequirement {
  sourceText: string;
  normalizedText: string;
  category: JDRequirement["category"];
  priority: RequirementPriority;
  necessity: RequirementNecessity;
  evidence: RequirementEvidence[];
  firstIndex: number;
}

const PRIORITY_RANK: Record<RequirementPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const NECESSITY_RANK: Record<RequirementNecessity, number> = {
  required: 3,
  preferred: 2,
  implied: 1,
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "within",
  "using",
  "experience",
  "proficiency",
  "knowledge",
  "expertise",
  "familiarity",
]);

const TOKEN_SYNONYMS: Record<string, string> = {
  deployed: "deploy",
  deploying: "deploy",
  deployment: "deploy",
  deploys: "deploy",
  productionized: "deploy",
  productionize: "deploy",
  productionizing: "deploy",
  monitored: "monitor",
  monitoring: "monitor",
  monitors: "monitor",
  optimized: "optimize",
  optimizing: "optimize",
  optimization: "optimize",
  scalable: "scale",
  scalability: "scale",
  scaled: "scale",
  collaborated: "collaborate",
  collaboration: "collaborate",
  collaborating: "collaborate",
  communicated: "communicate",
  communication: "communicate",
  led: "lead",
  leading: "lead",
  leadership: "lead",
  built: "build",
  building: "build",
  developed: "develop",
  developing: "develop",
  implemented: "implement",
  implementing: "implement",
  designed: "design",
  designing: "design",
  machine: "ml",
  learning: "ml",
};

function normalizeToken(token: string): string {
  const lower = token.toLowerCase();
  const mapped = TOKEN_SYNONYMS[lower];
  if (mapped) {
    return mapped;
  }
  if (lower.endsWith("ies") && lower.length > 4) {
    return `${lower.slice(0, -3)}y`;
  }
  if (lower.endsWith("ing") && lower.length > 5) {
    return lower.slice(0, -3);
  }
  if (lower.endsWith("ed") && lower.length > 4) {
    return lower.slice(0, -2);
  }
  if (lower.endsWith("s") && lower.length > 3) {
    return lower.slice(0, -1);
  }
  return lower;
}

function isKnownToolToken(token: string): boolean {
  return TOOL_NAMES.some(
    (tool) => tool.toLowerCase() === token.toLowerCase(),
  );
}

function isMeaningfulToken(token: string): boolean {
  if (STOP_WORDS.has(token)) {
    return false;
  }
  // Preserve single-character tools such as "R" that would otherwise be
  // discarded by the length > 1 filter and abort generation.
  if (isKnownToolToken(token)) {
    return true;
  }
  return token.length > 1;
}

function semanticKey(requirement: WorkingRequirement): string {
  const phrase = requirement.normalizedText
    .toLowerCase()
    .replace(/machine learning/g, "ml")
    .replace(/cross[- ]functional/g, "crossfunctional");

  const tokens = (phrase.match(/[a-z0-9+#]+(?:[.-][a-z0-9+#]+)*/g) ?? [])
    .map(normalizeToken)
    .filter(isMeaningfulToken);

  const unique = [...new Set(tokens)].sort();
  return `${requirement.category}:${unique.join("|")}`;
}

function findEvidence(jobDescription: string, sourceText: string): RequirementEvidence[] {
  const evidence: RequirementEvidence[] = [];
  let fromIndex = 0;

  while (fromIndex <= jobDescription.length) {
    const startIndex = jobDescription.indexOf(sourceText, fromIndex);
    if (startIndex < 0) {
      break;
    }
    evidence.push({
      sourceText,
      startIndex,
      endIndex: startIndex + sourceText.length,
    });
    fromIndex = startIndex + Math.max(sourceText.length, 1);
  }

  if (evidence.length === 0) {
    throw new Error(
      `Requirement evidence is not present verbatim in the original JD: "${sourceText}"`,
    );
  }

  return evidence;
}

function lexicalTokens(value: string): Set<string> {
  const phrase = value
    .toLowerCase()
    .replace(/machine learning/g, "ml")
    .replace(/cross[- ]functional/g, "crossfunctional");

  return new Set(
    (phrase.match(/[a-z0-9+#]+(?:[.-][a-z0-9+#]+)*/g) ?? [])
      .map(normalizeToken)
      .filter(isMeaningfulToken),
  );
}

function toolFamilyStem(token: string): string {
  return token.toLowerCase().replace(/\.(?:js|ts|tsx|jsx)$/i, "");
}

function tokensOverlap(
  normalizedTokens: ReadonlySet<string>,
  sourceTokens: ReadonlySet<string>,
): string[] {
  return [...normalizedTokens].filter((token) => {
    if (sourceTokens.has(token)) {
      return true;
    }
    const stem = toolFamilyStem(token);
    if (stem.length < 2) {
      return false;
    }
    return [...sourceTokens].some(
      (sourceToken) => toolFamilyStem(sourceToken) === stem,
    );
  });
}

function assertNormalizedTextGrounded(candidate: RequirementCandidate): void {
  const sourceTokens = lexicalTokens(candidate.sourceText);
  const normalizedTokens = lexicalTokens(candidate.normalizedText);

  if (normalizedTokens.size === 0) {
    throw new Error("Requirement normalizedText contains no meaningful terms.");
  }

  const overlap = tokensOverlap(normalizedTokens, sourceTokens);

  if (overlap.length === 0) {
    throw new Error(
      `Requirement interpretation is not lexically grounded in its JD evidence: "${candidate.normalizedText}".`,
    );
  }
}

function hasMeaningfulNormalizedText(candidate: RequirementCandidate): boolean {
  return lexicalTokens(candidate.normalizedText).size > 0;
}

function assertNoHallucinatedKnownTools(
  jobDescription: string,
  candidate: RequirementCandidate,
): void {
  const unsupported = TOOL_NAMES.filter(
    (tool) =>
      containsTool(candidate.normalizedText, tool) &&
      !containsTool(jobDescription, tool),
  );

  if (unsupported.length > 0) {
    throw new Error(
      `Requirement contains technology not supported by the JD: ${unsupported.join(", ")}.`,
    );
  }
}

function strongerPriority(
  left: RequirementPriority,
  right: RequirementPriority,
): RequirementPriority {
  return PRIORITY_RANK[left] >= PRIORITY_RANK[right] ? left : right;
}

function strongerNecessity(
  left: RequirementNecessity,
  right: RequirementNecessity,
): RequirementNecessity {
  return NECESSITY_RANK[left] >= NECESSITY_RANK[right] ? left : right;
}

function uniqueEvidence(evidence: RequirementEvidence[]): RequirementEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.startIndex}:${item.endIndex}:${item.sourceText}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function postProcessRequirementCandidates(
  candidates: RequirementCandidate[],
  originalJobDescription: string,
): JDRequirement[] {
  if (originalJobDescription.trim().length < 20) {
    throw new Error("Job description is empty or too short for extraction.");
  }

  const working: WorkingRequirement[] = [];

  for (const candidate of candidates) {
    // Skip stop-word-only / empty interpretations (e.g. "Experience." or
    // tool phrases that collapse after tokenization) instead of failing the
    // entire resume generation when other grounded requirements remain.
    if (!hasMeaningfulNormalizedText(candidate)) {
      continue;
    }

    const evidence = findEvidence(originalJobDescription, candidate.sourceText);
    assertNoHallucinatedKnownTools(originalJobDescription, candidate);
    assertNormalizedTextGrounded(candidate);

    for (const atomic of atomizeCandidate(candidate)) {
      if (!hasMeaningfulNormalizedText(atomic)) {
        continue;
      }

      const inferredNecessity = inferNecessity(atomic.sourceText);
      const necessity = strongerNecessity(atomic.necessity, inferredNecessity);
      const inferredPriority = inferPriority(atomic.sourceText, necessity);

      working.push({
        sourceText: atomic.sourceText,
        normalizedText: atomic.normalizedText,
        category: inferCategory(atomic.normalizedText),
        priority: strongerPriority(atomic.priority, inferredPriority),
        necessity,
        evidence: evidence.map((item) => ({ ...item })),
        firstIndex: evidence[0]?.startIndex ?? Number.MAX_SAFE_INTEGER,
      });
    }
  }

  const deduplicated = new Map<string, WorkingRequirement>();
  for (const requirement of working) {
    const key = semanticKey(requirement);
    const existing = deduplicated.get(key);
    if (!existing) {
      deduplicated.set(key, requirement);
      continue;
    }

    existing.priority = strongerPriority(existing.priority, requirement.priority);
    existing.necessity = strongerNecessity(
      existing.necessity,
      requirement.necessity,
    );
    existing.evidence = uniqueEvidence([
      ...existing.evidence,
      ...requirement.evidence,
    ]);
    existing.firstIndex = Math.min(existing.firstIndex, requirement.firstIndex);
  }

  const sorted = [...deduplicated.values()].sort(
    (left, right) =>
      left.firstIndex - right.firstIndex ||
      left.normalizedText.localeCompare(right.normalizedText),
  );

  if (sorted.length === 0) {
    throw new Error("No evidence-grounded atomic requirements were extracted.");
  }

  return sorted.map((requirement, index) => ({
    requirementId: `REQ-${String(index + 1).padStart(3, "0")}`,
    sourceText: requirement.sourceText,
    normalizedText: requirement.normalizedText,
    category: requirement.category,
    priority: requirement.priority,
    necessity: requirement.necessity,
    evidence: requirement.evidence.map((item) => ({ ...item })),
  }));
}
