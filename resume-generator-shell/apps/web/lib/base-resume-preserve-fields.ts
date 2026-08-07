import type { BaseResumeExtracted } from "@resume/contracts";
import { parseBaseResumeText } from "./base-resume-parser";
import { decodeEncodedPdfText } from "./pdf-encoding-decode";

/**
 * Light cleanup for preserved summary text — do NOT run bullet sanitizers,
 * which capitalize/truncate and can destroy multi-sentence summaries.
 */
export function preserveOriginalSummaryText(text: string): string {
  return decodeEncodedPdfText(text)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ensure summary/skills on a stored extract are filled from raw resume text
 * when older uploads left them empty (so Tailor does not fall back to generated).
 */
export function ensurePreservedExtractedFields(
  extracted: BaseResumeExtracted,
  rawText?: string,
): BaseResumeExtracted {
  const hasSummary = Boolean(extracted.summary?.trim());
  const hasSkills = (extracted.skills?.length ?? 0) > 0;
  if (hasSummary && hasSkills) {
    return {
      ...extracted,
      summary: preserveOriginalSummaryText(extracted.summary),
      skills: extracted.skills.map((skill) => skill.trim()).filter(Boolean),
    };
  }

  if (!rawText || rawText.trim().length < 40) {
    return {
      ...extracted,
      summary: preserveOriginalSummaryText(extracted.summary || ""),
      skills: (extracted.skills || []).map((skill) => skill.trim()).filter(Boolean),
    };
  }

  try {
    const reparsed = parseBaseResumeText(rawText);
    return {
      ...extracted,
      summary: preserveOriginalSummaryText(
        extracted.summary?.trim() || reparsed.summary || "",
      ),
      skills:
        (extracted.skills?.length ?? 0) > 0
          ? extracted.skills.map((skill) => skill.trim()).filter(Boolean)
          : reparsed.skills,
    };
  } catch {
    return {
      ...extracted,
      summary: preserveOriginalSummaryText(extracted.summary || ""),
      skills: (extracted.skills || []).map((skill) => skill.trim()).filter(Boolean),
    };
  }
}
