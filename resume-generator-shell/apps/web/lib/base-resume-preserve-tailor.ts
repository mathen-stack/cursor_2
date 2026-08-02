import type {
  BaseResumeExtracted,
  BaseResumeExperience,
  ExperienceEngineOutput,
  FinalResumeData,
  SkillsEngineOutput,
  SummaryEngineOutput,
  UserProfile,
} from "@resume/contracts";
import { ImmutableFinalResumeAssembler } from "@resume/core";

type ExperienceBullet = ExperienceEngineOutput["experiences"][number]["bullets"][number];

/** Replace at most this many poor original bullets per experience. */
const JD_BULLETS_PER_ROLE = 2;
/** JD bullet must beat the original by at least this quality margin to replace it. */
const REPLACE_QUALITY_MARGIN = 2;

const STRONG_VERB_RE =
  /\b(led|built|improved|reduced|increased|delivered|launched|designed|implemented|optimized|owned|drove|created|architected|scaled|automated|migrated|engineered|accelerated|strengthened)\b/i;
const WEAK_PHRASE_RE =
  /\b(collaborated with|worked on|helped with|helped|responsible for|participated in|various|assorted|tickets|tasks)\b/i;

function cloneBullet(bullet: ExperienceBullet, bulletId: string): ExperienceBullet {
  return {
    ...structuredClone(bullet),
    bulletId,
    status: "approved",
  };
}

function asPreservedBullet(text: string, bulletId: string): ExperienceBullet {
  const trimmed = text.trim();
  const actionVerb = trimmed.split(/\s+/)[0]?.replace(/[^A-Za-z]/g, "") || "Delivered";
  return {
    bulletId,
    requirementId: "PRESERVED-ORIGINAL",
    situation: "Existing role delivery from the uploaded resume",
    task: "Preserve original accomplishment wording",
    action: trimmed,
    result: "Retained from source resume",
    actionVerb,
    directKeywords: [],
    supportingKeywords: [],
    outcomeKeywords: [],
    finalBullet: trimmed,
    strengthScore: bulletQualityScore(trimmed),
    distinctivenessScore: 8,
    status: "approved",
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Higher = stronger resume bullet. */
function bulletQualityScore(
  text: string,
  options?: { roleStacks?: readonly string[]; jdText?: string },
): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  let score = 0;

  if (trimmed.length >= 110) score += 3;
  else if (trimmed.length >= 90) score += 2;
  else if (trimmed.length >= 70) score += 1;
  else if (trimmed.length < 50) score -= 2;

  if (/\d/.test(trimmed)) score += 4;
  if (/%|x\b|ms\b|seconds?|minutes?|hours?|users?|customers?|revenue|latency|uptime/i.test(trimmed)) {
    score += 2;
  }
  if (STRONG_VERB_RE.test(trimmed)) score += 3;
  if (WEAK_PHRASE_RE.test(trimmed)) score -= 4;

  for (const stack of options?.roleStacks ?? []) {
    const token = stack.trim();
    if (token.length < 2) continue;
    if (new RegExp(`\\b${escapeRegExp(token)}\\b`, "i").test(trimmed)) score += 2;
  }

  const jd = options?.jdText?.toLocaleLowerCase() ?? "";
  if (jd) {
    const words = trimmed
      .toLocaleLowerCase()
      .split(/[^a-z0-9.+#/-]+/)
      .filter((word) => word.length >= 4);
    let hits = 0;
    for (const word of words) {
      if (jd.includes(word)) hits += 1;
    }
    score += Math.min(hits, 6);
  }

  return score;
}

/** Higher score = weaker / poorer original bullet (better candidate to replace). */
function originalBulletWeakness(
  text: string,
  options?: { roleStacks?: readonly string[]; jdText?: string },
): number {
  return 20 - bulletQualityScore(text, options);
}

function normalizeOriginalSummary(extracted: BaseResumeExtracted): string {
  return extracted.summary?.trim() || "";
}

function rankCandidateBullets(
  bullets: readonly ExperienceBullet[],
  options: { roleStacks: readonly string[]; jdText: string },
): ExperienceBullet[] {
  return [...bullets]
    .filter((bullet) => bullet.status === "approved" && bullet.finalBullet.trim())
    .filter((bullet) => !WEAK_PHRASE_RE.test(bullet.finalBullet))
    .sort((left, right) => {
      const leftScore =
        bulletQualityScore(left.finalBullet, options) * 2 +
        left.strengthScore +
        left.distinctivenessScore;
      const rightScore =
        bulletQualityScore(right.finalBullet, options) * 2 +
        right.strengthScore +
        right.distinctivenessScore;
      if (rightScore !== leftScore) return rightScore - leftScore;
      return right.finalBullet.length - left.finalBullet.length;
    });
}

/**
 * Prefer bullets generated for this same role index; fall back to the global
 * strongest JD bullets so every role still gets high-quality replacements.
 */
function candidateJdBulletsForRole(input: {
  generated: FinalResumeData;
  experienceIndex: number;
  roleStacks: readonly string[];
  jdText: string;
}): ExperienceBullet[] {
  const roleGenerated =
    input.generated.experience.experiences[input.experienceIndex]?.bullets ?? [];
  const roleRanked = rankCandidateBullets(roleGenerated, {
    roleStacks: input.roleStacks,
    jdText: input.jdText,
  });

  const globalRanked = rankCandidateBullets(
    input.generated.experience.experiences.flatMap((entry) => entry.bullets),
    { roleStacks: input.roleStacks, jdText: input.jdText },
  );

  const merged: ExperienceBullet[] = [];
  const seen = new Set<string>();
  for (const bullet of [...roleRanked, ...globalRanked]) {
    const key = bullet.finalBullet.trim().toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(bullet);
  }
  return merged;
}

/**
 * How many original bullets to replace with JD bullets (1 or 2).
 * Never more than the originals available; never append extras.
 */
function jdBulletBudget(originalCount: number): number {
  if (originalCount <= 0) return 0;
  if (originalCount === 1) return 1;
  return JD_BULLETS_PER_ROLE;
}

function mergeExperienceBullets(input: {
  experienceId: string;
  experienceIndex: number;
  originalTexts: readonly string[];
  roleStacks: readonly string[];
  jdText: string;
  generated: FinalResumeData;
}): ExperienceBullet[] {
  const qualityOptions = {
    roleStacks: input.roleStacks,
    jdText: input.jdText,
  };
  const originalBullets = input.originalTexts.map((text, bulletIndex) =>
    asPreservedBullet(text, `${input.experienceId}-ORIG-${bulletIndex + 1}`),
  );

  const candidates = candidateJdBulletsForRole({
    generated: input.generated,
    experienceIndex: input.experienceIndex,
    roleStacks: input.roleStacks,
    jdText: input.jdText,
  });

  // No originals to preserve/replace — seed with up to 2 strongest JD bullets.
  if (originalBullets.length === 0) {
    return candidates.slice(0, JD_BULLETS_PER_ROLE).map((bullet, bulletIndex) =>
      cloneBullet(bullet, `${input.experienceId}-JD-${bulletIndex + 1}`),
    );
  }

  const budget = jdBulletBudget(originalBullets.length);
  const originalKeys = new Set(
    originalBullets.map((bullet) => bullet.finalBullet.trim().toLocaleLowerCase()),
  );

  const rankedOriginals = originalBullets
    .map((bullet, index) => ({
      bullet,
      index,
      weakness: originalBulletWeakness(bullet.finalBullet, qualityOptions),
      quality: bulletQualityScore(bullet.finalBullet, qualityOptions),
    }))
    .sort((left, right) => {
      if (right.weakness !== left.weakness) return right.weakness - left.weakness;
      return right.index - left.index;
    });

  const replacements: Array<{ index: number; bullet: ExperienceBullet }> = [];
  const usedJd = new Set<string>();

  for (const original of rankedOriginals) {
    if (replacements.length >= budget) break;
    const better = candidates.find((candidate) => {
      const key = candidate.finalBullet.trim().toLocaleLowerCase();
      if (originalKeys.has(key) || usedJd.has(key)) return false;
      const jdQuality = bulletQualityScore(candidate.finalBullet, qualityOptions);
      // Only replace when the JD bullet is clearly stronger.
      return jdQuality >= original.quality + REPLACE_QUALITY_MARGIN;
    });
    if (!better) continue;
    usedJd.add(better.finalBullet.trim().toLocaleLowerCase());
    replacements.push({
      index: original.index,
      bullet: cloneBullet(
        better,
        `${input.experienceId}-JD-${replacements.length + 1}`,
      ),
    });
  }

  if (replacements.length === 0) {
    return originalBullets;
  }

  const replaceByIndex = new Map(
    replacements.map((item) => [item.index, item.bullet] as const),
  );
  const merged = originalBullets.map(
    (bullet, index) => replaceByIndex.get(index) ?? bullet,
  );

  // Lead with the stronger JD replacements so the role opens with JD fit.
  const jdFirst = merged.filter((bullet) =>
    bullet.requirementId !== "PRESERVED-ORIGINAL",
  );
  const preserved = merged.filter(
    (bullet) => bullet.requirementId === "PRESERVED-ORIGINAL",
  );
  return [...jdFirst, ...preserved];
}

function preservedEducation(
  extracted: BaseResumeExtracted,
  fallback: UserProfile["education"],
): UserProfile["education"] {
  if (extracted.education.length === 0) return structuredClone(fallback);
  return extracted.education.map((entry, index) => ({
    educationId: entry.educationId || `EDU-${String(index + 1).padStart(3, "0")}`,
    institution: entry.institution?.trim() || "University",
    degree: entry.degree?.trim() || "Degree",
    field: entry.field?.trim() || "General Studies",
    startDate: entry.startDate?.trim() || "2012",
    endDate: entry.endDate?.trim() || "2016",
  }));
}

function roleStacksForExperience(entry: BaseResumeExperience): string[] {
  return [...(entry.stacks ?? []), ...(entry.role ? [entry.role] : [])]
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Keep the uploaded resume's summary / skills / experience / education intact,
 * stamp the signed-in user's identity, and replace only the poorest 1–2
 * original bullets in each experience with clearly stronger JD-generated bullets.
 */
export function assemblePreservedBaseResumeTailor(input: {
  generated: FinalResumeData;
  extracted: BaseResumeExtracted;
  identityProfile: UserProfile;
}): FinalResumeData {
  const { generated, extracted, identityProfile } = input;
  const originalSummary = normalizeOriginalSummary(extracted);
  const jdText = generated.jobDescription.rawText || "";

  const profile: UserProfile = {
    ...structuredClone(identityProfile),
    personalInformation: structuredClone(identityProfile.personalInformation),
    education: preservedEducation(extracted, identityProfile.education),
    careerHistory:
      extracted.experiences.length > 0
        ? extracted.experiences.map((entry, index) => ({
            experienceId:
              entry.experienceId || `EXP-${String(index + 1).padStart(3, "0")}`,
            companyName: entry.companyName || "Company",
            ...(entry.role?.trim() ? { role: entry.role.trim() } : {}),
            startDate: entry.startDate || "2018",
            endDate: entry.endDate || "Present",
          }))
        : structuredClone(identityProfile.careerHistory),
  };

  const summary: SummaryEngineOutput = {
    ...structuredClone(generated.summary),
    // Prefer the uploaded summary. If the upload had none, keep the generated
    // summary so export integrity still has a non-empty summary token.
    summary: originalSummary || generated.summary.summary,
  };

  const preservedSkillNames = extracted.skills
    .map((skill) => skill.trim())
    .filter(Boolean)
    .slice(0, 40);
  const skills: SkillsEngineOutput =
    preservedSkillNames.length > 0
      ? {
          ...structuredClone(generated.skills),
          categories: [
            {
              name: "Skills",
              skills: preservedSkillNames,
            },
          ],
          skills: preservedSkillNames.map((name, index) => ({
            skillId: `SKILL-PRESERVED-${index + 1}`,
            name,
            normalizedKey: name.toLocaleLowerCase(),
            category: "Skills",
            source: "explicit" as const,
            priority: "high" as const,
            score: 80,
            evidence: [],
            inferredFrom: [],
            evidencedInExperience: false,
          })),
        }
      : structuredClone(generated.skills);

  const sourceExperiences: BaseResumeExperience[] =
    extracted.experiences.length > 0
      ? extracted.experiences
      : generated.experience.experiences.map((entry) => ({
          experienceId: entry.experienceId,
          companyName: entry.companyName,
          role: entry.assignedRole,
          startDate: entry.startDate,
          endDate: entry.endDate,
          bullets: [] as string[],
          stacks: [] as string[],
        }));

  const experiences = sourceExperiences.map((entry, experienceIndex) => {
    const experienceId =
      entry.experienceId || `EXP-${String(experienceIndex + 1).padStart(3, "0")}`;
    const originalTexts = entry.bullets.map((text) => text.trim()).filter(Boolean);
    const bullets = mergeExperienceBullets({
      experienceId,
      experienceIndex,
      originalTexts,
      roleStacks: roleStacksForExperience(entry),
      jdText,
      generated,
    });

    return {
      experienceId,
      companyName: entry.companyName || "Company",
      startDate: entry.startDate || "2018",
      endDate: entry.endDate || "Present",
      assignedRole: entry.role?.trim() || "Professional",
      bullets,
    };
  });

  const experience: ExperienceEngineOutput = {
    ...structuredClone(generated.experience),
    experiences,
  };

  return new ImmutableFinalResumeAssembler().assemble({
    context: generated.context,
    jobDescription: generated.jobDescription,
    profile,
    summary,
    skills,
    experience,
    template: generated.template,
    orchestration: generated.orchestration,
  });
}

/** Exported for unit tests. */
export const __baseResumeBulletMergeForTests = {
  jdBulletBudget,
  mergeExperienceBullets,
  originalBulletWeakness,
  bulletQualityScore,
  JD_BULLETS_PER_ROLE,
  REPLACE_QUALITY_MARGIN,
};
