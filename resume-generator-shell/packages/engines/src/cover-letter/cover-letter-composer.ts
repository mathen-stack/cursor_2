import type {
  SummaryExperienceYears,
  SummaryKeyword,
  SummaryTargetRole,
  UserProfile,
} from "@resume/contracts";

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
};

function list(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function cleanSentence(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

/** Best-effort company extraction from a JD. */
export function extractCompanyNameFromJd(rawText: string): string | null {
  const text = rawText.replace(/\r\n/g, "\n");
  // Only allow horizontal spaces between company words (not newlines).
  const companyToken = String.raw`[A-Z][\w.&'\-]+(?:[ \t]+[A-Z][\w.&'\-]+){0,3}`;
  const patterns = [
    new RegExp(String.raw`\bat[ \t]+(${companyToken})\b`),
    new RegExp(String.raw`\bjoin[ \t]+(${companyToken})\b`, "i"),
    new RegExp(String.raw`\babout[ \t]+(${companyToken})\b`, "i"),
    new RegExp(String.raw`\bcompany:[ \t]*(${companyToken})`, "i"),
    new RegExp(String.raw`^(${companyToken})[ \t]*[|·\-]`, "m"),
  ];
  const blocked = new Set([
    "senior",
    "staff",
    "principal",
    "software",
    "engineer",
    "engineering",
    "frontend",
    "backend",
    "full",
    "stack",
    "remote",
    "hybrid",
    "about",
    "the",
    "our",
    "this",
    "job",
    "role",
    "position",
    "build",
  ]);
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const candidate = match?.[1]?.trim();
    if (!candidate) continue;
    const first = candidate.split(/[ \t]+/)[0]?.toLocaleLowerCase() || "";
    if (blocked.has(first)) continue;
    if (candidate.length < 2 || candidate.length > 60) continue;
    return candidate;
  }
  return null;
}

function recentRoleLine(profile: UserProfile): string | null {
  const entry = profile.careerHistory[0];
  if (!entry) return null;
  const role = entry.role?.trim() || "engineer";
  const company = entry.companyName?.trim() || "my current team";
  return `most recently as ${role} at ${company}`;
}

function highlightSentence(highlightBullets: readonly string[]): string | null {
  const usable = highlightBullets
    .map((bullet) => bullet.trim().replace(/^[-•*]\s*/, ""))
    .filter((bullet) => bullet.length >= 40 && bullet.length <= 220)
    .slice(0, 2);
  if (usable.length === 0) return null;
  if (usable.length === 1) {
    return `In recent work, I ${usable[0]!.charAt(0).toLocaleLowerCase()}${usable[0]!.slice(1).replace(/\.$/, "")}.`;
  }
  return `In recent work, I ${usable[0]!.charAt(0).toLocaleLowerCase()}${usable[0]!.slice(1).replace(/\.$/, "")}, and I ${usable[1]!.charAt(0).toLocaleLowerCase()}${usable[1]!.slice(1).replace(/\.$/, "")}.`;
}

export interface CoverLetterCompositionInput {
  profile: UserProfile;
  targetRole: SummaryTargetRole;
  experienceYears: SummaryExperienceYears;
  keywords: readonly SummaryKeyword[];
  companyName: string | null;
  highlightBullets?: readonly string[];
}

export interface CoverLetterCompositionOutput {
  coverLetter: string;
  wordCount: number;
  keywordsUsed: SummaryKeyword[];
}

export class CoverLetterComposer {
  execute(input: CoverLetterCompositionInput): CoverLetterCompositionOutput {
    const domains = input.keywords.filter((item) => item.category === "domain").slice(0, 2);
    const technical = input.keywords
      .filter((item) => item.category === "technical")
      .slice(0, 6);
    const outcomes = input.keywords
      .filter((item) => item.category === "outcome")
      .slice(0, 3);
    const used = [...domains, ...technical, ...outcomes];

    const focus =
      domains.length > 0
        ? list(domains.map((item) => item.text))
        : ROLE_FAMILY_FOCUS[input.targetRole.family] ?? "production software";
    const techText =
      technical.length > 0
        ? list(technical.map((item) => item.text))
        : "modern software delivery practices";
    const outcomeText =
      outcomes.length > 0
        ? list(outcomes.map((item) => item.text))
        : "reliability, delivery quality, and measurable impact";

    const companyClause = input.companyName ? ` at ${input.companyName}` : "";
    const recent = recentRoleLine(input.profile);
    const highlights = highlightSentence(input.highlightBullets ?? []);

    const opening = cleanSentence(
      `Dear Hiring Manager,\n\nI am writing to apply for the ${input.targetRole.title} role${companyClause}. With ${input.experienceYears.display} of experience designing and delivering ${focus}, I am excited to bring that background to your team.`,
    );

    const bodyParts = [
      recent
        ? `I have been working ${recent}, building products with ${techText} and focusing on ${outcomeText}.`
        : `My experience centers on building products with ${techText} and focusing on ${outcomeText}.`,
    ];
    if (highlights) bodyParts.push(highlights);
    bodyParts.push(
      `I am particularly interested in this opportunity because it aligns with my experience in ${focus} and my commitment to shipping reliable, high-quality work.`,
    );

    const closing = cleanSentence(
      `I would welcome the chance to discuss how I can contribute to your team.\n\nSincerely,\n${input.profile.personalInformation.fullName.trim() || "Applicant"}`,
    );

    const coverLetter = `${opening}\n\n${bodyParts.map(cleanSentence).join(" ")}\n\n${closing}`;
    const wordCount = coverLetter
      .replace(/\n+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    return {
      coverLetter,
      wordCount,
      keywordsUsed: used,
    };
  }
}
