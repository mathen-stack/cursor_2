import type {
  GenerationContext,
  SummaryExperienceYears,
  SummaryKeyword,
  SummaryTargetRole,
} from "@resume/contracts";
import type { SummaryCompositionOutput } from "../types/analysis";
import {
  formatSummaryMetricSentence,
  selectSummaryMetrics,
} from "./summary-metric-selector";

const ROLE_FAMILY_FOCUS: Readonly<Record<string, string>> = {
  "generative-ai": "generative AI applications",
  "applied-ai": "applied AI solutions",
  mlops: "MLOps platforms",
  "machine-learning": "machine learning systems",
  "data-engineering": "data platforms",
  "data-science": "data science solutions",
  "platform-engineering": "developer platforms",
  "cloud-engineering": "cloud infrastructure",
  "devops-engineering": "reliable delivery platforms",
  "security-engineering": "secure software systems",
  "solutions-engineering": "enterprise technical solutions",
  "backend-engineering": "backend services",
  "frontend-engineering": "user-facing web applications",
  "full-stack-engineering": "full-stack applications",
  "software-engineering": "production software",
  // Additive multi-stack focus phrases (original entries above are unchanged).
  "mobile-engineering": "mobile applications",
  "qa-engineering": "quality engineering and test automation",
  "database-engineering": "database platforms",
  "embedded-engineering": "embedded systems",
  "blockchain-engineering": "blockchain and smart-contract systems",
};

function list(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function sentenceOne(
  targetRole: SummaryTargetRole,
  years: SummaryExperienceYears,
  domains: readonly SummaryKeyword[],
): string {
  const focus = domains.length > 0
    ? list(domains.map((keyword) => keyword.text))
    : ROLE_FAMILY_FOCUS[targetRole.family] ?? "production software";
  return `${targetRole.title} with ${years.display} of experience designing and delivering ${focus} for complex business and engineering needs.`;
}

function sentenceTwo(
  technical: readonly SummaryKeyword[],
  outcomes: readonly SummaryKeyword[],
): string {
  const techText = technical.length > 0
    ? list(technical.slice(0, 6).map((keyword) => keyword.text))
    : "system design, implementation, testing, and production delivery";
  const outcomeText = outcomes.length > 0
    ? list(outcomes.map((keyword) => keyword.text))
    : "reliability, scalability, and maintainability";
  return `Expertise includes ${techText}, with engineering decisions focused on ${outcomeText}.`;
}

const LEADERSHIP_SENTENCE =
  "Provides technical leadership, mentors engineers, and aligns architecture decisions with product priorities and measurable business needs.";

function sentenceThree(
  people: readonly SummaryKeyword[],
  targetRole: SummaryTargetRole,
): string {
  const peopleKeys = new Set(people.map((keyword) => keyword.normalizedKey));
  if (peopleKeys.has("MENTORING") || peopleKeys.has("TECHNICAL_LEADERSHIP")) {
    return LEADERSHIP_SENTENCE;
  }
  if (people.length > 0) {
    const hasBusinessRequirements = peopleKeys.has("BUSINESS_REQUIREMENTS");
    const relationshipKeywords = people.filter(
      (keyword) => keyword.normalizedKey !== "BUSINESS_REQUIREMENTS",
    );
    const relationshipText = relationshipKeywords.length > 0
      ? list(relationshipKeywords.map((keyword) => keyword.text))
      : "cross-functional alignment";
    const objectText = hasBusinessRequirements ? "business requirements" : "business needs";
    return `Strengthens ${relationshipText} by translating ${objectText} into clear, maintainable technical solutions.`;
  }
  if (["senior", "lead", "staff", "principal", "manager"].includes(targetRole.seniority)) {
    return "Owns technical decisions from design through production delivery while communicating tradeoffs clearly across engineering and business stakeholders.";
  }
  return "Builds maintainable solutions from design through production delivery and communicates technical tradeoffs clearly with engineering and product partners.";
}

function ensureMinimumWords(summary: string, targetRole: SummaryTargetRole): string {
  if (words(summary) >= 50) return summary;
  const addition = ["senior", "lead", "staff", "principal", "manager"].includes(targetRole.seniority)
    ? "Brings end-to-end ownership across architecture, implementation, release planning, and continuous improvement."
    : "Applies disciplined engineering practices across implementation, testing, release planning, and continuous improvement.";
  return `${summary} ${addition}`;
}

function composeBody(input: {
  targetRole: SummaryTargetRole;
  experienceYears: SummaryExperienceYears;
  domains: readonly SummaryKeyword[];
  technical: readonly SummaryKeyword[];
  outcomes: readonly SummaryKeyword[];
  people: readonly SummaryKeyword[];
  includePeopleSentence: boolean;
  metricSentence: string;
}): string {
  const parts = [
    sentenceOne(input.targetRole, input.experienceYears, input.domains),
    sentenceTwo(input.technical, input.outcomes),
    input.metricSentence,
  ];
  if (input.includePeopleSentence) {
    parts.push(sentenceThree(input.people, input.targetRole));
  }
  return parts.join(" ");
}

export class SummaryComposer {
  readonly name = "summary-composer";

  execute(input: {
    context: GenerationContext;
    targetRole: SummaryTargetRole;
    experienceYears: SummaryExperienceYears;
    keywords: readonly SummaryKeyword[];
  }): SummaryCompositionOutput {
    const domains = input.keywords.filter((keyword) => keyword.category === "domain");
    const technical = input.keywords.filter((keyword) => keyword.category === "technical");
    const outcomes = input.keywords.filter((keyword) => keyword.category === "outcome");
    const people = input.keywords.filter((keyword) => keyword.category === "leadership" || keyword.category === "collaboration");

    const peopleKeys = new Set(people.map((keyword) => keyword.normalizedKey));
    const usesLeadershipSentence =
      peopleKeys.has("MENTORING") || peopleKeys.has("TECHNICAL_LEADERSHIP");
    // Avoid claiming the same phrase twice when the leadership sentence already
    // hardcodes technical leadership / architecture decisions wording.
    let selectedTechnical = technical
      .filter(
        (keyword) => !input.targetRole.title
          .toLowerCase()
          .includes(keyword.text.toLowerCase()),
      )
      .filter((keyword) => {
        if (!usesLeadershipSentence) {
          return true;
        }
        return !LEADERSHIP_SENTENCE.toLowerCase().includes(keyword.text.toLowerCase());
      })
      .slice(0, 5);
    // Drop outcome phrases that are already covered by a longer technical phrase
    // (e.g. "availability" inside "High Availability") so composition does not
    // look stuffed while preserving the stronger JD-grounded wording.
    let selectedOutcomes = outcomes
      .filter(
        (outcome) =>
          !selectedTechnical.some((keyword) =>
            keyword.text.toLocaleLowerCase().includes(outcome.text.toLocaleLowerCase()),
          ),
      )
      .slice(0, 2);

    const metrics = selectSummaryMetrics({
      seed: `${input.context.jdHash}:${input.context.profileId}:${input.targetRole.title}`,
      count: 2,
    });
    const metricSentence = formatSummaryMetricSentence(metrics);

    // Prefer 3 sentences when metrics are present so length stays Resume-Worded
    // friendly (≤100, our gate ≤80) while still covering role/years/tech/metrics.
    let includePeopleSentence = false;
    let summary = composeBody({
      targetRole: input.targetRole,
      experienceYears: input.experienceYears,
      domains,
      technical: selectedTechnical,
      outcomes: selectedOutcomes,
      people,
      includePeopleSentence,
      metricSentence,
    });

    // Add the people/leadership sentence only when there is room.
    const withPeople = composeBody({
      targetRole: input.targetRole,
      experienceYears: input.experienceYears,
      domains,
      technical: selectedTechnical,
      outcomes: selectedOutcomes,
      people,
      includePeopleSentence: true,
      metricSentence,
    });
    if (words(withPeople) <= 80) {
      includePeopleSentence = true;
      summary = withPeople;
    }

    while (words(summary) > 80 && selectedTechnical.length > 2) {
      selectedTechnical = selectedTechnical.slice(0, -1);
      summary = composeBody({
        targetRole: input.targetRole,
        experienceYears: input.experienceYears,
        domains,
        technical: selectedTechnical,
        outcomes: selectedOutcomes,
        people,
        includePeopleSentence,
        metricSentence,
      });
    }
    while (words(summary) > 80 && selectedOutcomes.length > 0) {
      selectedOutcomes = selectedOutcomes.slice(0, -1);
      summary = composeBody({
        targetRole: input.targetRole,
        experienceYears: input.experienceYears,
        domains,
        technical: selectedTechnical,
        outcomes: selectedOutcomes,
        people,
        includePeopleSentence,
        metricSentence,
      });
    }
    if (words(summary) > 80 && includePeopleSentence) {
      includePeopleSentence = false;
      summary = composeBody({
        targetRole: input.targetRole,
        experienceYears: input.experienceYears,
        domains,
        technical: selectedTechnical,
        outcomes: selectedOutcomes,
        people,
        includePeopleSentence,
        metricSentence,
      });
    }

    summary = ensureMinimumWords(summary, input.targetRole);

    // Keep used-keyword count within the validator ceiling without changing the
    // sentence template: drop lowest-priority technical, then outcome, phrases.
    const maxUsedKeywords = 14;
    const projected = () =>
      [...domains, ...selectedTechnical, ...selectedOutcomes, ...people].filter(
        (keyword) => summary.toLowerCase().includes(keyword.text.toLowerCase()),
      );
    while (projected().length > maxUsedKeywords && selectedTechnical.length > 2) {
      selectedTechnical = selectedTechnical.slice(0, -1);
      summary = ensureMinimumWords(
        composeBody({
          targetRole: input.targetRole,
          experienceYears: input.experienceYears,
          domains,
          technical: selectedTechnical,
          outcomes: selectedOutcomes,
          people,
          includePeopleSentence,
          metricSentence,
        }),
        input.targetRole,
      );
    }
    while (projected().length > maxUsedKeywords && selectedOutcomes.length > 0) {
      selectedOutcomes = selectedOutcomes.slice(0, -1);
      summary = ensureMinimumWords(
        composeBody({
          targetRole: input.targetRole,
          experienceYears: input.experienceYears,
          domains,
          technical: selectedTechnical,
          outcomes: selectedOutcomes,
          people,
          includePeopleSentence,
          metricSentence,
        }),
        input.targetRole,
      );
    }

    const usedKeys = new Set<string>();
    for (const keyword of [...domains, ...selectedTechnical, ...selectedOutcomes, ...people]) {
      if (summary.toLowerCase().includes(keyword.text.toLowerCase())) {
        usedKeys.add(keyword.normalizedKey);
      }
    }

    return {
      context: input.context,
      summary,
      keywordsUsed: input.keywords.filter((keyword) => usedKeys.has(keyword.normalizedKey)),
    };
  }
}
