import type { SkillEvidence, SkillPriority } from "@resume/contracts";
import { SKILL_DEFINITIONS, type SkillDefinition } from "../skill-taxonomy";
import type {
  SkillCandidate,
  SkillExtractionInput,
  SkillExtractionOutput,
} from "../types/skill-candidate";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasPattern(alias: string, caseSensitive: boolean): RegExp {
  const escaped = escapeRegExp(alias).replace(/\\ /g, "\\s+");
  const startsWithWord = /^[A-Za-z0-9]/.test(alias);
  const endsWithWord = /[A-Za-z0-9]$/.test(alias);
  const source = `${startsWithWord ? "(?<![A-Za-z0-9])" : ""}${escaped}${
    endsWithWord ? "(?![A-Za-z0-9])" : ""
  }`;
  return new RegExp(source, caseSensitive ? "g" : "gi");
}

function surroundingSentence(text: string, index: number, length: number): string {
  const before = text.slice(0, index);
  const previousBoundary = Math.max(
    before.lastIndexOf("\n"),
    before.lastIndexOf("."),
    before.lastIndexOf(";"),
  );
  const afterStart = index + length;
  const candidates = [
    text.indexOf("\n", afterStart),
    text.indexOf(".", afterStart),
    text.indexOf(";", afterStart),
  ].filter((value) => value >= 0);
  const nextBoundary = candidates.length > 0 ? Math.min(...candidates) : text.length;
  return text.slice(previousBoundary + 1, nextBoundary + 1).trim();
}

function priorityFor(
  text: string,
  evidence: SkillEvidence[],
  mentionCount: number,
): { priority: SkillPriority; score: number } {
  const first = evidence[0];
  if (!first) {
    return { priority: "medium", score: 55 };
  }

  const contexts = evidence.map((item) =>
    surroundingSentence(text, item.startIndex, item.endIndex - item.startIndex),
  );
  const combined = contexts.join(" ").toLowerCase();
  const inTitle = first.startIndex <= Math.max(120, text.indexOf("\n") + 1);
  const required = /\b(required|must|minimum|need(?:ed)?|essential|shall)\b/.test(
    combined,
  );
  const preferred = /\b(preferred|nice[- ]to[- ]have|bonus|ideally|a plus)\b/.test(
    combined,
  );

  if (required || inTitle || mentionCount >= 3) {
    return { priority: "critical", score: Math.min(100, 91 + mentionCount * 2) };
  }
  if (preferred) {
    return { priority: "medium", score: Math.min(78, 61 + mentionCount * 4) };
  }
  if (mentionCount >= 2 || first.startIndex < text.length * 0.55) {
    return { priority: "high", score: Math.min(90, 78 + mentionCount * 4) };
  }
  return { priority: "high", score: 76 };
}

function findEvidence(text: string, definition: SkillDefinition): SkillEvidence[] {
  const byRange = new Map<string, SkillEvidence>();
  for (const alias of definition.aliases) {
    const pattern = aliasPattern(alias, definition.caseSensitive ?? false);
    for (const match of text.matchAll(pattern)) {
      if (typeof match.index !== "number" || !match[0]) continue;
      const startIndex = match.index;
      const endIndex = match.index + match[0].length;
      // Skip matches that are only a fragment of a longer catalog alias
      // (e.g. bare "CSS" inside "CSS Modules" or "Tailwind CSS").
      const subsumed = SKILL_DEFINITIONS.some((other) => {
        if (other.key === definition.key) return false;
        return other.aliases.some((otherAlias) => {
          if (otherAlias.length <= match[0]!.length) return false;
          const otherPattern = aliasPattern(
            otherAlias,
            other.caseSensitive ?? false,
          );
          for (const otherMatch of text.matchAll(otherPattern)) {
            if (typeof otherMatch.index !== "number" || !otherMatch[0]) continue;
            const otherStart = otherMatch.index;
            const otherEnd = otherMatch.index + otherMatch[0].length;
            if (otherStart <= startIndex && otherEnd >= endIndex) {
              return true;
            }
          }
          return false;
        });
      });
      if (subsumed) continue;
      const evidence = {
        sourceText: match[0],
        startIndex,
        endIndex,
      };
      byRange.set(`${evidence.startIndex}:${evidence.endIndex}`, evidence);
    }
  }
  return [...byRange.values()].sort((left, right) => left.startIndex - right.startIndex);
}

export class ExplicitSkillExtractor {
  readonly name = "explicit-skill-extractor";

  async execute(input: SkillExtractionInput): Promise<SkillExtractionOutput> {
    const text = input.jobDescription.rawText;
    const candidates: SkillCandidate[] = [];

    for (const definition of SKILL_DEFINITIONS) {
      const evidence = findEvidence(text, definition);
      if (evidence.length === 0) continue;
      const ranked = priorityFor(text, evidence, evidence.length);
      candidates.push({
        key: definition.key,
        name: definition.name,
        category: definition.category,
        source: "explicit",
        priority: ranked.priority,
        score: ranked.score,
        evidence,
        inferredFrom: [],
        mentionCount: evidence.length,
      });
    }

    return {
      context: input.context,
      candidates: candidates.sort(
        (left, right) => right.score - left.score || left.name.localeCompare(right.name),
      ),
    };
  }
}
