import type {
  RequirementCategory,
  RequirementNecessity,
  RequirementPriority,
} from "../types/requirement";
import type { RequirementCandidate } from "./candidate-schema";

const ACTION_VERBS = new Set([
  "analyze",
  "architect",
  "automate",
  "build",
  "collaborate",
  "communicate",
  "coordinate",
  "conduct",
  "create",
  "define",
  "deliver",
  "deploy",
  "design",
  "develop",
  "drive",
  "ensure",
  "establish",
  "evaluate",
  "implement",
  "improve",
  "integrate",
  "lead",
  "maintain",
  "manage",
  "mentor",
  "monitor",
  "optimize",
  "own",
  "partner",
  "perform",
  "present",
  "productionize",
  "reduce",
  "scale",
  "secure",
  "support",
  "test",
  "translate",
  "troubleshoot",
]);

export const TOOL_NAMES = [
  "Python",
  "Java",
  "JavaScript",
  "TypeScript",
  "Go",
  "C++",
  "C#",
  "SQL",
  "R",
  "Docker",
  "Kubernetes",
  "MLflow",
  "Airflow",
  "Spark",
  "Kafka",
  "Databricks",
  "Snowflake",
  "dbt",
  "Fivetran",
  "AWS",
  "Azure",
  "GCP",
  "TensorFlow",
  "PyTorch",
  "scikit-learn",
  "FastAPI",
  "Flask",
  "Django",
  "React",
  "React.js",
  "Next.js",
  "Tailwind CSS",
  "CSS Modules",
  "DaisyUI",
  "WebSockets",
  "Vitest",
  "Cypress",
  "Jira",
  "Confluence",
  "Git",
  "Node.js",
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "Prometheus",
  "Grafana",
  "GitHub Actions",
  "Terraform",
  "Jenkins",
  "LangChain",
  "LlamaIndex",
  "OpenAI",
  "Anthropic",
  "Hugging Face",
];

const LEADING_LABEL_PATTERN = /^(?:[-*•▪◦‣]+|\d+[.)])\s*/u;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsTool(text: string, tool: string): boolean {
  const escaped = escapeRegExp(tool);
  const pattern = new RegExp(`(^|[^A-Za-z0-9])${escaped}($|[^A-Za-z0-9])`,
    tool.length <= 2 ? undefined : "i",
  );
  return pattern.test(text);
}

export interface TextSegment {
  sourceText: string;
  startIndex: number;
  endIndex: number;
}

export function splitSourceSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const boundary = /(?:\r?\n+|(?<=[.!?;])\s+)/g;
  let start = 0;

  const pushSegment = (rawStart: number, rawEnd: number): void => {
    let segmentStart = rawStart;
    let segmentEnd = rawEnd;

    while (segmentStart < segmentEnd && /\s/.test(text[segmentStart] ?? "")) {
      segmentStart += 1;
    }
    while (segmentEnd > segmentStart && /\s/.test(text[segmentEnd - 1] ?? "")) {
      segmentEnd -= 1;
    }

    const untrimmed = text.slice(segmentStart, segmentEnd);
    const labelMatch = untrimmed.match(LEADING_LABEL_PATTERN);
    if (labelMatch?.[0]) {
      segmentStart += labelMatch[0].length;
    }

    const sourceText = text.slice(segmentStart, segmentEnd).trim();
    if (sourceText.length < 3) {
      return;
    }

    const adjustedStart = text.indexOf(sourceText, segmentStart);
    if (adjustedStart < 0) {
      return;
    }

    segments.push({
      sourceText,
      startIndex: adjustedStart,
      endIndex: adjustedStart + sourceText.length,
    });
  };

  for (const match of text.matchAll(boundary)) {
    const matchIndex = match.index;
    if (typeof matchIndex !== "number") {
      continue;
    }
    pushSegment(start, matchIndex);
    start = matchIndex + match[0].length;
  }
  pushSegment(start, text.length);

  return segments;
}

function cleanPhrase(value: string): string {
  return value
    .replace(LEADING_LABEL_PATTERN, "")
    .replace(/^[,:;\-–—\s]+/, "")
    .replace(/[,:;\-–—\s]+$/, "")
    .replace(/[.?!]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceCase(value: string): string {
  const cleaned = cleanPhrase(value);
  if (!cleaned) {
    return cleaned;
  }
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}.`;
}

function baseVerb(value: string): string {
  const lower = value.toLowerCase();
  if (lower.endsWith("ies")) {
    return `${lower.slice(0, -3)}y`;
  }
  if (lower.endsWith("ing") && lower.length > 5) {
    const stem = lower.slice(0, -3);
    return stem.endsWith("at") ? `${stem}e` : stem;
  }
  if (lower.endsWith("ed") && lower.length > 4) {
    const stem = lower.slice(0, -2);
    return stem.endsWith("at") ? `${stem}e` : stem;
  }
  if (lower.endsWith("s") && lower.length > 3) {
    return lower.slice(0, -1);
  }
  return lower;
}

export function splitLeadingActionSeries(value: string): string[] {
  const cleaned = cleanPhrase(value);
  const match = cleaned.match(
    /^([A-Za-z-]+)((?:\s*,\s*[A-Za-z-]+)*\s*,?\s*(?:and|or)\s+[A-Za-z-]+)\s+(.+)$/i,
  );

  if (!match) {
    return [sentenceCase(cleaned)];
  }

  const first = match[1];
  const series = match[2];
  const object = match[3];
  if (!first || !series || !object) {
    return [sentenceCase(cleaned)];
  }

  const verbs = [first, ...(series.match(/[A-Za-z-]+/g) ?? [])].filter(
    (token) => token.toLowerCase() !== "and" && token.toLowerCase() !== "or",
  );

  if (
    verbs.length < 2 ||
    !verbs.every((verb) => ACTION_VERBS.has(baseVerb(verb)))
  ) {
    return [sentenceCase(cleaned)];
  }

  return verbs.map((verb) => sentenceCase(`${baseVerb(verb)} ${object}`));
}

function splitCommaList(value: string): string[] {
  const normalized = value.replace(/,\s*(?:and|or)\s+/gi, ", ");
  return normalized
    .split(",")
    .map(cleanPhrase)
    .filter((item) => item.length > 0);
}

export function inferNecessity(text: string): RequirementNecessity {
  const lower = text.toLowerCase();
  if (
    /\b(preferred|nice[- ]to[- ]have|bonus|ideally|a plus)\b/.test(lower)
  ) {
    return "preferred";
  }
  if (
    /\b(required|must|minimum|need(?:ed)?|shall|you have|you possess)\b/.test(
      lower,
    )
  ) {
    return "required";
  }
  return "implied";
}

export function inferPriority(
  text: string,
  necessity: RequirementNecessity,
): RequirementPriority {
  const lower = text.toLowerCase();
  if (necessity === "required" || /\b(core|critical|essential)\b/.test(lower)) {
    return "critical";
  }
  if (necessity === "preferred") {
    return "medium";
  }
  if (
    /\b(responsib\w*|build\w*|develop\w*|design\w*|deploy\w*|lead\w*|own\w*|architect\w*|deliver\w*|manage\w*|collaborat\w*|communicat\w*)\b/.test(
      lower,
    )
  ) {
    return "high";
  }
  return "medium";
}

export function inferCategory(text: string): RequirementCategory {
  const lower = text.toLowerCase();

  if (/\b(bachelor|master|phd|degree|education)\b/.test(lower)) {
    return "education";
  }
  if (/\b\d+\+?\s+years?\b|\byears? of experience\b/.test(lower)) {
    return "experience";
  }

  // Ownership and people-facing intent takes precedence over incidental domain
  // nouns such as "analytics" or "security" in the same sentence.
  if (/\b(lead|mentor|coach|manage|strategy|roadmap|technical direction)\b/.test(lower)) {
    return "leadership";
  }
  if (/\b(collaborat\w*|cross-functional|partner with|work closely|teamwork)\b/.test(lower)) {
    return "collaboration";
  }
  if (/\b(communicat\w*|present\w*|document\w*|translate\w*|stakeholder\w*|requirements gathering)\b/.test(lower)) {
    return "communication";
  }

  if (/\b(security|secure|privacy|compliance|governance|risk|threat|vulnerab\w*)\b/.test(lower)) {
    return "security";
  }
  if (/\b(deploy\w*|productioniz\w*|release|serving)\b/.test(lower)) {
    return "deployment";
  }
  if (/\b(monitor\w*|observability|telemetry|alert\w*|drift|logging|reliability|availability|uptime)\b/.test(lower)) {
    return "monitoring";
  }
  if (/\b(optimiz\w*|latency|throughput|performance|efficien\w*)\b/.test(lower)) {
    return "performance";
  }
  if (/\b(architect\w*|architecture|system design|distributed systems?)\b/.test(lower)) {
    return "architecture";
  }
  if (/\b(data pipelines?|etl|elt|warehouses?|lakehouse|data models?|analytics)\b/.test(lower)) {
    return "data";
  }
  if (/\b(scale|scalab\w*)\b/.test(lower)) {
    return "performance";
  }
  if (/\b(revenue|customer|cost|adoption|business|delivery speed|time to market)\b/.test(lower)) {
    return "business-outcome";
  }
  if (/\b(experience with|proficien\w*|knowledge of|expertise in|familiarity with)\b/.test(lower)) {
    return "technical-skill";
  }
  if (/\b(build\w*|develop\w*|design\w*|implement\w*|create\w*|maintain\w*|test\w*|integrat\w*|automat\w*)\b/.test(lower)) {
    return "technical-responsibility";
  }
  if (TOOL_NAMES.some((tool) => containsTool(text, tool))) {
    return "tool-or-platform";
  }
  return "other";
}

function createCandidate(
  sourceText: string,
  normalizedText: string,
  necessity = inferNecessity(sourceText),
): RequirementCandidate {
  return {
    sourceText,
    normalizedText: sentenceCase(normalizedText),
    category: inferCategory(normalizedText),
    priority: inferPriority(sourceText, necessity),
    necessity,
  };
}

function extractToolCandidates(sourceText: string): RequirementCandidate[] {
  const foundTools = TOOL_NAMES.filter((tool) => containsTool(sourceText, tool));
  // Prefer the longest JD product spelling (React.js over React, Node.js over Node)
  // so normalizedText stays lexically grounded in dotted evidence tokens.
  const canonicalTools = foundTools.filter(
    (tool) =>
      !foundTools.some(
        (other) =>
          other !== tool &&
          other.length > tool.length &&
          containsTool(other, tool),
      ),
  );

  if (canonicalTools.length === 0) {
    return [];
  }

  const skillContext =
    /\b(experience|proficiency|knowledge|expertise|familiarity|required|preferred|skills?)\b/i.test(
      sourceText,
    ) || /\(\s*\d+\+?\s*years?/i.test(sourceText);
  if (!skillContext && canonicalTools.length === 1) {
    return [];
  }

  const necessity = inferNecessity(sourceText);
  return canonicalTools.map((tool) =>
    createCandidate(sourceText, `Experience with ${tool}`, necessity),
  );
}

const REQUIREMENT_STOP_WORDS = new Set([
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

function hasMeaningfulRequirementPhrase(value: string): boolean {
  const tokens =
    value
      .toLowerCase()
      .match(/[a-z0-9+#]+(?:[.-][a-z0-9+#]+)*/g)
      ?.filter((token) => {
        if (TOOL_NAMES.some((tool) => tool.toLowerCase() === token)) {
          return true;
        }
        return token.length > 1 && !REQUIREMENT_STOP_WORDS.has(token);
      }) ?? [];
  return tokens.length > 0;
}

function extractRequirementList(sourceText: string): RequirementCandidate[] {
  const requiringMatch = sourceText.match(
    /\b(?:requiring|requires?|responsible for|you will|the role will)\s+(.+)$/i,
  );
  if (!requiringMatch?.[1]) {
    return [];
  }

  const items = splitCommaList(requiringMatch[1]);
  if (items.length < 2) {
    return [];
  }

  return items
    .filter((item) => hasMeaningfulRequirementPhrase(item))
    .map((item) => createCandidate(sourceText, item));
}

function isLikelyRoleTitleSegment(sourceText: string): boolean {
  const cleaned = sourceText
    .trim()
    .replace(/[.?!:]+$/g, "")
    .replace(/\s+role$/i, "")
    .trim();
  if (cleaned.split(/\s+/).length > 7) {
    return false;
  }
  return /^(?:(?:entry[- ]level|junior|mid[- ]level|senior|lead|staff|principal)\s+)?(?:(?:machine learning|ml|applied ai|generative ai|ai|data|software|backend|frontend|full[- ]stack|platform|cloud|devops|security|solutions?)\s+)?(?:engineer|scientist|developer|architect|manager)$/i.test(
    cleaned,
  );
}

function isNonActionableSegment(sourceText: string): boolean {
  const cleaned = sourceText.trim().replace(/[.?!:]+$/g, "").trim();
  if (
    /^(?:company description|job description|qualifications|expectations|additional (?:information|skills)|soft skills|our offer|position at|about the (?:role|job)|responsibilities|requirements)\b/i.test(
      cleaned,
    )
  ) {
    return true;
  }
  // Section banners such as "Expectations – the experience you need".
  if (
    /^[A-Za-z][^–—-]{0,48}\s*[–—-]\s+\S+/u.test(cleaned) &&
    cleaned.split(/\s+/).length <= 12 &&
    !/\b(?:build|develop|design|implement|deploy|collaborate|integrate|optimize|test)\b/i.test(
      cleaned,
    )
  ) {
    return true;
  }
  // Marketing / culture fluff that should never become achievement bullets.
  if (
    /\b(?:make an impact|limitless opportunities|grit\s*&\s*guts|employment with enjoyment|tech giants|unicorns)\b/i.test(
      cleaned,
    )
  ) {
    return true;
  }
  // Emoji preference lists and second-person hiring meta.
  if (
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]|✅|✓|✔/u.test(cleaned) ||
    /\b(?:bonus points?(?:\s+if)?|you(?:'d|’d)\s+rather|report(?:s|ing)? straight to|you(?:'d|’d|'ll|’ll| will)\b)\b/i.test(
      cleaned,
    )
  ) {
    return true;
  }
  return false;
}

export function candidatesFromSegment(
  sourceText: string,
): RequirementCandidate[] {
  if (isLikelyRoleTitleSegment(sourceText) || isNonActionableSegment(sourceText)) {
    return [];
  }
  const candidates: RequirementCandidate[] = [];

  const toolCandidates = extractToolCandidates(sourceText);
  candidates.push(...toolCandidates);

  const requirementList = extractRequirementList(sourceText);
  candidates.push(...requirementList);

  const atomicActions = splitLeadingActionSeries(sourceText);
  if (atomicActions.length > 1) {
    candidates.push(
      ...atomicActions.map((atomic) => createCandidate(sourceText, atomic)),
    );
  } else if (
    /^(?:architect|automate|build|collaborate|communicate|coordinate|conduct|create|define|deliver|deploy|design|develop|drive|ensure|establish|evaluate|implement|improve|integrate|lead|maintain|manage|mentor|monitor|optimize|own|partner|perform|present|productionize|reduce|scale|secure|support|test|translate|troubleshoot)(?:s|ed|ing)?\b/i.test(
      sourceText.trim(),
    )
  ) {
    // Keep the responsibility itself even when the same sentence also names
    // tools. Otherwise a sentence such as "Deploy models using Docker and
    // Kubernetes" would incorrectly produce only tool requirements and lose
    // the deployment responsibility.
    candidates.push(createCandidate(sourceText, sourceText));
  }

  const yearsMatch = sourceText.match(
    /\b\d+\+?\s+years?(?:\s+of\s+(?:relevant\s+)?experience)?/i,
  );
  if (yearsMatch?.[0]) {
    candidates.push(createCandidate(sourceText, yearsMatch[0], "required"));
  }

  const degreeMatch = sourceText.match(
    /\b(?:bachelor(?:'s)?|master(?:'s)?|ph\.?d\.?|degree)[^.;]*/i,
  );
  if (degreeMatch?.[0]) {
    candidates.push(createCandidate(sourceText, degreeMatch[0]));
  }

  if (candidates.length === 0) {
    const category = inferCategory(sourceText);
    if (category !== "other" || sourceText.split(/\s+/).length >= 5) {
      candidates.push(createCandidate(sourceText, sourceText));
    }
  }

  return candidates;
}

export function atomizeCandidate(
  candidate: RequirementCandidate,
): RequirementCandidate[] {
  const atomic = splitLeadingActionSeries(candidate.normalizedText);
  if (atomic.length <= 1) {
    return [
      {
        ...candidate,
        normalizedText: sentenceCase(candidate.normalizedText),
        category: inferCategory(candidate.normalizedText),
      },
    ];
  }

  return atomic.map((normalizedText) => ({
    ...candidate,
    normalizedText,
    category: inferCategory(normalizedText),
  }));
}
