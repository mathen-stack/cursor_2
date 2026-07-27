import { randomUUID } from "node:crypto";
import type {
  EvidenceProposal,
  ExperienceEngineOutput,
  SkillsEngineOutput,
  SourceEvidenceBundle,
  SourceEvidenceClaim,
  SummaryEngineOutput,
} from "@resume/contracts";
import { validateEvidenceClaim } from "./validate-evidence-claim";

function usableClaims(
  bundle: SourceEvidenceBundle,
  predicate: (claim: SourceEvidenceClaim) => boolean,
  allowKeywordOnly = false,
): SourceEvidenceClaim[] {
  return bundle.claims.filter((claim) => {
    if (!predicate(claim)) return false;
    return validateEvidenceClaim({
      claim,
      sourceNormalizedText: bundle.normalizedText,
      allowKeywordOnly,
    }).ok;
  });
}

export function proposeSummaryEnhancement(input: {
  summary: SummaryEngineOutput;
  bundle: SourceEvidenceBundle;
}): EvidenceProposal | null {
  const metrics = usableClaims(
    input.bundle,
    (claim) => claim.kind === "metric" || claim.kind === "result",
  );
  if (metrics.length === 0) {
    return null;
  }

  const metric = metrics[0]!;
  const before = input.summary.summary;
  // Cautious insertion: only replace an existing generated percent/x metric token.
  const after = before.replace(
    /\b\d+(?:\.\d+)?(?:%|x)\b/,
    metric.text.includes("%") || /x$/i.test(metric.text)
      ? metric.text
      : metric.text,
  );
  if (after === before) {
    return null;
  }

  return {
    proposalId: `PROP-SUM-${randomUUID()}`,
    targetSection: "summary",
    claimIds: [metric.claimId],
    description: "Replace a generated summary metric with source-resume metric evidence.",
    beforeText: before,
    afterText: after,
    decision: "rejected",
    rejectionReasons: [],
    provenance: [metric.span],
  };
}

export function proposeSkillsEnhancement(input: {
  skills: SkillsEngineOutput;
  bundle: SourceEvidenceBundle;
}): EvidenceProposal | null {
  const sourceTools = usableClaims(
    input.bundle,
    (claim) =>
      (claim.kind === "skill" || claim.kind === "tool") && claim.jdRelevant,
  );
  if (sourceTools.length === 0) {
    return null;
  }

  const names = new Set(
    sourceTools.map((claim) => claim.text.toLocaleLowerCase()),
  );
  const ranked = [...input.skills.skills].sort((left, right) => {
    const leftBoost = names.has(left.name.toLocaleLowerCase()) ? 25 : 0;
    const rightBoost = names.has(right.name.toLocaleLowerCase()) ? 25 : 0;
    return right.score + rightBoost - (left.score + leftBoost);
  });

  const before = input.skills.skills.map((skill) => skill.name).join(", ");
  const after = ranked.map((skill) => skill.name).join(", ");
  if (before === after) {
    return null;
  }

  // Encode proposed order as afterText; applicator rebuilds categories from ranked skills.
  return {
    proposalId: `PROP-SKL-${randomUUID()}`,
    targetSection: "skills",
    claimIds: sourceTools.map((claim) => claim.claimId),
    description:
      "Boost ranking for JD-relevant skills that also appear in the source resume.",
    beforeText: before,
    afterText: after,
    decision: "rejected",
    rejectionReasons: [],
    provenance: sourceTools.map((claim) => claim.span),
  };
}

export function proposeExperienceEnhancement(input: {
  experience: ExperienceEngineOutput;
  bundle: SourceEvidenceBundle;
}): EvidenceProposal | null {
  const metrics = usableClaims(
    input.bundle,
    (claim) => claim.kind === "metric" && Boolean(claim.span.employerHint),
  );
  if (metrics.length === 0) {
    // Fall back to any strong/moderate metric for most recent role only.
    const anyMetric = usableClaims(
      input.bundle,
      (claim) => claim.kind === "metric",
    )[0];
    if (!anyMetric) return null;

    const recent = input.experience.experiences[0];
    const bullet = recent?.bullets[0];
    if (!recent || !bullet) return null;
    const afterBullet = bullet.finalBullet.replace(
      /\b\d+(?:\.\d+)?(?:%|x)\b/,
      anyMetric.text,
    );
    if (afterBullet === bullet.finalBullet) return null;
    return {
      proposalId: `PROP-EXP-${randomUUID()}`,
      targetSection: "experience",
      claimIds: [anyMetric.claimId],
      description:
        "Replace a generated experience metric with source-resume metric evidence.",
      beforeText: bullet.finalBullet,
      afterText: afterBullet,
      decision: "rejected",
      rejectionReasons: [],
      provenance: [anyMetric.span],
    };
  }

  for (const metric of metrics) {
    const employer = metric.span.employerHint?.toLocaleLowerCase() ?? "";
    const experience = input.experience.experiences.find((item) =>
      item.companyName.toLocaleLowerCase().includes(employer) ||
      employer.includes(item.companyName.toLocaleLowerCase()),
    );
    const bullet = experience?.bullets[0];
    if (!experience || !bullet) continue;
    const afterBullet = bullet.finalBullet.replace(
      /\b\d+(?:\.\d+)?(?:%|x)\b/,
      metric.text,
    );
    if (afterBullet === bullet.finalBullet) continue;
    return {
      proposalId: `PROP-EXP-${randomUUID()}`,
      targetSection: "experience",
      claimIds: [metric.claimId],
      description:
        "Replace a generated experience metric with employer-linked source evidence.",
      beforeText: bullet.finalBullet,
      afterText: afterBullet,
      decision: "rejected",
      rejectionReasons: [],
      provenance: [metric.span],
    };
  }
  return null;
}

export function proposeEvidenceEnhancements(input: {
  summary: SummaryEngineOutput;
  skills: SkillsEngineOutput;
  experience: ExperienceEngineOutput;
  bundle: SourceEvidenceBundle;
}): EvidenceProposal[] {
  return [
    proposeSummaryEnhancement(input),
    proposeSkillsEnhancement(input),
    proposeExperienceEnhancement(input),
  ].filter((proposal): proposal is EvidenceProposal => Boolean(proposal));
}
