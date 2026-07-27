import type {
  GenerationContext,
  JobDescription,
  SummarySeniority,
  SummaryTargetRole,
} from "@resume/contracts";
import {
  ROLE_DEFINITIONS,
  type RoleDefinition,
} from "../../experience/role-assignment/role-taxonomy";
import type { TargetRoleAnalysisOutput } from "../types/analysis";

interface ExplicitMatch {
  definition: RoleDefinition;
  text: string;
  index: number;
}

const SENIORITY_PATTERNS: ReadonlyArray<{
  seniority: SummarySeniority;
  pattern: RegExp;
}> = [
  { seniority: "principal", pattern: /\bprincipal\b/i },
  { seniority: "staff", pattern: /\bstaff\b/i },
  { seniority: "manager", pattern: /\b(?:engineering|technical) manager\b/i },
  { seniority: "lead", pattern: /\b(?:technical lead|team lead|lead engineer)\b/i },
  { seniority: "senior", pattern: /\b(?:senior|sr\.?)\b/i },
  { seniority: "junior", pattern: /\b(?:junior|jr\.?)\b/i },
  { seniority: "entry", pattern: /\b(?:entry[- ]level|new grad)\b/i },
];

function findExplicitRole(text: string): ExplicitMatch | null {
  const matches: ExplicitMatch[] = [];
  for (const definition of ROLE_DEFINITIONS) {
    for (const pattern of definition.explicitPatterns) {
      const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
      const globalPattern = new RegExp(pattern.source, flags);
      for (const match of text.matchAll(globalPattern)) {
        if (match.index === undefined || !match[0]) continue;
        matches.push({ definition, text: match[0], index: match.index });
      }
    }
  }

  return (
    matches.sort((left, right) => {
      const leftTitleBoost = left.index < 180 ? 1000 : 0;
      const rightTitleBoost = right.index < 180 ? 1000 : 0;
      const leftScore = leftTitleBoost - left.index + left.text.length;
      const rightScore = rightTitleBoost - right.index + right.text.length;
      return rightScore - leftScore;
    })[0] ?? null
  );
}

function scoreDefinition(definition: RoleDefinition, text: string): number {
  const lower = text.toLowerCase();
  return definition.signals.reduce((score, signal) => {
    const occurrences = lower.split(signal.phrase.toLowerCase()).length - 1;
    return score + Math.min(occurrences, 3) * signal.weight;
  }, 0);
}

function inferDefinition(text: string): { definition: RoleDefinition; confidence: number } {
  const ranked = ROLE_DEFINITIONS.map((definition) => ({
    definition,
    score: scoreDefinition(definition, text),
  })).sort((left, right) => right.score - left.score);

  const winner = ranked[0];
  if (!winner || winner.score === 0) {
    const fallback = ROLE_DEFINITIONS.find(
      (definition) => definition.family === "software-engineering",
    );
    if (!fallback) throw new Error("Software-engineering role fallback is unavailable.");
    return { definition: fallback, confidence: 0.55 };
  }

  const runnerUp = ranked[1]?.score ?? 0;
  const confidence = Math.min(0.96, 0.62 + Math.max(0, winner.score - runnerUp) / 50);
  return { definition: winner.definition, confidence };
}

function detectSeniority(text: string, roleIndex: number | null): SummarySeniority {
  const titleWindow = roleIndex === null
    ? text.slice(0, 220)
    : text.slice(Math.max(0, roleIndex - 50), roleIndex + 100);
  for (const candidate of SENIORITY_PATTERNS) {
    if (candidate.pattern.test(titleWindow)) return candidate.seniority;
  }

  const lower = text.toLowerCase();
  for (const candidate of SENIORITY_PATTERNS) {
    if (candidate.pattern.test(lower)) return candidate.seniority;
  }

  const years = [...text.matchAll(/\b(\d{1,2})\+?\s*(?:years?|yrs?)\b/gi)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const required = years.length > 0 ? Math.max(...years) : null;
  if (required !== null) {
    if (required >= 10) return "principal";
    if (required >= 8) return "staff";
    if (required >= 6) return "senior";
    if (required <= 1) return "entry";
    if (required <= 2) return "junior";
  }

  const leadershipSignals = (lower.match(/\b(?:architect|mentor|lead|strategy|roadmap|ownership)\w*\b/g) ?? []).length;
  return leadershipSignals >= 3 ? "senior" : "mid";
}

function formatTitle(baseRole: string, seniority: SummarySeniority): string {
  if (seniority === "mid") return baseRole;
  if (seniority === "manager") {
    const discipline = baseRole.replace(/ Engineer$/, "");
    return discipline === "Software"
      ? "Software Engineering Manager"
      : `${discipline} Engineering Manager`;
  }
  const prefix: Record<Exclude<SummarySeniority, "mid" | "manager">, string> = {
    entry: "Entry-Level",
    junior: "Junior",
    senior: "Senior",
    lead: "Lead",
    staff: "Staff",
    principal: "Principal",
  };
  return `${prefix[seniority]} ${baseRole}`;
}

export class SummaryTargetRoleAnalyzer {
  readonly name = "summary-target-role-analyzer";

  execute(input: {
    context: GenerationContext;
    jobDescription: JobDescription;
  }): TargetRoleAnalysisOutput {
    const text = input.jobDescription.rawText;
    const explicit = findExplicitRole(text);
    const inferred = explicit
      ? { definition: explicit.definition, confidence: 0.98 }
      : inferDefinition(text);
    const seniority = detectSeniority(text, explicit?.index ?? null);
    const title = formatTitle(inferred.definition.baseRole, seniority);

    const evidence = explicit
      ? [{
          sourceText: explicit.text,
          startIndex: explicit.index,
          endIndex: explicit.index + explicit.text.length,
        }]
      : inferred.definition.signals.flatMap((signal) => {
          const index = text.toLowerCase().indexOf(signal.phrase.toLowerCase());
          return index >= 0
            ? [{
                sourceText: text.slice(index, index + signal.phrase.length),
                startIndex: index,
                endIndex: index + signal.phrase.length,
              }]
            : [];
        }).slice(0, 3);

    const targetRole: SummaryTargetRole = {
      title,
      family: inferred.definition.family,
      seniority,
      confidence: inferred.confidence,
      evidence,
    };

    return { context: input.context, targetRole };
  }
}
