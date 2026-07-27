import type {
  GenerationContext,
  JobDescription,
  SummaryKeyword,
  SummaryKeywordCategory,
  SummaryTargetRole,
} from "@resume/contracts";
import { SKILL_DEFINITIONS } from "../../skills/skill-taxonomy";
import type { SummaryKeywordAllocationOutput } from "../types/analysis";

interface Candidate {
  text: string;
  normalizedKey: string;
  category: SummaryKeywordCategory;
  priority: number;
  sourceText: string;
  startIndex: number;
  endIndex: number;
}

const DOMAIN_PHRASES: ReadonlyArray<{
  key: string;
  text: string;
  aliases: string[];
}> = [
  { key: "PRODUCTION_SYSTEMS", text: "production systems", aliases: ["production systems", "production environments", "production-grade"] },
  { key: "MACHINE_LEARNING_SYSTEMS", text: "machine learning systems", aliases: ["machine learning systems", "ML systems"] },
  { key: "AI_APPLICATIONS", text: "AI applications", aliases: ["AI applications", "AI systems"] },
  { key: "CLOUD_PLATFORMS", text: "cloud platforms", aliases: ["cloud platforms", "cloud infrastructure"] },
  { key: "DATA_PLATFORMS", text: "data platforms", aliases: ["data platforms", "data platform"] },
  { key: "DISTRIBUTED_SYSTEMS", text: "distributed systems", aliases: ["distributed systems"] },
  { key: "BACKEND_SERVICES", text: "backend services", aliases: ["backend services", "backend systems"] },
  { key: "SECURE_SYSTEMS", text: "secure systems", aliases: ["secure systems", "secure applications"] },
  { key: "ENTERPRISE_SOLUTIONS", text: "enterprise solutions", aliases: ["enterprise solutions", "enterprise systems"] },
];

const OUTCOME_PHRASES: ReadonlyArray<{
  key: string;
  text: string;
  aliases: string[];
}> = [
  { key: "SCALABILITY", text: "scalability", aliases: ["scalability", "scalable"] },
  { key: "RELIABILITY", text: "reliability", aliases: ["reliability", "reliable"] },
  { key: "PERFORMANCE", text: "performance", aliases: ["performance", "latency", "throughput"] },
  { key: "DATA_QUALITY", text: "data quality", aliases: ["data quality"] },
  { key: "SECURITY", text: "security", aliases: ["security", "secure"] },
  { key: "EFFICIENCY", text: "operational efficiency", aliases: ["efficiency", "operational efficiency", "productivity"] },
  { key: "AVAILABILITY", text: "availability", aliases: ["availability", "highly available"] },
  { key: "CUSTOMER_IMPACT", text: "customer impact", aliases: ["customer impact", "customer experience", "customer outcomes"] },
  { key: "DELIVERY_SPEED", text: "delivery speed", aliases: ["delivery speed", "faster delivery", "release speed"] },
];

const PEOPLE_PHRASES: ReadonlyArray<{
  key: string;
  text: string;
  category: "leadership" | "collaboration";
  aliases: string[];
}> = [
  { key: "CROSS_FUNCTIONAL", text: "cross-functional collaboration", category: "collaboration", aliases: ["cross-functional collaboration", "cross functional collaboration", "collaborate with product", "partner with product", "collaborate with engineering teams", "collaborating with product teams", "collaborate with product stakeholders"] },
  { key: "STAKEHOLDER_COMMUNICATION", text: "stakeholder communication", category: "collaboration", aliases: ["stakeholder communication", "technical and non-technical stakeholders", "communicate architecture decisions", "partner with analytics stakeholders", "partner with engineering stakeholders"] },
  { key: "BUSINESS_REQUIREMENTS", text: "business requirements", category: "collaboration", aliases: ["business requirements", "translate business requirements"] },
  { key: "MENTORING", text: "mentoring", category: "leadership", aliases: ["mentor engineers", "mentoring", "coach engineers"] },
  { key: "TECHNICAL_LEADERSHIP", text: "technical leadership", category: "leadership", aliases: ["technical leadership", "lead technical", "technical strategy"] },
  { key: "ARCHITECTURE_DECISIONS", text: "architecture decisions", category: "leadership", aliases: ["architecture decisions", "architectural decisions", "architecture reviews"] },
];

function aliasPattern(alias: string, caseSensitive = false): RegExp {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startsWithWord = /^[A-Za-z0-9]/.test(alias);
  const endsWithWord = /[A-Za-z0-9]$/.test(alias);
  const source = `${startsWithWord ? "\\b" : ""}${escaped}${endsWithWord ? "\\b" : ""}`;
  return new RegExp(source, caseSensitive ? "g" : "gi");
}

function findAlias(
  text: string,
  aliases: readonly string[],
  caseSensitive = false,
): { sourceText: string; startIndex: number; endIndex: number } | null {
  for (const alias of aliases) {
    const match = aliasPattern(alias, caseSensitive).exec(text);
    if (match?.index !== undefined && match[0]) {
      return {
        sourceText: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      };
    }
  }
  return null;
}

function occurrenceCount(
  text: string,
  aliases: readonly string[],
  caseSensitive = false,
): number {
  return aliases.reduce(
    (count, alias) => count + [...text.matchAll(aliasPattern(alias, caseSensitive))].length,
    0,
  );
}

function candidatePriority(category: SummaryKeywordCategory, occurrences: number, startIndex: number): number {
  const categoryWeight: Record<SummaryKeywordCategory, number> = {
    role: 100,
    domain: 88,
    technical: 80,
    outcome: 76,
    leadership: 72,
    collaboration: 70,
  };
  return Math.min(100, (categoryWeight[category] ?? 0) + Math.min(occurrences, 3) * 3 + (startIndex < 250 ? 4 : 0));
}

function toKeyword(candidate: Candidate, index: number): SummaryKeyword {
  return {
    keywordId: `SUM-KW-${String(index + 1).padStart(3, "0")}`,
    text: candidate.text,
    normalizedKey: candidate.normalizedKey,
    category: candidate.category,
    source: "direct",
    priority: candidate.priority,
    evidence: [{
      sourceText: candidate.sourceText,
      startIndex: candidate.startIndex,
      endIndex: candidate.endIndex,
    }],
  };
}

export interface SummaryKeywordAllocatorOptions {
  maximumTechnicalKeywords?: number;
  maximumOutcomeKeywords?: number;
  maximumPeopleKeywords?: number;
}

export class SummaryKeywordAllocator {
  readonly name = "summary-keyword-allocator";
  private readonly maximumTechnicalKeywords: number;
  private readonly maximumOutcomeKeywords: number;
  private readonly maximumPeopleKeywords: number;

  constructor(options: SummaryKeywordAllocatorOptions = {}) {
    this.maximumTechnicalKeywords = options.maximumTechnicalKeywords ?? 7;
    this.maximumOutcomeKeywords = options.maximumOutcomeKeywords ?? 3;
    this.maximumPeopleKeywords = options.maximumPeopleKeywords ?? 2;
  }

  execute(input: {
    context: GenerationContext;
    jobDescription: JobDescription;
    targetRole: SummaryTargetRole;
  }): SummaryKeywordAllocationOutput {
    const text = input.jobDescription.rawText;
    const candidates: Candidate[] = [];

    for (const definition of DOMAIN_PHRASES) {
      const evidence = findAlias(text, definition.aliases);
      if (!evidence) continue;
      const occurrences = occurrenceCount(text, definition.aliases);
      candidates.push({
        text: definition.text,
        normalizedKey: definition.key,
        category: "domain",
        priority: candidatePriority("domain", occurrences, evidence.startIndex),
        ...evidence,
      });
    }

    for (const definition of SKILL_DEFINITIONS) {
      const evidence = findAlias(text, definition.aliases, definition.caseSensitive ?? false);
      if (!evidence) continue;
      const occurrences = occurrenceCount(text, definition.aliases, definition.caseSensitive ?? false);
      candidates.push({
        text: definition.name,
        normalizedKey: definition.key,
        category: "technical",
        priority: candidatePriority("technical", occurrences, evidence.startIndex),
        ...evidence,
      });
    }

    for (const definition of OUTCOME_PHRASES) {
      const evidence = findAlias(text, definition.aliases);
      if (!evidence) continue;
      const occurrences = occurrenceCount(text, definition.aliases);
      candidates.push({
        text: definition.text,
        normalizedKey: definition.key,
        category: "outcome",
        priority: candidatePriority("outcome", occurrences, evidence.startIndex),
        ...evidence,
      });
    }

    for (const definition of PEOPLE_PHRASES) {
      const evidence = findAlias(text, definition.aliases);
      if (!evidence) continue;
      const occurrences = occurrenceCount(text, definition.aliases);
      candidates.push({
        text: definition.text,
        normalizedKey: definition.key,
        category: definition.category,
        priority: candidatePriority(definition.category, occurrences, evidence.startIndex),
        ...evidence,
      });
    }

    const deduped = new Map<string, Candidate>();
    for (const candidate of candidates) {
      const existing = deduped.get(candidate.normalizedKey);
      if (!existing || candidate.priority > existing.priority) {
        deduped.set(candidate.normalizedKey, candidate);
      }
    }

    const ranked = [...deduped.values()].sort((left, right) => {
      if (right.priority !== left.priority) return right.priority - left.priority;
      return left.startIndex - right.startIndex;
    });

    const domains = ranked.filter((candidate) => candidate.category === "domain").slice(0, 2);
    const technicalRaw = ranked
      .filter((candidate) => candidate.category === "technical")
      .slice(0, this.maximumTechnicalKeywords + 3);
    const technical = technicalRaw
      .filter(
        (candidate) =>
          !technicalRaw.some(
            (other) =>
              other.normalizedKey !== candidate.normalizedKey &&
              other.text.length > candidate.text.length &&
              new RegExp(
                `(?:^|[^A-Za-z0-9])${candidate.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[^A-Za-z0-9]|$)`,
                "i",
              ).test(other.text),
          ),
      )
      .slice(0, this.maximumTechnicalKeywords);
    const outcomes = ranked.filter((candidate) => candidate.category === "outcome").slice(0, this.maximumOutcomeKeywords);
    const people = ranked.filter((candidate) => candidate.category === "leadership" || candidate.category === "collaboration").slice(0, this.maximumPeopleKeywords);

    const selected = [...domains, ...technical, ...outcomes, ...people];
    return {
      context: input.context,
      keywords: selected.map(toKeyword),
    };
  }
}
