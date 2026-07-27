import type { JobDescription } from "@resume/contracts";
import type { JDRequirement } from "../types/requirement";
import type {
  CareerSeniority,
  TargetRoleAnalysis,
  TargetRoleEvidence,
} from "../types/role-assignment";
import {
  formatRoleTitle,
  ROLE_DEFINITIONS,
  type RoleDefinition,
} from "./role-taxonomy";

interface ExplicitRoleMatch {
  definition: RoleDefinition;
  text: string;
  index: number;
}

function findExplicitRole(text: string): ExplicitRoleMatch | null {
  const matches: ExplicitRoleMatch[] = [];

  for (const definition of ROLE_DEFINITIONS) {
    for (const pattern of definition.explicitPatterns) {
      const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
      const globalPattern = new RegExp(pattern.source, flags);
      for (const match of text.matchAll(globalPattern)) {
        if (match.index === undefined || !match[0]) {
          continue;
        }
        matches.push({ definition, text: match[0], index: match.index });
      }
    }
  }

  matches.sort((left, right) => {
    if (left.index !== right.index) {
      return left.index - right.index;
    }
    return right.text.length - left.text.length;
  });

  return matches[0] ?? null;
}

function scoreRoleDefinition(
  definition: RoleDefinition,
  text: string,
  requirements: readonly JDRequirement[],
): number {
  const normalized = text.toLowerCase();
  let score = 0;

  for (const signal of definition.signals) {
    const phrase = signal.phrase.toLowerCase();
    const occurrences = normalized.split(phrase).length - 1;
    score += Math.min(occurrences, 3) * signal.weight;
  }

  for (const requirement of requirements) {
    const requirementText = requirement.normalizedText.toLowerCase();
    for (const signal of definition.signals) {
      if (requirementText.includes(signal.phrase.toLowerCase())) {
        const priorityMultiplier =
          requirement.priority === "critical"
            ? 1.5
            : requirement.priority === "high"
              ? 1.25
              : 1;
        score += signal.weight * priorityMultiplier;
      }
    }
  }

  return score;
}

function inferDefinition(
  text: string,
  requirements: readonly JDRequirement[],
): { definition: RoleDefinition; score: number; runnerUpScore: number } {
  const scored = ROLE_DEFINITIONS.map((definition) => ({
    definition,
    score: scoreRoleDefinition(definition, text, requirements),
  })).sort((left, right) => right.score - left.score);

  const first = scored[0];
  if (!first) {
    throw new Error("Role taxonomy is empty.");
  }

  if (first.score === 0) {
    const fallback = ROLE_DEFINITIONS.find(
      (definition) => definition.family === "software-engineering",
    );
    if (!fallback) {
      throw new Error("Software engineering fallback role is unavailable.");
    }
    return { definition: fallback, score: 0, runnerUpScore: 0 };
  }

  return {
    definition: first.definition,
    score: first.score,
    runnerUpScore: scored[1]?.score ?? 0,
  };
}

function inferRequiredYears(text: string): number | null {
  const values: number[] = [];
  const patterns = [
    /\b(?:minimum of\s+)?(\d{1,2})\+?\s*(?:years?|yrs?)\b/gi,
    /\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:years?|yrs?)\b/gi,
  ];

  for (const match of text.matchAll(patterns[0]!)) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) {
      values.push(value);
    }
  }

  for (const match of text.matchAll(patterns[1]!)) {
    const upper = Number(match[2]);
    if (Number.isFinite(upper)) {
      values.push(upper);
    }
  }

  return values.length > 0 ? Math.max(...values) : null;
}

function detectExplicitSeniority(text: string, roleIndex: number): CareerSeniority | null {
  const windowStart = Math.max(0, roleIndex - 36);
  const beforeRole = text.slice(windowStart, roleIndex).toLowerCase();
  const ordered: ReadonlyArray<{ seniority: CareerSeniority; pattern: RegExp }> = [
    { seniority: "principal", pattern: /\bprincipal\s*$/i },
    { seniority: "staff", pattern: /\bstaff\s*$/i },
    { seniority: "lead", pattern: /\b(?:lead|technical lead)\s*$/i },
    { seniority: "senior", pattern: /\b(?:senior|sr\.?)\s*$/i },
    { seniority: "junior", pattern: /\b(?:junior|jr\.?)\s*$/i },
    { seniority: "entry", pattern: /\bentry[- ]level\s*$/i },
  ];

  for (const item of ordered) {
    if (item.pattern.test(beforeRole)) {
      return item.seniority;
    }
  }

  const surrounding = text
    .slice(Math.max(0, roleIndex - 60), roleIndex + 80)
    .toLowerCase();
  if (/\bengineering manager\b/.test(surrounding)) {
    return "manager";
  }

  return null;
}

function inferSeniority(
  text: string,
  requirements: readonly JDRequirement[],
  explicitMatch: ExplicitRoleMatch | null,
  requiredYears: number | null,
): CareerSeniority {
  const explicit = explicitMatch
    ? detectExplicitSeniority(text, explicitMatch.index)
    : null;
  if (explicit) {
    return explicit;
  }

  const lower = text.toLowerCase();
  if (/\bprincipal\b/.test(lower)) return "principal";
  if (/\bstaff\b/.test(lower)) return "staff";
  // Require managerial ownership language. Do not treat technical compounds such
  // as "state management", "memory management", or "content management" as
  // Engineering Manager seniority signals.
  if (
    /\bengineering manager\b/.test(lower) ||
    /\b(?:people|engineering|product|project|hiring)\s+manager\b/.test(lower) ||
    /\bmanages?\s+(?:a\s+)?(?:cross-functional\s+)?(?:team|engineers|people|organization|org)\b/.test(
      lower,
    )
  ) {
    return "manager";
  }
  if (/\btechnical lead\b|\bteam lead\b|\blead engineer\b/.test(lower)) return "lead";
  if (/\bsenior\b|\bsr\.\b/.test(lower)) return "senior";
  if (/\bjunior\b|\bjr\.\b/.test(lower)) return "junior";
  if (/\bentry[- ]level\b|\bnew grad\b/.test(lower)) return "entry";

  const leadershipWeight = requirements.filter(
    (requirement) =>
      ["leadership", "architecture"].includes(requirement.category) &&
      ["critical", "high"].includes(requirement.priority),
  ).length;

  if (requiredYears !== null) {
    if (requiredYears >= 10 && leadershipWeight >= 2) return "lead";
    if (requiredYears >= 5) return "senior";
    if (requiredYears <= 1) return "entry";
    if (requiredYears <= 2) return "junior";
    return "mid";
  }

  return leadershipWeight >= 2 ? "senior" : "mid";
}

function collectEvidence(
  text: string,
  explicitMatch: ExplicitRoleMatch | null,
  definition: RoleDefinition,
  seniority: CareerSeniority,
): TargetRoleEvidence[] {
  const evidence: TargetRoleEvidence[] = [];

  if (explicitMatch) {
    evidence.push({
      sourceText: explicitMatch.text,
      reason: "explicit-title",
    });
  }

  for (const signal of definition.signals) {
    const index = text.toLowerCase().indexOf(signal.phrase.toLowerCase());
    if (index >= 0) {
      evidence.push({
        sourceText: text.slice(index, index + signal.phrase.length),
        reason: "role-family-signal",
      });
      if (evidence.filter((item) => item.reason === "role-family-signal").length >= 3) {
        break;
      }
    }
  }

  const seniorityPattern: Readonly<Record<CareerSeniority, RegExp>> = {
    entry: /\bentry[- ]level\b/i,
    junior: /\bjunior\b|\bjr\.\b/i,
    mid: /\bmid[- ]level\b/i,
    senior: /\bsenior\b|\bsr\.\b/i,
    lead: /\blead\b/i,
    staff: /\bstaff\b/i,
    principal: /\bprincipal\b/i,
    manager: /\bengineering manager\b|\b(?:people|engineering|product|project)\s+manager\b/i,
  };
  const seniorityMatch = seniorityPattern[seniority].exec(text);
  if (seniorityMatch?.[0]) {
    evidence.push({
      sourceText: seniorityMatch[0],
      reason: "seniority-signal",
    });
  }

  return evidence;
}

export function analyzeTargetRole(
  jobDescription: JobDescription,
  requirements: readonly JDRequirement[],
): TargetRoleAnalysis {
  const text = jobDescription.normalizedText;
  const explicitMatch = findExplicitRole(text);
  const inferred = explicitMatch
    ? { definition: explicitMatch.definition, score: 20, runnerUpScore: 0 }
    : inferDefinition(text, requirements);
  const requiredYears = inferRequiredYears(text);
  const seniority = inferSeniority(text, requirements, explicitMatch, requiredYears);
  const targetRole = formatRoleTitle(inferred.definition.baseRole, seniority);
  const margin = Math.max(0, inferred.score - inferred.runnerUpScore);
  const confidence = explicitMatch
    ? 0.98
    : Math.min(0.94, 0.66 + Math.min(inferred.score, 24) / 100 + margin / 100);

  return {
    targetRole,
    baseRole: inferred.definition.baseRole,
    roleFamily: inferred.definition.family,
    seniority,
    explicitTitleFound: explicitMatch !== null,
    confidence: Number(confidence.toFixed(2)),
    requiredYears,
    evidence: collectEvidence(text, explicitMatch, inferred.definition, seniority),
  };
}
