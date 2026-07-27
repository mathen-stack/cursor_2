import { randomUUID } from "node:crypto";
import type {
  EvidenceSectionId,
  JobDescription,
  SourceEvidenceBundle,
  SourceEvidenceClaim,
  SourceEvidenceSpan,
} from "@resume/contracts";
import { normalizeSourceResume } from "./normalize-source-resume";

const EXTRACTOR_VERSION = "1.0.0";

const SECTION_HEADERS: ReadonlyArray<{ id: EvidenceSectionId; pattern: RegExp }> = [
  { id: "summary", pattern: /^(?:professional\s+)?summary|profile|objective$/i },
  { id: "skills", pattern: /^(?:technical\s+)?skills|technologies|tools$/i },
  { id: "experience", pattern: /^(?:work\s+|professional\s+)?experience|employment$/i },
  { id: "education", pattern: /^education$/i },
  { id: "projects", pattern: /^projects$/i },
];

// Avoid trailing \\b after %/x: "%" is non-word, so "\\b" often fails before spaces.
const METRIC_PATTERN =
  /\b\d+(?:\.\d+)?\s?(?:%|x|ms|hours?|days?|weeks?|months?|years?)(?=$|[\s,.;:)])/gi;
const TOOL_PATTERN =
  /\b(?:Python|Java|JavaScript|TypeScript|React(?:\.js)?|Next\.js|Node\.js|Docker|Kubernetes|AWS|Azure|GCP|PostgreSQL|MySQL|MongoDB|Redis|Kafka|Spark|Airflow|Terraform|PyTorch|TensorFlow|MLflow|Swift|Kotlin|Solidity|Playwright|Selenium|Cypress|Git)\b/g;

function detectSection(line: string): EvidenceSectionId | null {
  const cleaned = line.replace(/[:\-–—]/g, "").trim();
  for (const header of SECTION_HEADERS) {
    if (header.pattern.test(cleaned) && cleaned.split(/\s+/).length <= 4) {
      return header.id;
    }
  }
  return null;
}

function spanFor(
  normalizedText: string,
  matchText: string,
  startIndex: number,
  sectionId: EvidenceSectionId,
  employerHint?: string,
  titleHint?: string,
): SourceEvidenceSpan | null {
  const exactStart = normalizedText.indexOf(matchText, startIndex);
  if (exactStart < 0) {
    return null;
  }
  return {
    sectionId,
    sourceText: matchText,
    startIndex: exactStart,
    endIndex: exactStart + matchText.length,
    employerHint,
    titleHint,
  };
}

function normalizeClaimText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function jdMentions(jobDescription: JobDescription, value: string): boolean {
  return jobDescription.normalizedText
    .toLowerCase()
    .includes(value.toLowerCase());
}

/**
 * Extracts grounded claims from a candidate source resume.
 * JD relevance is annotated, but JD text is never treated as candidate proof.
 */
export function extractSourceEvidence(input: {
  sourceResumeText: string;
  jobDescription: JobDescription;
}): SourceEvidenceBundle {
  const normalized = normalizeSourceResume(input.sourceResumeText);
  const text = normalized.normalizedText;
  const claims: SourceEvidenceClaim[] = [];
  let currentSection: EvidenceSectionId = "other";
  let employerHint: string | undefined;
  let titleHint: string | undefined;
  let offset = 0;

  for (const line of text.split("\n")) {
    const lineStart = text.indexOf(line, offset);
    offset = lineStart + line.length;
    const section = detectSection(line);
    if (section) {
      currentSection = section;
      continue;
    }

    if (currentSection === "experience") {
      const employerMatch = line.match(
        /^([A-Z][A-Za-z0-9&.,'\/\- ]{1,60})\s+[|–-]\s+/,
      );
      if (employerMatch?.[1]) {
        employerHint = employerMatch[1].trim();
      }
      const titleMatch = line.match(
        /\b((?:Senior|Staff|Lead|Principal)?\s?[A-Za-z].{0,40}(?:Engineer|Developer|Scientist|Architect|Manager))\b/,
      );
      if (titleMatch?.[1]) {
        titleHint = titleHint ?? titleMatch[1].trim();
      }
    }

    const metricPattern = new RegExp(METRIC_PATTERN.source, METRIC_PATTERN.flags);
    for (const match of line.matchAll(metricPattern)) {
      const metric = match[0] ?? "";
      const localIndex = match.index ?? 0;
      const span = spanFor(
        text,
        metric,
        Math.max(0, lineStart + localIndex),
        currentSection,
        employerHint,
        titleHint,
      );
      if (!span) continue;
      const strength =
        currentSection === "experience" || currentSection === "projects"
          ? "strong"
          : currentSection === "summary"
            ? "moderate"
            : "weak";
      claims.push({
        claimId: `EV-METRIC-${randomUUID()}`,
        kind: "metric",
        text: metric,
        normalizedText: normalizeClaimText(metric),
        strength,
        span,
        jdRelevant: true,
        usableForFacts: strength === "strong" || strength === "moderate",
        notes: ["Metric extracted from source resume span."],
      });
    }

    const toolPattern = new RegExp(TOOL_PATTERN.source, TOOL_PATTERN.flags);
    for (const match of line.matchAll(toolPattern)) {
      const tool = match[0] ?? "";
      const localIndex = match.index ?? 0;
      const span = spanFor(
        text,
        tool,
        Math.max(0, lineStart + localIndex),
        currentSection === "other" ? "skills" : currentSection,
        employerHint,
        titleHint,
      );
      if (!span) continue;
      const inJd = jdMentions(input.jobDescription, tool);
      const strength =
        currentSection === "experience" || currentSection === "projects"
          ? inJd
            ? "strong"
            : "moderate"
          : currentSection === "skills"
            ? inJd
              ? "moderate"
              : "keyword-only"
            : "keyword-only";
      claims.push({
        claimId: `EV-TOOL-${randomUUID()}`,
        kind: tool.length <= 24 ? "tool" : "skill",
        text: tool,
        normalizedText: normalizeClaimText(tool),
        strength,
        span,
        jdRelevant: inJd,
        usableForFacts:
          (strength === "strong" || strength === "moderate") && inJd,
        notes: inJd
          ? ["Tool/skill appears in both source resume and JD."]
          : ["Present in source resume but not JD-relevant; cannot invent JD coverage."],
      });
    }

    if (
      (currentSection === "experience" || currentSection === "projects") &&
      /^(?:[-•*]|\d+\.)\s+/.test(line.trim()) &&
      line.trim().length > 24
    ) {
      const bullet = line.replace(/^(?:[-•*]|\d+\.)\s+/, "").trim();
      const span = spanFor(text, bullet, lineStart, currentSection, employerHint, titleHint);
      if (span) {
        const hasMetric = new RegExp(METRIC_PATTERN.source, METRIC_PATTERN.flags).test(bullet);
        claims.push({
          claimId: `EV-RESULT-${randomUUID()}`,
          kind: hasMetric ? "result" : "responsibility",
          text: bullet,
          normalizedText: normalizeClaimText(bullet),
          strength: hasMetric ? "strong" : "moderate",
          span,
          jdRelevant: true,
          usableForFacts: true,
          notes: ["Experience/project bullet grounded in source resume."],
        });
      }
    }
  }

  // Deduplicate exact normalized claim text + kind, keeping strongest.
  const rank: Record<string, number> = {
    strong: 5,
    moderate: 4,
    weak: 3,
    "keyword-only": 2,
    "not-found": 1,
    conflicting: 0,
  };
  const best = new Map<string, SourceEvidenceClaim>();
  for (const claim of claims) {
    const key = `${claim.kind}:${claim.normalizedText}:${claim.span.employerHint ?? ""}`;
    const existing = best.get(key);
    const claimRank = rank[claim.strength] ?? 0;
    const existingRank = existing ? (rank[existing.strength] ?? 0) : -1;
    if (!existing || claimRank > existingRank) {
      best.set(key, claim);
    }
  }

  return {
    bundleId: `EVB-${randomUUID()}`,
    sourceResumeHash: normalized.contentHash,
    normalizedText: text,
    claims: [...best.values()],
    extractedAt: new Date().toISOString(),
    extractorVersion: EXTRACTOR_VERSION,
  };
}
