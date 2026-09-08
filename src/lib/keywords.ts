import type { ExtractedJD } from "./types";

/** Split text into segments, bolding keyword matches (case-insensitive, longer first). */
export function segmentWithKeywords(
  text: string,
  keywords: string[],
): Array<{ text: string; bold: boolean }> {
  // Safety net: never render markdown bold markers in the final document
  const cleaned = String(text || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/__/g, "");

  const unique = Array.from(
    new Set(
      keywords
        .map((k) => k.trim())
        .filter((k) => k.length >= 2)
        .sort((a, b) => b.length - a.length),
    ),
  );

  if (!unique.length || !cleaned) {
    return [{ text: cleaned, bold: false }];
  }

  const escaped = unique.map((k) =>
    k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = cleaned.split(pattern);

  return parts
    .filter((part) => part.length > 0)
    .map((part) => {
      const isKeyword = unique.some(
        (k) => k.toLowerCase() === part.toLowerCase(),
      );
      return { text: part, bold: isKeyword };
    });
}

function bulletList(label: string, items: string[]): string[] {
  return [label, ...(items.length ? items.map((s) => `- ${s}`) : ["- None"])];
}

export function formatExtractedJd(extracted: ExtractedJD): string {
  return [
    `Company: ${extracted.company}`,
    `Target role / title: ${extracted.targetRole}`,
    "",
    ...bulletList("Required skills:", extracted.requiredSkills),
    "",
    ...bulletList("Core responsibilities:", extracted.coreResponsibilities),
    "",
    ...bulletList("Frequently repeated technologies:", extracted.repeatedTechnologies),
    "",
    ...bulletList("Preferred skills:", extracted.preferredSkills),
    "",
    ...bulletList("Domain knowledge:", extracted.domainKnowledge),
    "",
    ...bulletList("Soft skills:", extracted.softSkills),
  ].join("\n");
}
