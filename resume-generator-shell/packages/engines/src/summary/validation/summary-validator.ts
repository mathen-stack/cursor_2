import type {
  JobDescription,
  SummaryEngineOutput,
  SummaryExperienceYears,
  SummaryKeyword,
  SummaryTargetRole,
  SummaryValidationIssue,
} from "@resume/contracts";

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countSentences(text: string): number {
  return text.split(/[.!?]+(?:\s+|$)/).map((value) => value.trim()).filter(Boolean).length;
}

function addIssue(
  issues: SummaryValidationIssue[],
  issueCode: string,
  severity: "warning" | "error",
  message: string,
): void {
  issues.push({ issueCode, severity, message });
}

function keywordPresent(summary: string, keyword: SummaryKeyword): boolean {
  return summary.toLowerCase().includes(keyword.text.toLowerCase());
}

export class SummaryValidator {
  validate(input: {
    jobDescription: JobDescription;
    summary: string;
    targetRole: SummaryTargetRole;
    experienceYears: SummaryExperienceYears;
    allocatedKeywords: readonly SummaryKeyword[];
    usedKeywords: readonly SummaryKeyword[];
    minimumWords: number;
    maximumWords: number;
  }): SummaryEngineOutput["validation"] {
    const issues: SummaryValidationIssue[] = [];
    const count = wordCount(input.summary);
    const lower = input.summary.toLowerCase();

    const wordCountApproved = count >= input.minimumWords && count <= input.maximumWords;
    if (!wordCountApproved) {
      addIssue(
        issues,
        "SUMMARY_WORD_COUNT",
        "error",
        `Summary contains ${count} words; expected ${input.minimumWords}-${input.maximumWords}.`,
      );
    }

    const targetRolePresent = lower.includes(input.targetRole.title.toLowerCase());
    if (!targetRolePresent) {
      addIssue(issues, "TARGET_ROLE_MISSING", "error", "Target role is not stated explicitly in the summary.");
    }

    const yearsOfExperiencePresent = lower.includes(input.experienceYears.display.toLowerCase());
    if (!yearsOfExperiencePresent) {
      addIssue(issues, "EXPERIENCE_YEARS_MISSING", "error", "JD-appropriate years of experience are missing.");
    }

    const usedDirect = input.usedKeywords.filter(
      (keyword) => keyword.source === "direct" && keywordPresent(input.summary, keyword),
    );
    const requiredCoverage = Math.min(4, input.allocatedKeywords.length);
    const directKeywordCoverageApproved = usedDirect.length >= requiredCoverage;
    if (!directKeywordCoverageApproved) {
      addIssue(
        issues,
        "DIRECT_KEYWORD_COVERAGE",
        "error",
        `Summary uses ${usedDirect.length} direct JD keywords; expected at least ${requiredCoverage}.`,
      );
    }

    const seniorityAligned = input.targetRole.seniority === "mid"
      ? true
      : lower.includes(input.targetRole.title.toLowerCase());
    if (!seniorityAligned) {
      addIssue(issues, "SENIORITY_ALIGNMENT", "error", "Summary language does not align with the detected JD seniority.");
    }

    const noPersonalPronouns = !/\b(?:i|me|my|mine|we|us|our|ours)\b/i.test(input.summary);
    if (!noPersonalPronouns) {
      addIssue(issues, "PERSONAL_PRONOUNS", "error", "Summary contains first-person pronouns.");
    }

    const noCliches = !/\b(?:results[- ]driven|dynamic professional|go[- ]getter|hard[- ]working|team player|proven track record|seasoned professional|passionate about)\b/i.test(input.summary);
    if (!noCliches) {
      addIssue(issues, "SUMMARY_CLICHE", "error", "Summary contains generic resume clichés.");
    }

    const noWeakLanguage = !/\b(?:responsible for|worked on|helped with|assisted with|involved in|participated in|duties included)\b/i.test(input.summary);
    if (!noWeakLanguage) {
      addIssue(issues, "WEAK_LANGUAGE", "error", "Summary contains weak or responsibility-based phrasing.");
    }

    const duplicateKeyword = input.usedKeywords.some((keyword) => {
      const escaped = keyword.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matches = input.summary.match(new RegExp(escaped, "gi"));
      return (matches?.length ?? 0) > 1;
    });
    const noKeywordStuffing = !duplicateKeyword && input.usedKeywords.length <= 12;
    if (!noKeywordStuffing) {
      addIssue(issues, "KEYWORD_STUFFING", "error", "Summary repeats or overloads JD keywords.");
    }

    const sentenceCount = countSentences(input.summary);
    const sentenceStructureApproved = sentenceCount >= 2 && sentenceCount <= 4;
    if (!sentenceStructureApproved) {
      addIssue(issues, "SENTENCE_STRUCTURE", "error", `Summary uses ${sentenceCount} sentences; expected 2-4.`);
    }

    const atsLanguageApproved =
      !/[•◆★✓→│]/u.test(input.summary) &&
      !/[\u{1F300}-\u{1FAFF}]/u.test(input.summary) &&
      !/\s{2,}/.test(input.summary) &&
      /^[\x20-\x7E\u00C0-\u024F]+$/u.test(input.summary);
    if (!atsLanguageApproved) {
      addIssue(issues, "ATS_LANGUAGE", "error", "Summary contains formatting or symbols that may reduce ATS readability.");
    }

    for (const keyword of input.usedKeywords) {
      for (const evidence of keyword.evidence) {
        if (input.jobDescription.rawText.slice(evidence.startIndex, evidence.endIndex) !== evidence.sourceText) {
          addIssue(
            issues,
            "KEYWORD_EVIDENCE",
            "error",
            `Keyword ${keyword.keywordId} is not grounded in the immutable JD text.`,
          );
        }
      }
    }

    const checks = [
      wordCountApproved,
      targetRolePresent,
      yearsOfExperiencePresent,
      directKeywordCoverageApproved,
      seniorityAligned,
      noPersonalPronouns,
      noCliches,
      noWeakLanguage,
      noKeywordStuffing,
      sentenceStructureApproved,
      atsLanguageApproved,
      issues.every((issue) => issue.issueCode !== "KEYWORD_EVIDENCE"),
    ];
    const resumeWordedReadinessScore = Math.round(
      (checks.filter(Boolean).length / checks.length) * 100,
    );
    const overallStatus = issues.some((issue) => issue.severity === "error")
      ? "rejected"
      : "approved";

    return {
      wordCountApproved,
      targetRolePresent,
      yearsOfExperiencePresent,
      directKeywordCoverageApproved,
      seniorityAligned,
      noPersonalPronouns,
      noCliches,
      noWeakLanguage,
      noKeywordStuffing,
      sentenceStructureApproved,
      atsLanguageApproved,
      resumeWordedReadinessScore,
      issues,
      overallStatus,
    };
  }
}
