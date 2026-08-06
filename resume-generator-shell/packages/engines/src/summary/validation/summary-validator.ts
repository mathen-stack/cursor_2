import type {
  JobDescription,
  SummaryEngineOutput,
  SummaryExperienceYears,
  SummaryKeyword,
  SummaryTargetRole,
  SummaryValidationIssue,
} from "@resume/contracts";
import { countSummaryAchievementMetrics } from "../generation/summary-metric-selector";

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

    const noPersonalPronouns =
      !/\b(?:i|me|my|mine|we|us|our|ours|you|your|yours|you(?:'re|’re)|you(?:'d|’d)|you(?:'ll|’ll)|you(?:'ve|’ve))\b/i.test(
        input.summary,
      );
    if (!noPersonalPronouns) {
      addIssue(issues, "PERSONAL_PRONOUNS", "error", "Summary contains personal pronouns.");
    }

    const noCliches = !/\b(?:results[- ]driven|dynamic(?:\s+professional)?|go[- ]getter|hard[- ]working|team player|proven track record|seasoned(?:\s+professional)?|passionate(?:\s+about)?|proactive|synergistic|motivated|detail[- ]oriented|self[- ]starter|innovative thinker|strategic thinker|(?:verbal and written\s+)?communication skills|soft skills|interpersonal skills|people skills)\b/i.test(input.summary);
    if (!noCliches) {
      addIssue(issues, "SUMMARY_CLICHE", "error", "Summary contains generic resume clichés.");
    }

    const noWeakLanguage = !/\b(?:responsible for|worked on|helped with|assisted with|involved in|participated in|duties included)\b/i.test(input.summary);
    if (!noWeakLanguage) {
      addIssue(issues, "WEAK_LANGUAGE", "error", "Summary contains weak or responsibility-based phrasing.");
    }

    const duplicateKeyword = input.usedKeywords.some((keyword) => {
      const escaped = keyword.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matches = [
        ...input.summary.matchAll(
          new RegExp(`(?:^|[^A-Za-z0-9])(${escaped})(?=[^A-Za-z0-9]|$)`, "gi"),
        ),
      ];
      const longerKeywords = input.usedKeywords
        .map((item) => item.text)
        .filter(
          (text) =>
            text.length > keyword.text.length &&
            text.toLocaleLowerCase().includes(keyword.text.toLocaleLowerCase()),
        );
      const standalone = matches.filter((match) => {
        const matchedText = match[1] ?? match[0];
        const start = (match.index ?? 0) + (match[0].length - matchedText.length);
        const end = start + matchedText.length;
        return !longerKeywords.some((longer) => {
          const longerEscaped = longer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return [
            ...input.summary.matchAll(
              new RegExp(`(?:^|[^A-Za-z0-9])(${longerEscaped})(?=[^A-Za-z0-9]|$)`, "gi"),
            ),
          ].some((longerMatch) => {
            const longerText = longerMatch[1] ?? longerMatch[0];
            const longerStart =
              (longerMatch.index ?? 0) + (longerMatch[0].length - longerText.length);
            const longerEnd = longerStart + longerText.length;
            return start >= longerStart && end <= longerEnd;
          });
        });
      });
      return standalone.length > 1;
    });
    // Allocator may select up to 2 domain + 7 technical + 3 outcome + 2 people
    // keywords; composition trims toward that ceiling. Residual repeats/overload
    // after composition stay warnings so generation does not hard-stop.
    const noKeywordStuffing = !duplicateKeyword && input.usedKeywords.length <= 14;
    if (!noKeywordStuffing) {
      addIssue(
        issues,
        "KEYWORD_STUFFING",
        "warning",
        "Summary repeats or overloads JD keywords.",
      );
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

    const achievementMetricCount = countSummaryAchievementMetrics(input.summary);
    const quantifiedMetricsApproved = achievementMetricCount >= 2;
    if (!quantifiedMetricsApproved) {
      addIssue(
        issues,
        "SUMMARY_METRICS",
        "error",
        `Summary contains ${achievementMetricCount} achievement metric(s); expected at least 2 unique hard numbers.`,
      );
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
      quantifiedMetricsApproved,
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
      quantifiedMetricsApproved,
      resumeWordedReadinessScore,
      issues,
      overallStatus,
    };
  }
}
