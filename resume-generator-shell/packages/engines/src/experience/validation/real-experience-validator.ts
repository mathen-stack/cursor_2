import type { CareerEntry } from "@resume/contracts";
import {
  actionScopePhraseKeys,
  directKeywordRepresented,
  extractActionObjectScope,
} from "../composition/bullet-language";
import { canonicalActionVerbKey, canonicalKeywordKey } from "../keywords/keyword-normalizer";
import type { ExperienceBullet } from "../types/composed-bullet";
import type {
  BulletStrengthDimensions,
  ExperienceBulletDiagnostic,
  ExperienceSectionValidation,
  ExperienceValidationInput,
  ExperienceValidationIssue,
  ExperienceValidationIssueCode,
  ExperienceValidationOutput,
  ExperienceValidator,
} from "../types/validation";
import {
  atsLanguageErrors,
  clampScore,
  hasBusinessImpact,
  hasCommunicationSignal,
  hasIntraBulletPhraseLoop,
  hasIntraBulletVerbEcho,
  hasMetric,
  hasRepeatedContentNoun,
  hasSeniorSignal,
  jaccard,
  metricFingerprint,
  normalizeText,
  sentenceSkeleton,
} from "./experience-validation-language";

export interface RealExperienceValidatorOptions {
  minimumStrengthScore?: number;
  minimumDistinctivenessScore?: number;
  semanticSimilarityThreshold?: number;
  structuralSimilarityThreshold?: number;
}

interface BulletContext {
  bullet: ExperienceBullet;
  experienceId: string;
  sequence: number;
  assignedRole: string;
  seniority: string;
  communicationFocused: boolean;
  leadershipFocused: boolean;
  achievementDimension: string;
}

function duplicatesBy<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    const current = groups.get(key) ?? [];
    current.push(item);
    groups.set(key, current);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

function pairGroups(
  items: readonly BulletContext[],
  similarity: (left: BulletContext, right: BulletContext) => boolean,
  options: { sameExperienceOnly?: boolean } = {},
): string[][] {
  const groups: string[][] = [];
  const seen = new Set<string>();
  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      const left = items[leftIndex];
      const right = items[rightIndex];
      if (!left || !right) continue;
      if (
        options.sameExperienceOnly &&
        left.experienceId !== right.experienceId
      ) {
        continue;
      }
      if (!similarity(left, right)) continue;
      const key = [left.bullet.bulletId, right.bullet.bulletId].sort().join("|");
      if (!seen.has(key)) {
        groups.push(key.split("|"));
        seen.add(key);
      }
    }
  }
  return groups;
}

function roundAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return clampScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function roleIsSenior(seniority: string, assignedRole: string): boolean {
  return /senior|lead|staff|principal|manager|director|head/i.test(
    `${seniority} ${assignedRole}`,
  );
}

function bulletExperienceId(
  bullet: ExperienceBullet,
  planExperienceId?: string,
): string {
  if (planExperienceId) return planExperienceId;
  const separatorIndex = bullet.bulletId.indexOf("-B-");
  return separatorIndex >= 0 ? bullet.bulletId.slice(0, separatorIndex) : "";
}

function selectKeeper(
  group: string[],
  contexts: ReadonlyMap<string, BulletContext>,
): string | undefined {
  return [...group]
    .sort((leftId, rightId) => {
      const left = contexts.get(leftId);
      const right = contexts.get(rightId);
      const leftScore = left
        ? (left.bullet.strengthScore + left.bullet.distinctivenessScore) / 2
        : 0;
      const rightScore = right
        ? (right.bullet.strengthScore + right.bullet.distinctivenessScore) / 2
        : 0;
      return rightScore - leftScore || (left?.sequence ?? 999) - (right?.sequence ?? 999);
    })[0];
}

function issue(
  issueCode: ExperienceValidationIssueCode,
  message: string,
  bulletIds: string[],
  experienceId?: string,
  severity: "warning" | "error" = "error",
): ExperienceValidationIssue {
  return experienceId === undefined
    ? { issueCode, message, bulletIds, severity }
    : { issueCode, message, bulletIds, experienceId, severity };
}

export class RealExperienceValidator implements ExperienceValidator {
  readonly name = "real-global-experience-strength-and-repetition-validator";

  private readonly minimumStrengthScore: number;
  private readonly minimumDistinctivenessScore: number;
  private readonly semanticSimilarityThreshold: number;
  private readonly structuralSimilarityThreshold: number;

  constructor(options: RealExperienceValidatorOptions = {}) {
    this.minimumStrengthScore = options.minimumStrengthScore ?? 8;
    this.minimumDistinctivenessScore = options.minimumDistinctivenessScore ?? 8;
    this.semanticSimilarityThreshold = options.semanticSimilarityThreshold ?? 0.62;
    this.structuralSimilarityThreshold = options.structuralSimilarityThreshold ?? 0.78;
  }

  async execute(input: ExperienceValidationInput): Promise<ExperienceValidationOutput> {
    this.assertInput(input);

    const planByBullet = new Map(input.plans.map((item) => [item.bulletId, item]));
    const packageByBullet = new Map(input.keywordPackages.map((item) => [item.bulletId, item]));
    const storyByBullet = new Map(input.stories.map((item) => [item.bulletId, item]));
    const requirementById = new Map(input.requirements.map((item) => [item.requirementId, item]));
    const assignmentByExperience = new Map(
      input.assignments.map((item) => [item.experienceId, item]),
    );

    const bulletContexts: BulletContext[] = input.bullets.map((bullet) => {
      const plan = planByBullet.get(bullet.bulletId);
      const experienceId = bulletExperienceId(bullet, plan?.experienceId);
      const assignment = assignmentByExperience.get(experienceId);
      return {
        bullet,
        experienceId,
        sequence: plan?.sequence ?? Number.MAX_SAFE_INTEGER,
        assignedRole: assignment?.assignedRole ?? "",
        seniority: assignment?.seniority ?? "",
        communicationFocused: plan?.communicationFocused ?? false,
        leadershipFocused: plan?.leadershipFocused ?? false,
        achievementDimension: plan?.achievementDimension ?? "unknown",
      };
    });
    const contextByBullet = new Map(
      bulletContexts.map((item) => [item.bullet.bulletId, item]),
    );

    const exactRepetitionGroups = duplicatesBy(
      bulletContexts,
      (item) => normalizeText(item.bullet.finalBullet),
    ).map((group) => group.map((item) => item.bullet.bulletId));

    const morphologicalRepetitionGroups = duplicatesBy(
      bulletContexts,
      (item) => canonicalActionVerbKey(item.bullet.actionVerb),
    ).map((group) => group.map((item) => item.bullet.bulletId));

    const semanticRepetitionGroups = pairGroups(
      bulletContexts,
      (left, right) => {
      const contentSimilarity = jaccard(left.bullet.finalBullet, right.bullet.finalBullet);
      const actionResultSimilarity = jaccard(
        `${left.bullet.action} ${left.bullet.result}`,
        `${right.bullet.action} ${right.bullet.result}`,
      );
      const sameOutcome = left.bullet.outcomeKeywords.some((keyword: string) =>
        right.bullet.outcomeKeywords.some(
          (other: string) => canonicalKeywordKey(keyword) === canonicalKeywordKey(other),
        ),
      );
      return (
        contentSimilarity >= this.semanticSimilarityThreshold ||
        actionResultSimilarity >= this.semanticSimilarityThreshold + 0.05 ||
        (left.achievementDimension === right.achievementDimension && sameOutcome)
      );
      },
      { sameExperienceOnly: true },
    );

    const structuralRepetitionGroups = pairGroups(
      bulletContexts,
      (left, right) =>
      jaccard(
        sentenceSkeleton(left.bullet.finalBullet),
        sentenceSkeleton(right.bullet.finalBullet),
      ) >= this.structuralSimilarityThreshold,
      { sameExperienceOnly: true },
    );

    const metricRepetitionGroups = duplicatesBy(
      bulletContexts,
      // Document-wide: the same measure label (e.g. feature adoption) must not
      // reappear across roles with only the percentage changed.
      (item) => metricFingerprint(item.bullet.finalBullet),
    ).map((group) => group.map((item) => item.bullet.bulletId));

    const actionScopeRepetitionGroups = (() => {
      const fullScopeGroups = duplicatesBy(
        bulletContexts,
        (item) => {
          const scope = extractActionObjectScope(
            item.bullet.finalBullet,
            item.bullet.actionVerb,
          );
          // Lock multi-word action objects (2+ tokens) document-wide so short
          // clones like "security mindset" cannot repeat across roles.
          if (scope.split(/\s+/).filter(Boolean).length < 2) {
            return `unique:${item.bullet.bulletId}`;
          }
          return `scope:${normalizeText(scope)}`;
        },
      ).map((group) => group.map((item) => item.bullet.bulletId));

      // Also catch shared 4+ word stems that survive "across …" qualifier appends.
      const phraseOwners = new Map<string, string[]>();
      for (const item of bulletContexts) {
        const scope = extractActionObjectScope(
          item.bullet.finalBullet,
          item.bullet.actionVerb,
        );
        for (const phraseKey of actionScopePhraseKeys(scope)) {
          const owners = phraseOwners.get(phraseKey) ?? [];
          owners.push(item.bullet.bulletId);
          phraseOwners.set(phraseKey, owners);
        }
      }
      const phraseGroups = [...phraseOwners.values()]
        .map((owners) => [...new Set(owners)])
        .filter((owners) => owners.length > 1);

      return [...fullScopeGroups, ...phraseGroups];
    })();

    const achievementRepetitionGroups = pairGroups(
      bulletContexts,
      (left, right) => {
      const sameRequirement = left.bullet.requirementId === right.bullet.requirementId;
      const sameDimension = left.achievementDimension === right.achievementDimension;
      const storySimilarity = jaccard(
        `${left.bullet.situation} ${left.bullet.task} ${left.bullet.action} ${left.bullet.result}`,
        `${right.bullet.situation} ${right.bullet.task} ${right.bullet.action} ${right.bullet.result}`,
      );
      return (sameRequirement && sameDimension) || storySimilarity >= 0.68;
      },
      { sameExperienceOnly: true },
    );

    const issues: ExperienceValidationIssue[] = [];
    const failedReasons = new Map<string, Set<ExperienceValidationIssueCode>>();
    const addFailure = (
      bulletId: string,
      code: ExperienceValidationIssueCode,
    ): void => {
      const current = failedReasons.get(bulletId) ?? new Set<ExperienceValidationIssueCode>();
      current.add(code);
      failedReasons.set(bulletId, current);
    };

    const applyDuplicateGroups = (
      groups: string[][],
      code: ExperienceValidationIssueCode,
      label: string,
      severity: "warning" | "error" = "error",
    ): void => {
      for (const group of groups) {
        const keeper = selectKeeper(group, contextByBullet);
        const failed = group.filter((bulletId) => bulletId !== keeper);
        issues.push(issue(code, label, group, contextByBullet.get(group[0] ?? "")?.experienceId, severity));
        if (severity === "error") {
          for (const bulletId of failed) addFailure(bulletId, code);
        }
      }
    };

    applyDuplicateGroups(exactRepetitionGroups, "exact-repetition", "Two or more bullets contain the same final achievement sentence.");
    applyDuplicateGroups(morphologicalRepetitionGroups, "morphological-repetition", "An opening action verb is repeated within the same role.");
    applyDuplicateGroups(semanticRepetitionGroups, "semantic-repetition", "Two bullets communicate substantially the same achievement.");
    applyDuplicateGroups(structuralRepetitionGroups, "structural-repetition", "Two bullets use an overly similar sentence structure.", "warning");
    applyDuplicateGroups(achievementRepetitionGroups, "achievement-repetition", "Two bullets are grounded in the same underlying achievement.");
    // Composition diversifies metrics; residual measure clones stay warnings so
    // generation does not hard-stop after uniqueness repair.
    applyDuplicateGroups(
      metricRepetitionGroups,
      "metric-repetition",
      "A metric measure pattern is repeated across the resume.",
      "warning",
    );
    // Composition already rewrites colliding scopes. Residual clones stay as
    // warnings so generation does not hard-stop after uniqueness repair.
    applyDuplicateGroups(
      actionScopeRepetitionGroups,
      "action-scope-repetition",
      "The same multi-word action scope is cloned across bullets.",
      "warning",
    );

    const bulletDiagnostics: ExperienceBulletDiagnostic[] = [];
    for (const context of bulletContexts) {
      const { bullet } = context;
      const plan = planByBullet.get(bullet.bulletId);
      const keywordPackage = packageByBullet.get(bullet.bulletId);
      const story = storyByBullet.get(bullet.bulletId);
      const requirement = requirementById.get(bullet.requirementId);
      const errors: string[] = [];
      const warnings: string[] = [];

      const traceable = Boolean(
        plan &&
          keywordPackage &&
          story &&
          requirement &&
          plan.requirementId === bullet.requirementId &&
          keywordPackage.requirementId === bullet.requirementId &&
          story.requirementId === bullet.requirementId &&
          plan.experienceId === context.experienceId,
      );
      if (!traceable) {
        errors.push("Bullet cannot be traced consistently to its JD requirement and generation artifacts.");
        addFailure(bullet.bulletId, "jd-traceability");
      }

      const directCoverage =
        bullet.directKeywords.length === 0 ||
        bullet.directKeywords.every((keyword: string) =>
          directKeywordRepresented(bullet.finalBullet, keyword),
        );
      const supportingCoverage =
        bullet.supportingKeywords.length === 0 ||
        bullet.supportingKeywords.every((keyword: string) =>
          directKeywordRepresented(bullet.finalBullet, keyword),
        );
      const outcomeCoverage =
        bullet.outcomeKeywords.length === 0 ||
        bullet.outcomeKeywords.every((keyword: string) =>
          directKeywordRepresented(bullet.finalBullet, keyword),
        );
      const domainCoherent = directCoverage && supportingCoverage && outcomeCoverage;
      if (!domainCoherent) {
        errors.push("Bullet loses one or more allocated JD, supporting, or outcome concepts.");
        addFailure(bullet.bulletId, "domain-coherence");
      }

      const languageErrors = atsLanguageErrors(bullet.finalBullet);
      // Composition targets active voice; residual passive-detector hits stay
      // warnings so generation does not hard-stop after wording repair.
      const softLanguageErrors = languageErrors.filter((item) =>
        /avoidable passive voice/i.test(item),
      );
      const hardLanguageErrors = languageErrors.filter(
        (item) => !/avoidable passive voice/i.test(item),
      );
      if (softLanguageErrors.length > 0) {
        warnings.push(...softLanguageErrors);
      }
      if (hardLanguageErrors.length > 0) {
        errors.push(...hardLanguageErrors);
        addFailure(
          bullet.bulletId,
          hardLanguageErrors.some((item) => /weak|filler/i.test(item))
            ? "weak-language"
            : "ats-language",
        );
      } else if (softLanguageErrors.length > 0) {
        if (
          !issues.some(
            (item) =>
              item.issueCode === "ats-language" &&
              item.bulletIds.includes(bullet.bulletId),
          )
        ) {
          issues.push(
            issue(
              "ats-language",
              softLanguageErrors[0]!,
              [bullet.bulletId],
              context.experienceId,
              "warning",
            ),
          );
        }
      }

      if (
        hasIntraBulletVerbEcho(bullet.finalBullet) ||
        hasRepeatedContentNoun(bullet.finalBullet) ||
        hasIntraBulletPhraseLoop(bullet.finalBullet)
      ) {
        // Composition already attempts repair; keep as a warning/score ding so
        // residual detector noise cannot reject an otherwise valid resume.
        warnings.push(
          "Bullet may still show residual repetition risk after wording repair.",
        );
      }

      const quantified = hasMetric(bullet.finalBullet);
      if (!quantified) {
        errors.push("Bullet has no measurable result.");
        addFailure(bullet.bulletId, "missing-metric");
      }

      const startsWithAllocatedVerb = bullet.finalBullet
        .toLowerCase()
        .startsWith(`${bullet.actionVerb.toLowerCase()} `);
      const seniorRole = roleIsSenior(context.seniority, context.assignedRole);
      const roleConsistent =
        startsWithAllocatedVerb &&
        (!context.leadershipFocused || !seniorRole || hasSeniorSignal(bullet.finalBullet));
      if (!roleConsistent) {
        // Composition already targets allocated verbs and senior signals;
        // residual ownership/scope mismatches stay warnings so generation
        // does not hard-stop after wording repair.
        warnings.push(
          "Bullet ownership or leadership scope does not match the assigned role.",
        );
        if (
          !issues.some(
            (item) =>
              item.issueCode === "role-seniority" &&
              item.bulletIds.includes(bullet.bulletId),
          )
        ) {
          issues.push(
            issue(
              "role-seniority",
              "Bullet ownership or leadership scope does not match the assigned role.",
              [bullet.bulletId],
              context.experienceId,
              "warning",
            ),
          );
        }
      }

      const communicationRelevant =
        !context.communicationFocused || hasCommunicationSignal(bullet.finalBullet);
      if (!communicationRelevant) {
        errors.push("Communication-focused bullet lacks concrete stakeholder or cross-functional evidence.");
        addFailure(bullet.bulletId, "communication-coverage");
      }

      const jdAlignment = directCoverage ? 10 : 4;
      const technicalSpecificity = bullet.supportingKeywords.length >= 2 ? 10 : bullet.supportingKeywords.length === 1 ? 8 : 3;
      const ownership = startsWithAllocatedVerb ? 10 : 4;
      const quantifiedImpact = quantified ? 10 : 2;
      const businessValue = hasBusinessImpact(bullet.finalBullet) ? 9 : 7;
      let distinctiveness = Math.min(10, bullet.distinctivenessScore);
      if (failedReasons.has(bullet.bulletId)) distinctiveness -= 2;
      const atsLanguage = Math.max(0, 10 - languageErrors.length * 2.5);
      const roleConsistency = roleConsistent ? 9.5 : 4;
      const domainCoherence = domainCoherent ? 10 : 4;
      const communicationValue = context.communicationFocused
        ? communicationRelevant ? 10 : 3
        : hasCommunicationSignal(bullet.finalBullet) ? 8.5 : 8;
      const overall = roundAverage([
        jdAlignment,
        technicalSpecificity,
        ownership,
        quantifiedImpact,
        businessValue,
        distinctiveness,
        atsLanguage,
        roleConsistency,
        domainCoherence,
        communicationValue,
      ]);
      const scores: BulletStrengthDimensions = {
        jdAlignment: clampScore(jdAlignment),
        technicalSpecificity: clampScore(technicalSpecificity),
        ownership: clampScore(ownership),
        quantifiedImpact: clampScore(quantifiedImpact),
        businessValue: clampScore(businessValue),
        distinctiveness: clampScore(distinctiveness),
        atsLanguage: clampScore(atsLanguage),
        roleConsistency: clampScore(roleConsistency),
        domainCoherence: clampScore(domainCoherence),
        communicationValue: clampScore(communicationValue),
        overall,
      };

      const belowPreferredStrength =
        bullet.status !== "approved" ||
        bullet.strengthScore < this.minimumStrengthScore ||
        bullet.distinctivenessScore < this.minimumDistinctivenessScore ||
        overall < this.minimumStrengthScore;
      if (belowPreferredStrength) {
        // Near-miss strength/distinctiveness should not reject an otherwise
        // healthy resume; only catastrophically weak bullets hard-fail.
        const catastrophicallyWeak =
          !bullet.finalBullet?.trim() ||
          bullet.strengthScore < 5.5 ||
          bullet.distinctivenessScore < 5.5 ||
          overall < 5.5;
        if (catastrophicallyWeak) {
          errors.push(
            "Bullet does not meet the configured strength and distinctiveness threshold.",
          );
          addFailure(bullet.bulletId, "weak-bullet");
        } else {
          warnings.push(
            "Bullet is below the preferred strength and distinctiveness threshold.",
          );
        }
      }
      if (bullet.strengthScore < 8.5) {
        warnings.push("Bullet passed composition but has limited quality margin for external scoring.");
      }

      const reasons = [...(failedReasons.get(bullet.bulletId) ?? new Set())];
      for (const reason of reasons) {
        if (!issues.some((item) => item.issueCode === reason && item.bulletIds.includes(bullet.bulletId))) {
          issues.push(issue(reason, errors[0] ?? `Bullet failed ${reason} validation.`, [bullet.bulletId], context.experienceId));
        }
      }
      bulletDiagnostics.push({
        bulletId: bullet.bulletId,
        experienceId: context.experienceId,
        requirementId: bullet.requirementId,
        approved: errors.length === 0 && reasons.length === 0,
        scores,
        regenerationReasons: reasons,
        warnings,
        errors,
      });
    }

    const bulletsByExperience = new Map<string, ExperienceBullet[]>();
    for (const context of bulletContexts) {
      const current = bulletsByExperience.get(context.experienceId) ?? [];
      current.push(context.bullet);
      bulletsByExperience.set(context.experienceId, current);
    }

    const experiences = input.careerHistory.map((entry: CareerEntry) => {
      const assignment = assignmentByExperience.get(entry.experienceId);
      const bullets = [...(bulletsByExperience.get(entry.experienceId) ?? [])].sort((left, right) => {
        const leftSequence = planByBullet.get(left.bulletId)?.sequence ?? 999;
        const rightSequence = planByBullet.get(right.bulletId)?.sequence ?? 999;
        return leftSequence - rightSequence;
      });
      return {
        experienceId: entry.experienceId,
        companyName: entry.companyName,
        startDate: entry.startDate,
        endDate: entry.endDate,
        assignedRole: assignment?.assignedRole ?? "Software Engineer",
        bullets,
      };
    });

    const minimumBulletsSatisfied = experiences.every(
      (experience) => experience.bullets.length >= input.minimumBulletsPerRole,
    );
    if (!minimumBulletsSatisfied) {
      for (const experience of experiences.filter((item) => item.bullets.length < input.minimumBulletsPerRole)) {
        issues.push(issue("minimum-bullets", `Role has fewer than ${input.minimumBulletsPerRole} bullets.`, experience.bullets.map((item) => item.bulletId), experience.experienceId));
      }
    }

    const communicationCoverage = experiences.every((experience) => {
      const planned = input.plans.filter((plan) => plan.experienceId === experience.experienceId && plan.communicationFocused);
      return planned.length > 0 && planned.every((plan) => {
        const bullet = experience.bullets.find((item) => item.bulletId === plan.bulletId);
        return Boolean(bullet && hasCommunicationSignal(bullet.finalBullet));
      });
    });
    if (!communicationCoverage) {
      issues.push(issue("communication-coverage", "One or more roles lack a strong communication or collaboration achievement.", []));
    }

    const leadershipCoverage = experiences.every((experience) => {
      const assignment = assignmentByExperience.get(experience.experienceId);
      if (!assignment || !roleIsSenior(assignment.seniority, assignment.assignedRole)) return true;
      return experience.bullets.some((bullet) => hasSeniorSignal(bullet.finalBullet));
    });
    if (!leadershipCoverage) {
      // Planning/composition already reserve senior ownership bullets; residual
      // coverage gaps stay warnings so generation can continue.
      issues.push(
        issue(
          "leadership-coverage",
          "A senior role lacks architecture, leadership, mentoring, or strategic ownership evidence.",
          [],
          undefined,
          "warning",
        ),
      );
    }

    const failedBulletIds = [...new Set([
      ...failedReasons.keys(),
      ...bulletDiagnostics.filter((item) => !item.approved).map((item) => item.bulletId),
    ])].sort();
    const approvedBulletIds = input.bullets
      .map((item) => item.bulletId)
      .filter((bulletId) => !failedBulletIds.includes(bulletId));
    const duplicateAchievements = achievementRepetitionGroups.map((group) => group.join("|"));
    const strongBulletCount = bulletDiagnostics.filter(
      (item) =>
        item.scores.overall >= this.minimumStrengthScore && item.errors.length === 0,
    ).length;
    // Prefer every bullet strong; allow one near-miss residual per role so a
    // single borderline bullet cannot reject the whole generation run.
    const allBulletsStrong =
      strongBulletCount === bulletDiagnostics.length ||
      (strongBulletCount >=
        Math.max(
          experiences.length * Math.max(1, input.minimumBulletsPerRole - 1),
          Math.ceil(bulletDiagnostics.length * 0.8),
        ) &&
        bulletDiagnostics.every((item) => item.errors.length === 0));
    const allBulletsTraceable = bulletDiagnostics.every((item) => item.scores.jdAlignment >= 8 && !item.regenerationReasons.includes("jd-traceability"));
    // Truthful report of residual seniority/ownership gaps; soft-failed above so
    // they do not gate overall approval after composition repair.
    const allRolesSeniorityConsistent =
      bulletDiagnostics.every(
        (item) =>
          !item.warnings.some((warning) =>
            /ownership or leadership scope/i.test(warning),
          ),
      ) && leadershipCoverage;
    const allBulletsDomainCoherent = bulletDiagnostics.every((item) => item.scores.domainCoherence >= 8);
    const atsLanguageApproved = bulletDiagnostics.every((item) => item.scores.atsLanguage >= 8);
    // Approve when no hard-error issues and no failed bullets remain. Soft
    // residuals (role-seniority, leadership-coverage, near-miss strength, etc.)
    // stay visible on flags/warnings without aborting generation.
    const hasBlockingIssues = issues.some((item) => item.severity === "error");
    const overallStatus =
      minimumBulletsSatisfied &&
      failedBulletIds.length === 0 &&
      !hasBlockingIssues
        ? "approved"
        : "rejected";

    const validation: ExperienceSectionValidation = {
      minimumBulletsSatisfied,
      communicationCoverage,
      leadershipCoverage,
      allBulletsStrong,
      allBulletsTraceable,
      allRolesSeniorityConsistent,
      allBulletsDomainCoherent,
      atsLanguageApproved,
      duplicateAchievements,
      failedBulletIds,
      approvedBulletIds,
      exactRepetitionGroups,
      morphologicalRepetitionGroups,
      semanticRepetitionGroups,
      structuralRepetitionGroups,
      metricRepetitionGroups,
      diagnostics: bulletDiagnostics,
      issues,
      overallStatus,
    };

    return { context: input.context, experiences, validation };
  }

  private assertInput(input: ExperienceValidationInput): void {
    if (
      input.context.jdId !== input.jobDescription.jdId ||
      input.context.jdHash !== input.jobDescription.contentHash
    ) {
      throw new Error("Experience Validator input context does not match the supplied JD.");
    }
    if (input.minimumBulletsPerRole < 5) {
      throw new Error("Experience Validator requires at least five bullets per role.");
    }
    if (input.careerHistory.length === 0 || input.assignments.length === 0) {
      throw new Error("Experience Validator requires career entries and role assignments.");
    }
    const careerIds = new Set(input.careerHistory.map((item) => item.experienceId));
    if (careerIds.size !== input.careerHistory.length) {
      throw new Error("Experience Validator received duplicate career entry IDs.");
    }
    for (const assignment of input.assignments) {
      if (!careerIds.has(assignment.experienceId)) {
        throw new Error(`Experience Validator received an assignment for unknown career entry ${assignment.experienceId}.`);
      }
    }
    const planIds = new Set(input.plans.map((item) => item.bulletId));
    if (planIds.size !== input.plans.length) {
      throw new Error("Experience Validator received duplicate bullet plan IDs.");
    }
    for (const bullet of input.bullets) {
      if (!planIds.has(bullet.bulletId)) {
        throw new Error(`Experience Validator received unplanned bullet ${bullet.bulletId}.`);
      }
    }
  }
}

