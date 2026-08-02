import type {
  BaseResumeExtracted,
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
    strengthScore: 8,
    distinctivenessScore: 8,
    status: "approved",
  };
}

/** Higher score = weaker / poorer original bullet (better candidate to replace). */
function originalBulletWeakness(text: string): number {
  const trimmed = text.trim();
  let weakness = 0;
  if (trimmed.length < 90) weakness += 2;
  if (trimmed.length < 60) weakness += 2;
  if (trimmed.length < 40) weakness += 2;
  if (!/\d/.test(trimmed)) weakness += 3;
  if (
    !/\b(led|built|improved|reduced|increased|delivered|launched|designed|implemented|optimized|owned|drove|created|architected)\b/i.test(
      trimmed,
    )
  ) {
    weakness += 2;
  }
  if (/\b(collaborated|worked on|helped|responsible for|participated)\b/i.test(trimmed)) {
    weakness += 2;
  }
  return weakness;
}

function normalizeOriginalSummary(extracted: BaseResumeExtracted): string {
  return extracted.summary?.trim() || "";
}

function strongestGeneratedBullets(
  generated: FinalResumeData,
  limit: number,
): ExperienceBullet[] {
  const all = generated.experience.experiences.flatMap((entry) =>
    entry.bullets.filter((bullet) => bullet.status === "approved" && bullet.finalBullet.trim()),
  );
  const ranked = [...all].sort((left, right) => {
    if (right.strengthScore !== left.strengthScore) {
      return right.strengthScore - left.strengthScore;
    }
    return right.distinctivenessScore - left.distinctivenessScore;
  });

  const unique: ExperienceBullet[] = [];
  const seen = new Set<string>();
  for (const bullet of ranked) {
    const key = bullet.finalBullet.trim().toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(bullet);
    if (unique.length >= limit) break;
  }
  return unique;
}

function pickJdBulletsForRole(
  pool: readonly ExperienceBullet[],
  experienceIndex: number,
  count: number,
  blockedTexts: ReadonlySet<string>,
): ExperienceBullet[] {
  if (pool.length === 0 || count <= 0) return [];
  const picked: ExperienceBullet[] = [];
  const used = new Set<string>();
  // Rotate through the strong pool so each role gets different JD bullets when possible.
  for (let offset = 0; offset < pool.length && picked.length < count; offset += 1) {
    const bullet = pool[(experienceIndex * JD_BULLETS_PER_ROLE + offset) % pool.length]!;
    const key = bullet.finalBullet.trim().toLocaleLowerCase();
    if (blockedTexts.has(key) || used.has(key)) continue;
    used.add(key);
    picked.push(bullet);
  }
  // Fallback: fill remaining from pool start if rotation collided with originals.
  for (const bullet of pool) {
    if (picked.length >= count) break;
    const key = bullet.finalBullet.trim().toLocaleLowerCase();
    if (blockedTexts.has(key) || used.has(key)) continue;
    used.add(key);
    picked.push(bullet);
  }
  return picked;
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
  strongPool: readonly ExperienceBullet[];
}): ExperienceBullet[] {
  const originalBullets = input.originalTexts.map((text, bulletIndex) =>
    asPreservedBullet(text, `${input.experienceId}-ORIG-${bulletIndex + 1}`),
  );

  // No originals to preserve/replace — seed with up to 2 JD bullets only.
  if (originalBullets.length === 0) {
    return pickJdBulletsForRole(
      input.strongPool,
      input.experienceIndex,
      JD_BULLETS_PER_ROLE,
      new Set(),
    ).map((bullet, bulletIndex) =>
      cloneBullet(bullet, `${input.experienceId}-JD-${bulletIndex + 1}`),
    );
  }

  const budget = jdBulletBudget(originalBullets.length);
  const originalKeys = new Set(
    originalBullets.map((bullet) => bullet.finalBullet.trim().toLocaleLowerCase()),
  );
  const jdSource = pickJdBulletsForRole(
    input.strongPool,
    input.experienceIndex,
    budget,
    originalKeys,
  );
  const jdBullets = jdSource.map((bullet, bulletIndex) =>
    cloneBullet(bullet, `${input.experienceId}-JD-${bulletIndex + 1}`),
  );

  if (jdBullets.length === 0) {
    return originalBullets;
  }

  // Preserve originals; replace only the poorest 1–2 with new JD bullets.
  const rankedByWeakness = originalBullets
    .map((bullet, index) => ({
      bullet,
      index,
      weakness: originalBulletWeakness(bullet.finalBullet),
    }))
    .sort((left, right) => {
      if (right.weakness !== left.weakness) return right.weakness - left.weakness;
      return right.index - left.index;
    });
  const replaceIndexes = new Set(
    rankedByWeakness.slice(0, jdBullets.length).map((item) => item.index),
  );
  const kept = originalBullets.filter((_, index) => !replaceIndexes.has(index));
  return [...kept, ...jdBullets];
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

/**
 * Keep the uploaded resume's summary / skills / experience / education intact,
 * stamp the signed-in user's identity, and replace only the poorest 1–2
 * original bullets in each experience with strongest JD-generated bullets.
 */
export function assemblePreservedBaseResumeTailor(input: {
  generated: FinalResumeData;
  extracted: BaseResumeExtracted;
  identityProfile: UserProfile;
}): FinalResumeData {
  const { generated, extracted, identityProfile } = input;
  const originalSummary = normalizeOriginalSummary(extracted);
  const strongPool = strongestGeneratedBullets(generated, 24);

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

  const experiences = (
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
        }))
  ).map((entry, experienceIndex) => {
    const experienceId =
      entry.experienceId || `EXP-${String(experienceIndex + 1).padStart(3, "0")}`;
    const originalTexts = entry.bullets.map((text) => text.trim()).filter(Boolean);
    const bullets = mergeExperienceBullets({
      experienceId,
      experienceIndex,
      originalTexts,
      strongPool,
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
  JD_BULLETS_PER_ROLE,
};
