import type { JobDescription } from "@resume/contracts";
import type { BulletPlanItem } from "../types/bullet-plan";
import type {
  KeywordAllocationValidation,
  KeywordPackage,
} from "../types/keyword-package";
import type { JDRequirement } from "../types/requirement";
import type { RoleAssignment } from "../types/role-assignment";
import {
  hasCommunicationAllocationSignal,
  packageAllocationText,
} from "./communication-allocation";
import { canonicalKeywordKey } from "./keyword-normalizer";

function duplicateValues(values: string[]): string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function isControlledReuse(
  experienceId: string,
  canonicalKey: string,
  controlledReuse: readonly string[],
): boolean {
  return controlledReuse.some((item) => {
    const separator = item.indexOf(":");
    const itemExperienceId = separator >= 0 ? item.slice(0, separator) : "";
    const value = separator >= 0 ? item.slice(separator + 1) : item;
    return (
      itemExperienceId === experienceId &&
      canonicalKeywordKey(value) === canonicalKey
    );
  });
}

function repeatedWithinExperience(
  packages: KeywordPackage[],
  values: (keywordPackage: KeywordPackage) => string[],
): string[] {
  const repeated: string[] = [];
  const byExperience = new Map<string, KeywordPackage[]>();
  for (const keywordPackage of packages) {
    const current = byExperience.get(keywordPackage.experienceId) ?? [];
    byExperience.set(keywordPackage.experienceId, [...current, keywordPackage]);
  }

  for (const [experienceId, rolePackages] of byExperience) {
    const canonicalKeys = rolePackages.flatMap(values).filter(Boolean);
    for (const key of duplicateValues(canonicalKeys)) {
      repeated.push(`${experienceId}:${key}`);
    }
  }
  return repeated;
}

function repeatedAcrossGeneration(
  packages: KeywordPackage[],
  values: (keywordPackage: KeywordPackage) => string[],
): string[] {
  return duplicateValues(packages.flatMap(values).filter(Boolean));
}

function packageText(keywordPackage: KeywordPackage): string {
  return packageAllocationText(keywordPackage);
}

export function validateKeywordAllocation(input: {
  jobDescription: JobDescription;
  assignments: RoleAssignment[];
  requirements: JDRequirement[];
  plans: BulletPlanItem[];
  packages: KeywordPackage[];
  controlledDirectKeywordReuse: string[];
  controlledCommunicationSupportingReuse?: string[];
  controlledCommunicationActionVerbReuse?: string[];
}): KeywordAllocationValidation {
  const controlledCommunicationSupportingReuse =
    input.controlledCommunicationSupportingReuse ?? [];
  const controlledCommunicationActionVerbReuse =
    input.controlledCommunicationActionVerbReuse ?? [];
  const planIds = input.plans.map((plan) => plan.bulletId);
  const packageIds = input.packages.map((keywordPackage) => keywordPackage.bulletId);
  const duplicateBulletIds = duplicateValues(packageIds);
  const missingPlanBulletIds = planIds.filter(
    (bulletId) => !packageIds.includes(bulletId),
  );
  const requirementIds = new Set(
    input.requirements.map((requirement) => requirement.requirementId),
  );
  const unknownRequirementIds = [
    ...new Set(
      input.packages
        .map((keywordPackage) => keywordPackage.requirementId)
        .filter((requirementId) => !requirementIds.has(requirementId)),
    ),
  ];

  const ungroundedDirectKeywords: string[] = [];
  for (const keywordPackage of input.packages) {
    for (const evidence of keywordPackage.directKeywordEvidence) {
      const actual = input.jobDescription.rawText.slice(
        evidence.startIndex,
        evidence.endIndex,
      );
      if (
        actual.toLocaleLowerCase() !== evidence.keyword.toLocaleLowerCase() ||
        !keywordPackage.directKeywords.includes(evidence.keyword)
      ) {
        ungroundedDirectKeywords.push(
          `${keywordPackage.bulletId}:${evidence.keyword}`,
        );
      }
    }
    for (const keyword of keywordPackage.directKeywords) {
      if (
        !keywordPackage.directKeywordEvidence.some(
          (evidence) =>
            evidence.keyword.toLocaleLowerCase() === keyword.toLocaleLowerCase(),
        )
      ) {
        ungroundedDirectKeywords.push(`${keywordPackage.bulletId}:${keyword}`);
      }
    }
  }

  const repeatedActionVerbKeys = repeatedAcrossGeneration(
    input.packages,
    (keywordPackage) => [keywordPackage.actionVerbCanonicalKey],
  ).filter((canonicalKey) => {
    return !input.packages.some(
      (keywordPackage) =>
        keywordPackage.actionVerbCanonicalKey === canonicalKey &&
        isControlledReuse(
          keywordPackage.experienceId,
          canonicalKey,
          controlledCommunicationActionVerbReuse,
        ),
    );
  });
  const repeatedSupportingKeywordKeys = repeatedAcrossGeneration(
    input.packages,
    (keywordPackage) =>
      keywordPackage.supportingKeywordDetails.map((detail) => detail.canonicalKey),
  ).filter((canonicalKey) => {
    return !input.packages.some(
      (keywordPackage) =>
        keywordPackage.supportingKeywordDetails.some(
          (detail) => detail.canonicalKey === canonicalKey,
        ) &&
        isControlledReuse(
          keywordPackage.experienceId,
          canonicalKey,
          controlledCommunicationSupportingReuse,
        ),
    );
  });
  const repeatedOutcomeKeywordKeys = repeatedAcrossGeneration(
    input.packages,
    (keywordPackage) =>
      keywordPackage.outcomeKeywordDetails.map((detail) => detail.canonicalKey),
  );
  const repeatedCrossKindKeywordKeys = repeatedWithinExperience(
    input.packages,
    (keywordPackage) => [
      ...keywordPackage.directKeywords.map(canonicalKeywordKey),
      ...keywordPackage.supportingKeywordDetails.map((detail) => detail.canonicalKey),
      ...keywordPackage.outcomeKeywordDetails.map((detail) => detail.canonicalKey),
    ],
  ).filter((entry) => {
    const [experienceId, ...keyParts] = entry.split(":");
    const key = keyParts.join(":");
    return (
      !isControlledReuse(experienceId, key, input.controlledDirectKeywordReuse) &&
      !isControlledReuse(
        experienceId,
        key,
        controlledCommunicationSupportingReuse,
      )
    );
  });

  const packageByBullet = new Map(
    input.packages.map((keywordPackage) => [keywordPackage.bulletId, keywordPackage]),
  );
  const communicationPackageErrors: string[] = [];
  const leadershipPackageErrors: string[] = [];

  for (const plan of input.plans) {
    const keywordPackage = packageByBullet.get(plan.bulletId);
    if (!keywordPackage) {
      continue;
    }
    const text = packageText(keywordPackage);
    if (
      plan.communicationFocused &&
      !hasCommunicationAllocationSignal(text)
    ) {
      communicationPackageErrors.push(plan.bulletId);
    }
    if (
      plan.leadershipFocused &&
      !/lead|spearhead|direct|champion|guide|mentor|strategy|roadmap|governance|engineering standard|architecture/.test(
        text,
      )
    ) {
      leadershipPackageErrors.push(plan.bulletId);
    }
  }

  const allPlansAllocated = missingPlanBulletIds.length === 0;
  const packageCountMatchesPlanCount =
    input.packages.length === input.plans.length;
  const allBulletIdsUnique = duplicateBulletIds.length === 0;
  const allRequirementReferencesValid = unknownRequirementIds.length === 0;
  const allDirectKeywordsGroundedInJD = ungroundedDirectKeywords.length === 0;
  const actionVerbsUniqueWithinRoles = repeatedActionVerbKeys.length === 0;
  const supportingKeywordsDistinctWithinRoles =
    repeatedSupportingKeywordKeys.length === 0;
  const outcomeKeywordsDistinctWithinRoles =
    repeatedOutcomeKeywordKeys.length === 0;
  const keywordConceptsDistinctAcrossKindsWithinRoles =
    repeatedCrossKindKeywordKeys.length === 0;
  const communicationPackagesRelevant = communicationPackageErrors.length === 0;
  const leadershipPackagesRelevant = leadershipPackageErrors.length === 0;

  const warnings = [
    ...input.controlledDirectKeywordReuse.map(
      (item) =>
        `Controlled direct-JD keyword reuse was required because the planned role contained more bullets than distinct grounded phrases: ${item}.`,
    ),
    ...controlledCommunicationSupportingReuse.map(
      (item) =>
        `Controlled communication supporting-keyword reuse was required to preserve stakeholder or cross-functional evidence: ${item}.`,
    ),
    ...controlledCommunicationActionVerbReuse.map(
      (item) =>
        `Controlled communication action-verb reuse was required after the unique collaboration-verb inventory was exhausted: ${item}.`,
    ),
  ];
  const errors: string[] = [];
  if (!allPlansAllocated) {
    errors.push(`Missing keyword packages for: ${missingPlanBulletIds.join(", ")}.`);
  }
  if (!packageCountMatchesPlanCount) {
    errors.push("Keyword package count does not match bullet-plan count.");
  }
  if (!allBulletIdsUnique) {
    errors.push(`Duplicate keyword-package bullet IDs: ${duplicateBulletIds.join(", ")}.`);
  }
  if (!allRequirementReferencesValid) {
    errors.push(`Unknown requirement IDs: ${unknownRequirementIds.join(", ")}.`);
  }
  if (!allDirectKeywordsGroundedInJD) {
    errors.push(`Ungrounded direct keywords: ${ungroundedDirectKeywords.join(", ")}.`);
  }
  if (!actionVerbsUniqueWithinRoles) {
    errors.push(`Repeated action verbs across the generation: ${repeatedActionVerbKeys.join(", ")}.`);
  }
  if (!supportingKeywordsDistinctWithinRoles) {
    errors.push(
      `Repeated supporting keyword concepts across the generation: ${repeatedSupportingKeywordKeys.join(", ")}.`,
    );
  }
  if (!outcomeKeywordsDistinctWithinRoles) {
    errors.push(
      `Repeated outcome keyword concepts across the generation: ${repeatedOutcomeKeywordKeys.join(", ")}.`,
    );
  }
  if (!keywordConceptsDistinctAcrossKindsWithinRoles) {
    errors.push(
      `Repeated keyword concepts across direct, supporting, or outcome allocations within roles: ${repeatedCrossKindKeywordKeys.join(", ")}.`,
    );
  }
  if (!communicationPackagesRelevant) {
    errors.push(
      `Communication-focused plans lack relevant allocation: ${communicationPackageErrors.join(", ")}.`,
    );
  }
  if (!leadershipPackagesRelevant) {
    errors.push(
      `Leadership-focused plans lack relevant allocation: ${leadershipPackageErrors.join(", ")}.`,
    );
  }

  return {
    allPlansAllocated,
    packageCountMatchesPlanCount,
    allBulletIdsUnique,
    allRequirementReferencesValid,
    allDirectKeywordsGroundedInJD,
    actionVerbsUniqueWithinRoles,
    supportingKeywordsDistinctWithinRoles,
    outcomeKeywordsDistinctWithinRoles,
    keywordConceptsDistinctAcrossKindsWithinRoles,
    communicationPackagesRelevant,
    leadershipPackagesRelevant,
    duplicateBulletIds,
    missingPlanBulletIds,
    unknownRequirementIds,
    ungroundedDirectKeywords,
    repeatedActionVerbKeys,
    repeatedSupportingKeywordKeys,
    repeatedOutcomeKeywordKeys,
    repeatedCrossKindKeywordKeys,
    communicationPackageErrors,
    leadershipPackageErrors,
    controlledDirectKeywordReuse: [...input.controlledDirectKeywordReuse],
    warnings,
    errors,
    overallStatus: errors.length === 0 ? "approved" : "rejected",
  };
}

export function directKeywordKeys(keywordPackage: KeywordPackage): string[] {
  return keywordPackage.directKeywords.map(canonicalKeywordKey);
}
