import { randomUUID } from "node:crypto";
import type {
  EvidenceEnhancementReport,
  EvidenceProposal,
  EvidenceRejectionReason,
  ExperienceEngineOutput,
  JobDescription,
  SkillsEngineOutput,
  SummaryEngineOutput,
  UserProfile,
} from "@resume/contracts";
import { RULE_HIERARCHY } from "@resume/contracts";
import { SummaryValidator } from "../summary/validation/summary-validator";
import { SkillsValidator } from "../skills/validation/skills-validator";
import type { SkillCandidate } from "../skills/types/skill-candidate";
import { SKILL_CATEGORY_ORDER, type SkillCategoryName } from "../skills/skill-taxonomy";
import {
  atsLanguageErrors,
  hasMetric,
} from "../experience/validation/experience-validation-language";
import { extractSourceEvidence } from "./extract-source-evidence";
import { proposeEvidenceEnhancements } from "./propose-evidence-enhancements";
import { validateEvidenceClaim } from "./validate-evidence-claim";

const ENGINE_VERSION = "1.0.0";

export interface EvidenceEnhancementInput {
  sourceResumeText: string;
  jobDescription: JobDescription;
  profile: UserProfile;
  summary: SummaryEngineOutput;
  skills: SkillsEngineOutput;
  experience: ExperienceEngineOutput;
}

export interface EvidenceEnhancementResult {
  summary: SummaryEngineOutput;
  skills: SkillsEngineOutput;
  experience: ExperienceEngineOutput;
  report: EvidenceEnhancementReport;
}

function reject(
  proposal: EvidenceProposal,
  reasons: EvidenceRejectionReason[],
): EvidenceProposal {
  return {
    ...proposal,
    decision: "rejected",
    rejectionReasons: [...new Set([...proposal.rejectionReasons, ...reasons])],
    afterText: proposal.beforeText,
  };
}

function accept(proposal: EvidenceProposal): EvidenceProposal {
  return {
    ...proposal,
    decision: "accepted",
    rejectionReasons: [],
  };
}

function rebuildSkillCategories(
  skills: SkillsEngineOutput["skills"],
): SkillsEngineOutput["categories"] {
  const byCategory = new Map<string, string[]>();
  for (const skill of skills) {
    const current = byCategory.get(skill.category) ?? [];
    if (!current.includes(skill.name)) {
      current.push(skill.name);
    }
    byCategory.set(skill.category, current);
  }
  return SKILL_CATEGORY_ORDER.flatMap((name) => {
    const names = byCategory.get(name);
    return names && names.length > 0 ? [{ name, skills: names }] : [];
  });
}

/**
 * Additive enhancement coordinator.
 * Proposals never write through without re-running existing section validators.
 * On any failure, original baseline text is preserved.
 */
export class SourceEvidenceEnhancementEngine {
  readonly name = "source-evidence-enhancement-engine";
  readonly version = ENGINE_VERSION;

  private readonly summaryValidator = new SummaryValidator();
  private readonly skillsValidator = new SkillsValidator();

  enhance(input: EvidenceEnhancementInput): EvidenceEnhancementResult {
    const bundle = extractSourceEvidence({
      sourceResumeText: input.sourceResumeText,
      jobDescription: input.jobDescription,
    });

    const proposals = proposeEvidenceEnhancements({
      summary: input.summary,
      skills: input.skills,
      experience: input.experience,
      bundle,
    });

    let summary = input.summary;
    let skills = input.skills;
    let experience = input.experience;
    const decided: EvidenceProposal[] = [];

    for (const proposal of proposals) {
      const claims = bundle.claims.filter((claim) =>
        proposal.claimIds.includes(claim.claimId),
      );
      if (claims.length === 0) {
        decided.push(reject(proposal, ["missing-source-span", "keeps-original-on-failure"]));
        continue;
      }

      const claimFailures: EvidenceRejectionReason[] = [];
      for (const claim of claims) {
        const result = validateEvidenceClaim({
          claim,
          sourceNormalizedText: bundle.normalizedText,
          allowKeywordOnly: false,
        });
        if (!result.ok) {
          claimFailures.push(...result.reasons);
        }
      }
      if (claimFailures.length > 0) {
        decided.push(
          reject(proposal, [...claimFailures, "keeps-original-on-failure"]),
        );
        continue;
      }

      // Never use JD text as candidate proof: all provenance must be source spans.
      if (
        proposal.provenance.some((span) =>
          input.jobDescription.normalizedText.includes(span.sourceText) &&
          !bundle.normalizedText.includes(span.sourceText),
        )
      ) {
        decided.push(
          reject(proposal, ["jd-used-as-candidate-proof", "keeps-original-on-failure"]),
        );
        continue;
      }

      if (proposal.targetSection === "summary") {
        const candidateValidation = this.summaryValidator.validate({
          jobDescription: input.jobDescription,
          summary: proposal.afterText,
          targetRole: summary.targetRole,
          experienceYears: summary.experienceYears,
          allocatedKeywords: summary.keywords,
          usedKeywords: summary.keywords,
          minimumWords: 50,
          maximumWords: 80,
        });
        if (candidateValidation.overallStatus !== "approved") {
          decided.push(
            reject(proposal, [
              "existing-validator-rejected",
              "keeps-original-on-failure",
            ]),
          );
          continue;
        }
        summary = {
          ...summary,
          summary: proposal.afterText,
          wordCount: proposal.afterText.trim().split(/\s+/).filter(Boolean).length,
          validation: candidateValidation,
          status: "approved",
        };
        decided.push(accept(proposal));
        continue;
      }

      if (proposal.targetSection === "skills") {
        const order = proposal.afterText.split(", ").map((name) => name.trim());
        const byName = new Map(
          skills.skills.map((skill) => [skill.name, skill] as const),
        );
        const ranked = order
          .map((name) => byName.get(name))
          .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill))
          .map((skill, index) => ({
            ...skill,
            score: Math.min(100, skill.score + Math.max(0, 20 - index)),
          }));
        // 3. Existing generation rule: must not invent skills not already approved.
        if (ranked.length !== skills.skills.length) {
          decided.push(
            reject(proposal, ["would-invent-content", "keeps-original-on-failure"]),
          );
          continue;
        }
        const categories = rebuildSkillCategories(ranked);
        const toCandidate = (skill: (typeof ranked)[number]): SkillCandidate => ({
          key: skill.normalizedKey,
          name: skill.name,
          category: skill.category as SkillCategoryName,
          source: skill.source,
          priority: skill.priority,
          score: skill.score,
          evidence: skill.evidence,
          inferredFrom: skill.inferredFrom,
          mentionCount: 1,
        });
        const validation = this.skillsValidator.validate({
          jobDescription: input.jobDescription,
          explicitCandidates: ranked
            .filter((skill) => skill.source === "explicit")
            .map(toCandidate),
          selected: ranked,
          categories,
          minimumSkills: Math.min(6, ranked.length),
          maximumSkills: 32,
        });
        if (validation.overallStatus !== "approved") {
          decided.push(
            reject(proposal, [
              "existing-validator-rejected",
              "keeps-original-on-failure",
            ]),
          );
          continue;
        }
        skills = {
          ...skills,
          skills: ranked,
          categories,
          validation: {
            ...skills.validation,
            ...validation,
            omittedLowPrioritySkills: skills.validation.omittedLowPrioritySkills,
          },
          status: "approved",
        };
        decided.push(accept(proposal));
        continue;
      }

      if (proposal.targetSection === "experience") {
        // Preserve employers/titles/dates: only mutate matching bullet text.
        const experiences = experience.experiences.map((item) => ({
          ...item,
          bullets: item.bullets.map((bullet) =>
            bullet.finalBullet === proposal.beforeText
              ? { ...bullet, finalBullet: proposal.afterText }
              : bullet,
          ),
        }));

        const mutated = experiences
          .flatMap((item) => item.bullets)
          .find((bullet) => bullet.finalBullet === proposal.afterText);
        if (!mutated) {
          decided.push(reject(proposal, ["keeps-original-on-failure"]));
          continue;
        }

        const languageErrors = atsLanguageErrors(mutated.finalBullet);
        if (languageErrors.length > 0 || !hasMetric(mutated.finalBullet)) {
          decided.push(
            reject(proposal, [
              languageErrors.length > 0
                ? "style-or-formatting-failed"
                : "existing-validator-rejected",
              "keeps-original-on-failure",
            ]),
          );
          continue;
        }

        const historyMutated = experiences.some((next, index) => {
          const original = experience.experiences[index]!;
          return (
            original.companyName !== next.companyName ||
            original.startDate !== next.startDate ||
            original.endDate !== next.endDate ||
            original.assignedRole !== next.assignedRole
          );
        });
        if (historyMutated) {
          decided.push(
            reject(proposal, [
              "would-mutate-employment-history",
              "keeps-original-on-failure",
            ]),
          );
          continue;
        }

        experience = {
          ...experience,
          experiences,
          status: "approved",
        };
        decided.push(accept(proposal));
      }
    }

    return {
      summary,
      skills,
      experience,
      report: {
        reportId: `EVR-${randomUUID()}`,
        engineName: "source-evidence-enhancement-engine",
        engineVersion: this.version,
        sourceResumeHash: bundle.sourceResumeHash,
        bundle,
        proposals: decided,
        acceptedProposalIds: decided
          .filter((item) => item.decision === "accepted")
          .map((item) => item.proposalId),
        rejectedProposalIds: decided
          .filter((item) => item.decision === "rejected")
          .map((item) => item.proposalId),
        originalBehaviorPreservedWhenRejected: true,
        ruleHierarchy: [...RULE_HIERARCHY],
        createdAt: new Date().toISOString(),
      },
    };
  }
}
