import type {
  FinalResumeData,
  ResumeReadinessCategoryId,
  ResumeReadinessCategoryScore,
  ResumeReadinessCriticalGates,
  ResumeReadinessIssue,
  ResumeReadinessMetrics,
  ResumeReadinessOwner,
  ResumeWordedReadinessReport,
} from "@resume/contracts";
import { fingerprint } from "../assembly/stable-serialization";

const VERSION = "1.0.0";
const TARGET_SCORE = 95 as const;

const WEIGHTS: Record<ResumeReadinessCategoryId, number> = {
  impact: 16,
  "quantified-achievements": 12,
  "action-verbs": 8,
  brevity: 8,
  "jd-relevance": 16,
  "skills-coverage": 8,
  "leadership-and-growth": 8,
  "communication-and-collaboration": 6,
  "repetition-control": 8,
  "ats-and-formatting": 7,
  "section-completeness": 3,
};

const LABELS: Record<ResumeReadinessCategoryId, string> = {
  impact: "Impact",
  "quantified-achievements": "Quantified achievements",
  "action-verbs": "Action verbs",
  brevity: "Brevity and readability",
  "jd-relevance": "JD relevance",
  "skills-coverage": "Skills coverage",
  "leadership-and-growth": "Leadership and growth",
  "communication-and-collaboration": "Communication and collaboration",
  "repetition-control": "Repetition control",
  "ats-and-formatting": "ATS and formatting",
  "section-completeness": "Section completeness",
};

const METRIC_PATTERN = /(?:\b\d+(?:\.\d+)?\s?%|\b\d+(?:\.\d+)?x\b|\b\d[\d,]*(?:\.\d+)?\+?\s*(?:ms|seconds?|minutes?|hours?|days?|weeks?|months?|years?|requests?|users?|models?|pipelines?|records?|transactions?|teams?|engineers?|services?|applications?|customers?|tickets?|TB|GB|MB|K|M|B)\b|\b99(?:\.\d+)?%\b)/i;
const WEAK_OPENING_PATTERN = /^(?:worked on|helped|assisted|responsible for|participated|involved in|supported)\b/i;
const PERSONAL_PRONOUN_PATTERN = /\b(?:i|me|my|mine|we|our|ours)\b/i;
const COMMUNICATION_PATTERN = /\b(?:collaborat|stakeholder|communicat|present|partner|cross-functional|requirements|mentor|document|facilitat|product team|engineering team)\w*/i;
const LEADERSHIP_PATTERN = /\b(?:led|architected|spearheaded|mentored|directed|owned|established|guided|roadmap|strategy|architecture)\b/i;
const IMPACT_PATTERN = /\b(?:reduc|increas|improv|accelerat|cut|lower|raise|maintain|achiev|enable|save|boost|expand|strengthen|stabiliz|optimiz)\w*/i;
const SENIORITY_PATTERN = /\b(?:senior|lead|staff|principal|manager|director|head|chief)\b/i;

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function average(values: number[], fallback = 0): number {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : fallback;
}

function categoryStatus(score: number): ResumeReadinessCategoryScore["status"] {
  if (score >= 90) return "strong";
  if (score >= 80) return "acceptable";
  if (score >= 65) return "weak";
  return "critical";
}

function makeCategory(
  categoryId: ResumeReadinessCategoryId,
  rawScore: number,
  evidence: string[],
): ResumeReadinessCategoryScore {
  const score = round(clamp(rawScore), 1);
  const weight = WEIGHTS[categoryId];
  return {
    categoryId,
    label: LABELS[categoryId],
    weight,
    score,
    weightedPoints: round((score * weight) / 100, 2),
    status: categoryStatus(score),
    evidence,
  };
}

function duplicateGroupCount(data: FinalResumeData): number {
  const validation = data.experience.validation;
  return [
    validation.exactRepetitionGroups,
    validation.morphologicalRepetitionGroups,
    validation.semanticRepetitionGroups,
    validation.structuralRepetitionGroups,
    validation.metricRepetitionGroups,
  ].reduce((count, groups) => count + (groups?.length ?? 0), 0);
}

function contentFingerprintApproved(data: FinalResumeData): boolean {
  const { contentFingerprint: _ignored, ...withoutFingerprint } = data.document;
  return fingerprint(withoutFingerprint) === data.document.contentFingerprint;
}

function buildIssue(
  issueCode: string,
  severity: "warning" | "error",
  categoryId: ResumeReadinessCategoryId,
  owner: ResumeReadinessOwner,
  message: string,
  suggestedAction: string,
  affectedIds: string[] = [],
  blocksExternalTest = severity === "error",
): ResumeReadinessIssue {
  return {
    issueCode,
    severity,
    categoryId,
    owner,
    message,
    suggestedAction,
    affectedIds,
    blocksExternalTest,
  };
}

function sourceEnginesApproved(data: FinalResumeData): boolean {
  return [data.summary, data.skills, data.experience, data.template].every(
    (output) => output.status === "approved",
  );
}

export interface ResumeReadinessEvaluator {
  assess(data: FinalResumeData): ResumeWordedReadinessReport;
}

export class ResumeWordedReadinessEngine implements ResumeReadinessEvaluator {
  assess(data: FinalResumeData): ResumeWordedReadinessReport {
    const bullets = data.experience.experiences.flatMap((entry) => entry.bullets);
    const totalBullets = bullets.length;
    const approvedBullets = bullets.filter((bullet) => bullet.status === "approved").length;
    const quantifiedBullets = bullets.filter((bullet) =>
      METRIC_PATTERN.test(`${bullet.result} ${bullet.finalBullet}`),
    ).length;
    const bulletWordCounts = bullets.map((bullet) => wordCount(bullet.finalBullet));
    const bulletsWithinPreferredLength = bulletWordCounts.filter(
      (count) => count >= 15 && count <= 42,
    ).length;
    const perRoleActionVerbRatios = data.experience.experiences.map((entry) => {
      const roleVerbs = new Set(
        entry.bullets.map((bullet) => bullet.actionVerb.trim().toLowerCase()),
      );
      return entry.bullets.length ? roleVerbs.size / entry.bullets.length : 0;
    });
    const uniqueActionVerbCount = data.experience.experiences.reduce(
      (total, entry) =>
        total +
        new Set(
          entry.bullets.map((bullet) => bullet.actionVerb.trim().toLowerCase()),
        ).size,
      0,
    );
    const quantifiedBulletRatio = totalBullets ? quantifiedBullets / totalBullets : 0;
    const preferredLengthRatio = totalBullets
      ? bulletsWithinPreferredLength / totalBullets
      : 0;
    const uniqueActionVerbRatio = average(perRoleActionVerbRatios);
    const diagnostics = data.experience.validation.diagnostics ?? [];
    const averageExperienceStrength = diagnostics.length
      ? average(diagnostics.map((diagnostic) => diagnostic.scores.overall)) * 10
      : average(bullets.map((bullet) => bullet.strengthScore)) * 10;
    const averageExperienceDistinctiveness = diagnostics.length
      ? average(diagnostics.map((diagnostic) => diagnostic.scores.distinctiveness)) * 10
      : average(bullets.map((bullet) => bullet.distinctivenessScore)) * 10;
    const directSummaryKeywordCount = data.summary.keywords.filter(
      (keyword) => keyword.source === "direct",
    ).length;
    const communicationBulletCount = bullets.filter((bullet) =>
      COMMUNICATION_PATTERN.test(
        `${bullet.finalBullet} ${bullet.directKeywords.join(" ")} ${bullet.supportingKeywords.join(" ")}`,
      ),
    ).length;
    const leadershipSignalCount = bullets.filter((bullet) =>
      LEADERSHIP_PATTERN.test(`${bullet.actionVerb} ${bullet.finalBullet}`),
    ).length;
    const repeatedGroups = duplicateGroupCount(data);
    const sectionIds = new Set<string>(
      data.document.sections.map((section) => section.id),
    );
    const requiredSections = data.template.template.sections.filter(
      (section) => section.required,
    );
    const presentRequiredSectionCount = requiredSections.filter((section) =>
      sectionIds.has(section.id),
    ).length;

    const experienceAlignmentScores = diagnostics.map(
      (diagnostic) => diagnostic.scores.jdAlignment * 10,
    );
    const jdCoverageScore = average(
      [
        data.summary.validation.directKeywordCoverageApproved ? 100 : 55,
        data.skills.validation.explicitSkillsCovered ? 100 : 55,
        data.experience.validation.allBulletsTraceable ? 100 : 60,
        experienceAlignmentScores.length ? average(experienceAlignmentScores) : 85,
      ],
      0,
    );

    const metrics: ResumeReadinessMetrics = {
      totalBullets,
      approvedBullets,
      quantifiedBullets,
      quantifiedBulletRatio: round(quantifiedBulletRatio, 3),
      averageBulletWords: round(average(bulletWordCounts), 1),
      bulletsWithinPreferredLength,
      preferredLengthRatio: round(preferredLengthRatio, 3),
      uniqueActionVerbRatio: round(uniqueActionVerbRatio, 3),
      averageExperienceStrength: round(averageExperienceStrength, 1),
      averageExperienceDistinctiveness: round(
        averageExperienceDistinctiveness,
        1,
      ),
      directSummaryKeywordCount,
      explicitSkillCount: data.skills.validation.explicitSkillCount,
      inferredSkillCount: data.skills.validation.inferredSkillCount,
      skillCount: data.skills.validation.totalSkillCount,
      jdCoverageScore: round(jdCoverageScore, 1),
      communicationBulletCount,
      leadershipSignalCount,
      duplicateGroupCount: repeatedGroups,
      requiredSectionCount: requiredSections.length,
      presentRequiredSectionCount,
    };

    const impactBulletRatio = totalBullets
      ? bullets.filter(
          (bullet) =>
            IMPACT_PATTERN.test(`${bullet.result} ${bullet.finalBullet}`) &&
            bullet.outcomeKeywords.length > 0,
        ).length / totalBullets
      : 0;
    const impactScore = average([
      averageExperienceStrength,
      impactBulletRatio * 100,
      diagnostics.length
        ? average(diagnostics.map((diagnostic) => diagnostic.scores.businessValue)) * 10
        : 90,
    ]);

    const summaryAchievementMetricCount = [
      ...data.summary.summary.matchAll(/\b\d+(?:\.\d+)?\s?%/g),
      ...data.summary.summary.matchAll(/\b\d+(?:\.\d+)?x\b/gi),
    ].length;
    const quantifiedScore = average([
      quantifiedBulletRatio * 100,
      summaryAchievementMetricCount >= 2
        ? 100
        : summaryAchievementMetricCount === 1
          ? 55
          : 30,
    ]);
    const weakOpenings = bullets.filter((bullet) =>
      WEAK_OPENING_PATTERN.test(bullet.finalBullet),
    );
    const actionVerbScore = clamp(
      uniqueActionVerbRatio * 90 +
        (weakOpenings.length === 0 ? 10 : -weakOpenings.length * 12),
    );
    const longBullets = bulletWordCounts.filter((count) => count > 46).length;
    const shortBullets = bulletWordCounts.filter((count) => count < 14).length;
    const brevityScore = clamp(
      preferredLengthRatio * 100 - longBullets * 8 - shortBullets * 5,
    );
    const relevanceScore = jdCoverageScore;
    const skillsScore = average([
      data.skills.validation.explicitSkillsCovered ? 100 : 55,
      data.skills.validation.noDuplicateSkills ? 100 : 60,
      data.skills.validation.categoryStructureApproved ? 100 : 70,
      data.skills.validation.inferredSkillsGrounded ? 100 : 60,
      data.skills.validation.skillDensityApproved ? 100 : 70,
    ]);

    const seniorTarget = SENIORITY_PATTERN.test(data.summary.targetRole.title) ||
      ["senior", "lead", "staff", "principal", "manager"].includes(
        data.summary.targetRole.seniority,
      );
    const distinctRoleCount = new Set(
      data.experience.experiences.map((entry) => entry.assignedRole.toLowerCase()),
    ).size;
    const leadershipScore = average([
      seniorTarget
        ? data.experience.validation.leadershipCoverage && leadershipSignalCount > 0
          ? 100
          : 55
        : 100,
      data.experience.validation.allRolesSeniorityConsistent === false ? 55 : 100,
      data.experience.experiences.length <= 1 || distinctRoleCount > 1 ? 100 : 82,
    ]);
    const communicationScore = average([
      data.experience.validation.communicationCoverage ? 100 : 55,
      communicationBulletCount >= Math.min(2, data.experience.experiences.length)
        ? 100
        : communicationBulletCount > 0
          ? 85
          : 45,
    ]);
    const repetitionScore = clamp(
      averageExperienceDistinctiveness - repeatedGroups * 15,
    );
    const atsScore = average([
      data.template.validation.atsSafeguardsApproved ? 100 : 40,
      data.template.validation.singleColumnApproved ? 100 : 40,
      data.template.validation.typographyApproved ? 100 : 65,
      data.template.validation.sectionOrderApproved ? 100 : 50,
      data.experience.validation.atsLanguageApproved === false ? 55 : 100,
      data.summary.validation.atsLanguageApproved ? 100 : 60,
      data.assemblyValidation.overallStatus === "approved" ? 100 : 0,
    ]);
    const sectionCompletenessScore = requiredSections.length
      ? (presentRequiredSectionCount / requiredSections.length) * 100
      : 100;

    const categories = [
      makeCategory("impact", impactScore, [
        `${round(impactBulletRatio * 100)}% of bullets contain an outcome-oriented impact statement.`,
        `Average Experience strength is ${round(averageExperienceStrength, 1)}/100.`,
      ]),
      makeCategory("quantified-achievements", quantifiedScore, [
        `${quantifiedBullets} of ${totalBullets} bullets contain measurable evidence.`,
        `Professional Summary includes ${summaryAchievementMetricCount} achievement metric(s).`,
      ]),
      makeCategory("action-verbs", actionVerbScore, [
        `${uniqueActionVerbCount} unique action-verb allocations are used across roles, with ${round(uniqueActionVerbRatio * 100)}% within-role uniqueness.`,
        `${weakOpenings.length} weak bullet openings were detected.`,
      ]),
      makeCategory("brevity", brevityScore, [
        `${bulletsWithinPreferredLength} of ${totalBullets} bullets are 15–42 words.`,
        `Average bullet length is ${round(average(bulletWordCounts), 1)} words.`,
      ]),
      makeCategory("jd-relevance", relevanceScore, [
        `Combined JD coverage score is ${round(jdCoverageScore, 1)}/100.`,
        `${directSummaryKeywordCount} direct JD keywords are represented in the summary plan.`,
      ]),
      makeCategory("skills-coverage", skillsScore, [
        `${data.skills.validation.explicitSkillCount} explicit and ${data.skills.validation.inferredSkillCount} grounded inferred skills are included.`,
      ]),
      makeCategory("leadership-and-growth", leadershipScore, [
        `${leadershipSignalCount} bullets contain leadership or architecture signals.`,
        `${distinctRoleCount} distinct role titles are represented across the career timeline.`,
      ]),
      makeCategory("communication-and-collaboration", communicationScore, [
        `${communicationBulletCount} bullets contain communication or collaboration evidence.`,
      ]),
      makeCategory("repetition-control", repetitionScore, [
        `${repeatedGroups} exact, morphological, semantic, structural, or metric repetition groups remain.`,
        `Average bullet distinctiveness is ${round(averageExperienceDistinctiveness, 1)}/100.`,
      ]),
      makeCategory("ats-and-formatting", atsScore, [
        `Template is ${data.template.template.layout}, ${data.template.template.pageTarget}-page target, using ${data.template.template.typography.fontFamily}.`,
        `Assembly status is ${data.assemblyValidation.overallStatus}.`,
      ]),
      makeCategory("section-completeness", sectionCompletenessScore, [
        `${presentRequiredSectionCount} of ${requiredSections.length} required sections are present.`,
      ]),
    ];

    const issues: ResumeReadinessIssue[] = [];
    if (quantifiedBulletRatio < 0.85) {
      issues.push(
        buildIssue(
          "INSUFFICIENT_QUANTIFIED_IMPACT",
          quantifiedBulletRatio < 0.7 ? "error" : "warning",
          "quantified-achievements",
          "experience",
          `Only ${round(quantifiedBulletRatio * 100)}% of Experience bullets contain measurable evidence.`,
          "Regenerate only unquantified bullets through the Result and Metric engines.",
          bullets
            .filter((bullet) => !METRIC_PATTERN.test(`${bullet.result} ${bullet.finalBullet}`))
            .map((bullet) => bullet.bulletId),
        ),
      );
    }
    if (weakOpenings.length > 0 || uniqueActionVerbRatio < 0.8) {
      issues.push(
        buildIssue(
          "ACTION_VERB_QUALITY",
          weakOpenings.length > 0 ? "error" : "warning",
          "action-verbs",
          "experience",
          "Experience bullets contain weak or insufficiently varied opening verbs.",
          "Reallocate opening verbs and selectively regenerate only affected bullets.",
          weakOpenings.map((bullet) => bullet.bulletId),
        ),
      );
    }
    if (preferredLengthRatio < 0.8) {
      issues.push(
        buildIssue(
          "BULLET_LENGTH_VARIANCE",
          longBullets > Math.max(1, totalBullets * 0.2) ? "error" : "warning",
          "brevity",
          "experience",
          "Too many bullets fall outside the preferred 16–40 word range.",
          "Tighten only the affected bullet compositions without changing their allocated achievement or keywords.",
          bullets
            .filter((bullet) => {
              const count = wordCount(bullet.finalBullet);
              return count < 15 || count > 42;
            })
            .map((bullet) => bullet.bulletId),
        ),
      );
    }
    if (data.summary.wordCount < 50 || data.summary.wordCount > 80) {
      issues.push(
        buildIssue(
          "SUMMARY_LENGTH",
          "error",
          "brevity",
          "summary",
          `Professional Summary contains ${data.summary.wordCount} words instead of 50–80.`,
          "Regenerate only the Summary Engine output within its existing JD allocation.",
          [],
        ),
      );
    }

    const summaryAchievementMetrics = [
      ...data.summary.summary.matchAll(/\b\d+(?:\.\d+)?\s?%/g),
      ...data.summary.summary.matchAll(/\b\d+(?:\.\d+)?x\b/gi),
    ];
    if (summaryAchievementMetrics.length < 2) {
      issues.push(
        buildIssue(
          "SUMMARY_METRICS_INSUFFICIENT",
          "error",
          "quantified-achievements",
          "summary",
          `Professional Summary contains ${summaryAchievementMetrics.length} hard number(s); Resume Worded expects at least 2.`,
          "Regenerate the Summary with two summary-only quantified impact claims.",
          [],
        ),
      );
    }

    const experienceText = data.experience.experiences
      .flatMap((experience) => experience.bullets.map((bullet) => bullet.finalBullet))
      .join("\n")
      .toLocaleLowerCase();
    const repeatedSummaryMeasures = [
      "release predictability",
      "production change success rate",
      "engineering delivery cadence",
      "roadmap completion rate",
      "platform operability score",
      "incident recovery confidence",
    ].filter(
      (measure) =>
        data.summary.summary.toLocaleLowerCase().includes(measure) &&
        experienceText.includes(measure),
    );
    if (repeatedSummaryMeasures.length > 0) {
      issues.push(
        buildIssue(
          "SUMMARY_METRIC_REPEATED_IN_EXPERIENCE",
          "warning",
          "repetition-control",
          "summary",
          `Summary metrics also appear in Experience: ${repeatedSummaryMeasures.join(", ")}.`,
          "Keep summary metrics in the summary-only measure pool so they stay unique to the Professional Summary.",
          [],
          false,
        ),
      );
    }
    if (jdCoverageScore < 90) {
      issues.push(
        buildIssue(
          "JD_COVERAGE_WEAK",
          jdCoverageScore < 80 ? "error" : "warning",
          "jd-relevance",
          "orchestrator",
          `Combined JD coverage is ${round(jdCoverageScore, 1)}/100.`,
          "Route missing requirements to the responsible Summary, Skills, or Experience allocation engine; do not keyword-stuff existing content.",
          [],
        ),
      );
    }
    if (!data.skills.validation.explicitSkillsCovered) {
      issues.push(
        buildIssue(
          "EXPLICIT_SKILLS_MISSING",
          "error",
          "skills-coverage",
          "skills",
          "One or more explicit JD skills are missing from the Skills output.",
          "Re-run explicit skill coverage and ranking for this generation only.",
          [],
        ),
      );
    }
    if (seniorTarget && (!data.experience.validation.leadershipCoverage || leadershipSignalCount === 0)) {
      issues.push(
        buildIssue(
          "LEADERSHIP_SIGNAL_MISSING",
          "error",
          "leadership-and-growth",
          "experience",
          "The target seniority requires leadership, architecture, or mentoring evidence.",
          "Allocate one distinct senior-scope achievement and selectively generate that bullet.",
          [],
        ),
      );
    }
    if (!data.experience.validation.communicationCoverage || communicationBulletCount === 0) {
      issues.push(
        buildIssue(
          "COLLABORATION_COVERAGE_MISSING",
          "error",
          "communication-and-collaboration",
          "experience",
          "The Experience section lacks meaningful communication or collaboration evidence.",
          "Generate one distinct stakeholder, cross-functional, mentoring, or communication achievement per recent role.",
          [],
        ),
      );
    }
    if (repeatedGroups > 0) {
      issues.push(
        buildIssue(
          "GLOBAL_REPETITION",
          "error",
          "repetition-control",
          "experience",
          `${repeatedGroups} repetition groups remain in the Experience section.`,
          "Use selective regeneration for only the repeated bullets while preserving approved bullets.",
          data.experience.validation.failedBulletIds ?? [],
        ),
      );
    }
    if (PERSONAL_PRONOUN_PATTERN.test(data.summary.summary)) {
      issues.push(
        buildIssue(
          "SUMMARY_PERSONAL_PRONOUN",
          "error",
          "ats-and-formatting",
          "summary",
          "The Professional Summary contains first-person pronouns.",
          "Regenerate only the Summary output using ATS-safe third-person phrasing.",
          [],
        ),
      );
    }
    if (data.assemblyValidation.overallStatus !== "approved") {
      issues.push(
        buildIssue(
          "ASSEMBLY_NOT_APPROVED",
          "error",
          "ats-and-formatting",
          "orchestrator",
          "The immutable Final Resume Assembly did not pass validation.",
          "Resolve the structural assembly failure without rewriting source engine outputs.",
          [],
        ),
      );
    }
    if (sectionCompletenessScore < 100) {
      issues.push(
        buildIssue(
          "REQUIRED_SECTION_MISSING",
          "error",
          "section-completeness",
          "template",
          "One or more Template Engine-required sections are absent from the final document.",
          "Correct section selection or assembly wiring; do not synthesize unsupported profile sections.",
          [],
        ),
      );
    }

    const internalScore = round(
      categories.reduce((total, category) => total + category.weightedPoints, 0),
      1,
    );
    const fingerprintApproved = contentFingerprintApproved(data);
    if (!fingerprintApproved) {
      issues.push(
        buildIssue(
          "DOCUMENT_FINGERPRINT_MISMATCH",
          "error",
          "ats-and-formatting",
          "orchestrator",
          "The final resume document changed after immutable assembly.",
          "Reject this resume and regenerate the affected JD-specific run from trusted source outputs.",
          [],
        ),
      );
    }

    const criticalGates: ResumeReadinessCriticalGates = {
      assemblyApproved: data.assemblyValidation.overallStatus === "approved",
      allSourceEnginesApproved: sourceEnginesApproved(data),
      allExperienceBulletsApproved:
        approvedBullets === totalBullets &&
        data.experience.validation.overallStatus === "approved",
      quantifiedBulletCoverageApproved: quantifiedBulletRatio >= 0.85,
      directJdCoverageApproved: jdCoverageScore >= 90,
      atsStructureApproved:
        data.template.validation.atsSafeguardsApproved &&
        data.template.validation.singleColumnApproved,
      noCriticalRepetition: repeatedGroups === 0,
      summaryLengthApproved:
        data.summary.wordCount >= 50 && data.summary.wordCount <= 80,
      contentFingerprintApproved: fingerprintApproved,
      overallApproved: false,
    };
    const blockingIssues = issues.filter(
      (issue) => issue.severity === "error" && issue.blocksExternalTest,
    );
    criticalGates.overallApproved =
      Object.entries(criticalGates)
        .filter(([key]) => key !== "overallApproved")
        .every(([, value]) => value) && blockingIssues.length === 0;
    const readyForExternalTest =
      internalScore >= TARGET_SCORE && criticalGates.overallApproved;
    const estimatedExternalBand =
      readyForExternalTest
        ? "90-plus-likely"
        : internalScore >= 88 && blockingIssues.length === 0
          ? "85-to-89-likely"
          : "below-85-likely";

    return {
      reportId: `READINESS-${data.context.generationId}`,
      engineName: "resume-worded-readiness-engine",
      engineVersion: VERSION,
      context: structuredClone(data.context),
      documentFingerprint: data.document.contentFingerprint,
      internalScore,
      targetInternalScore: TARGET_SCORE,
      estimatedExternalBand,
      readyForExternalTest,
      contentMutated: false,
      categories,
      criticalGates,
      metrics,
      issues,
      overallStatus: readyForExternalTest ? "approved" : "rejected",
      createdAt: new Date().toISOString(),
      disclaimer:
        "This is an internal readiness estimate, not a guarantee of an external Resume Worded score. The exact exported resume must be tested on the external platform.",
    };
  }
}
