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
import {
  isBrokenBulletWording,
  repairBrokenBulletWording,
} from "@resume/engines";
import {
  isJunkBulletText,
  isWeakOrBrokenBulletText,
  sanitizeBulletList,
  sanitizeBulletText,
} from "./base-resume-bullet-sanitize";
import {
  ensurePreservedExtractedFields,
  preserveOriginalSummaryText,
} from "./base-resume-preserve-fields";
import { sanitizeEncodedField } from "./pdf-encoding-decode";

type ExperienceBullet = ExperienceEngineOutput["experiences"][number]["bullets"][number];
type CareerEntry = UserProfile["careerHistory"][number];
type EducationEntry = UserProfile["education"][number];

/** Introduce at most this many JD bullets per experience (replace or append). */
const JD_BULLETS_PER_ROLE = 2;
/** Experiences with more than this many bullets replace poorest instead of appending. */
const REPLACE_THRESHOLD_EXCLUSIVE = 4;

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
  const trimmed = sanitizeBulletText(text);
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

function sanitizeJdCandidate(bullet: ExperienceBullet): ExperienceBullet | null {
  const repaired = sanitizeBulletText(repairBrokenBulletWording(bullet.finalBullet));
  if (!repaired || isJunkBulletText(repaired) || isWeakOrBrokenBulletText(repaired)) {
    return null;
  }
  if (isBrokenBulletWording(repaired)) return null;
  return {
    ...structuredClone(bullet),
    finalBullet: repaired,
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
  return preserveOriginalSummaryText(extracted.summary || "");
}

function rankCandidateBullets(
  bullets: readonly ExperienceBullet[],
  options: { roleStacks: readonly string[]; jdText: string },
): ExperienceBullet[] {
  return bullets
    .map((bullet) => sanitizeJdCandidate(bullet))
    .filter((bullet): bullet is ExperienceBullet => Boolean(bullet))
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
 * How many JD bullets to introduce (1 or 2).
 * - originalCount > 4 → replace that many poorest
 * - otherwise → append that many
 */
function jdBulletBudget(originalCount: number): number {
  if (originalCount <= 0) return JD_BULLETS_PER_ROLE;
  if (originalCount === 1) return 1;
  return JD_BULLETS_PER_ROLE;
}

function pickUniqueJdBullets(
  candidates: readonly ExperienceBullet[],
  count: number,
  blockedTexts: ReadonlySet<string>,
  experienceId: string,
): ExperienceBullet[] {
  const picked: ExperienceBullet[] = [];
  const used = new Set<string>(blockedTexts);
  for (const candidate of candidates) {
    if (picked.length >= count) break;
    const key = candidate.finalBullet.trim().toLocaleLowerCase();
    if (!key || used.has(key)) continue;
    used.add(key);
    picked.push(cloneBullet(candidate, `${experienceId}-JD-${picked.length + 1}`));
  }
  return picked;
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
  const originalBullets = sanitizeBulletList(input.originalTexts).map(
    (text, bulletIndex) =>
      asPreservedBullet(text, `${input.experienceId}-ORIG-${bulletIndex + 1}`),
  );
  const candidates = candidateJdBulletsForRole({
    generated: input.generated,
    experienceIndex: input.experienceIndex,
    roleStacks: input.roleStacks,
    jdText: input.jdText,
  });
  const budget = jdBulletBudget(originalBullets.length);
  const originalKeys = new Set(
    originalBullets.map((bullet) => bullet.finalBullet.trim().toLocaleLowerCase()),
  );
  const jdBullets = pickUniqueJdBullets(
    candidates,
    budget,
    originalKeys,
    input.experienceId,
  );

  if (jdBullets.length === 0) {
    return originalBullets;
  }

  // More than 4 originals → replace poorest 1–2 (keep count the same).
  if (originalBullets.length > REPLACE_THRESHOLD_EXCLUSIVE) {
    const rankedByWeakness = originalBullets
      .map((bullet, index) => ({
        bullet,
        index,
        weakness: originalBulletWeakness(bullet.finalBullet, qualityOptions),
      }))
      .sort((left, right) => {
        if (right.weakness !== left.weakness) return right.weakness - left.weakness;
        return right.index - left.index;
      });
    const byIndex = new Map<number, ExperienceBullet>();
    rankedByWeakness.slice(0, jdBullets.length).forEach((item, offset) => {
      const replacement = jdBullets[offset];
      if (replacement) byIndex.set(item.index, replacement);
    });
    const replaced = originalBullets.map(
      (bullet, index) => byIndex.get(index) ?? bullet,
    );
    const jdFirst = replaced.filter(
      (bullet) => bullet.requirementId !== "PRESERVED-ORIGINAL",
    );
    const preserved = replaced.filter(
      (bullet) => bullet.requirementId === "PRESERVED-ORIGINAL",
    );
    return [...jdFirst, ...preserved];
  }

  // 4 or fewer originals → append 1–2 new JD bullets.
  return [...jdBullets, ...originalBullets];
}

/**
 * Overlay company / period / role from the user's profile onto each original
 * experience (by index). Bullets stay from the uploaded resume.
 */
function careerHeaderFromProfile(
  entry: BaseResumeExperience,
  index: number,
  profileCareer: readonly CareerEntry[],
): {
  experienceId: string;
  companyName: string;
  assignedRole: string;
  startDate: string;
  endDate: string;
} {
  const fromProfile = profileCareer[index];
  const experienceId =
    entry.experienceId ||
    fromProfile?.experienceId ||
    `EXP-${String(index + 1).padStart(3, "0")}`;
  const profileCompany = sanitizeEncodedField(fromProfile?.companyName?.trim() || "", "")
    .replace(/\s*\|\s*$/g, "")
    .trim();
  const profileRole = sanitizeEncodedField(fromProfile?.role?.trim() || "", "")
    .replace(/\s*\|\s*$/g, "")
    .trim();
  const entryCompany = sanitizeEncodedField(entry.companyName || "", "")
    .replace(/\s*\|\s*$/g, "")
    .trim();
  const entryRole = sanitizeEncodedField(entry.role?.trim() || "", "")
    .replace(/\s*\|\s*$/g, "")
    .trim();
  return {
    experienceId,
    // Profile wins for headers; never emit undecoded PDF cipher text.
    companyName: profileCompany || entryCompany || "Company",
    assignedRole: profileRole || entryRole || "Professional",
    startDate: fromProfile?.startDate?.trim() || entry.startDate || "2018",
    endDate: fromProfile?.endDate?.trim() || entry.endDate || "Present",
  };
}

/**
 * Education comes from the user's profile. Fall back to uploaded education only
 * when the profile has no education rows.
 */
function educationFromProfile(
  extracted: BaseResumeExtracted,
  profileEducation: readonly EducationEntry[],
): EducationEntry[] {
  if (profileEducation.length > 0) {
    return profileEducation.map((entry, index) => ({
      educationId: entry.educationId || `EDU-${String(index + 1).padStart(3, "0")}`,
      institution: entry.institution?.trim() || "University",
      degree: entry.degree?.trim() || "Degree",
      field: entry.field?.trim() || "General Studies",
      startDate: entry.startDate?.trim() || "2012",
      endDate: entry.endDate?.trim() || "2016",
    }));
  }
  return extracted.education.map((entry, index) => ({
    educationId: entry.educationId || `EDU-${String(index + 1).padStart(3, "0")}`,
    institution: entry.institution?.trim() || "University",
    degree: entry.degree?.trim() || "Degree",
    field: entry.field?.trim() || "General Studies",
    startDate: entry.startDate?.trim() || "2012",
    endDate: entry.endDate?.trim() || "2016",
  }));
}

function roleStacksForExperience(
  entry: BaseResumeExperience,
  assignedRole: string,
): string[] {
  return [...(entry.stacks ?? []), assignedRole, entry.role || ""]
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Preserve the uploaded resume content (summary, skills, bullets).
 * From the user profile only: identity, career headers (company/period/role),
 * and education (school/period/degree/discipline).
 * Bullets: if count > 4 replace poorest 1–2; else append 1–2 new JD bullets.
 */
export function assemblePreservedBaseResumeTailor(input: {
  generated: FinalResumeData;
  extracted: BaseResumeExtracted;
  /** Full saved user profile — identity, career headers, education. */
  userProfile: UserProfile;
  /** Optional raw resume text used to recover summary/skills for older uploads. */
  rawText?: string;
}): FinalResumeData {
  const { generated, userProfile } = input;
  const extracted = ensurePreservedExtractedFields(input.extracted, input.rawText);
  const originalSummary = normalizeOriginalSummary(extracted);
  const jdText = generated.jobDescription.rawText || "";

  const education = educationFromProfile(extracted, userProfile.education);
  const profile: UserProfile = {
    profileId: userProfile.profileId || generated.profile.profileId,
    personalInformation: structuredClone(userProfile.personalInformation),
    education,
    careerHistory:
      extracted.experiences.length > 0
        ? extracted.experiences.map((entry, index) => {
            const header = careerHeaderFromProfile(
              entry,
              index,
              userProfile.careerHistory,
            );
            return {
              experienceId: header.experienceId,
              companyName: header.companyName,
              ...(header.assignedRole ? { role: header.assignedRole } : {}),
              startDate: header.startDate,
              endDate: header.endDate,
            };
          })
        : structuredClone(userProfile.careerHistory),
  };

  // Always prefer the uploaded summary. Only if the upload had none do we keep
  // the generated summary (legacy resumes without a Summary section).
  const summary: SummaryEngineOutput = {
    ...structuredClone(generated.summary),
    summary: originalSummary || generated.summary.summary,
  };

  const preservedSkillNames = extracted.skills
    .map((skill) => skill.trim())
    .filter(Boolean)
    .slice(0, 40);
  // Always prefer uploaded skills — never replace them with JD-generated skills
  // when the original resume had a Skills section.
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
    const header = careerHeaderFromProfile(
      entry,
      experienceIndex,
      userProfile.careerHistory,
    );
    const originalTexts = sanitizeBulletList(entry.bullets);
    const bullets = mergeExperienceBullets({
      experienceId: header.experienceId,
      experienceIndex,
      originalTexts,
      roleStacks: roleStacksForExperience(entry, header.assignedRole),
      jdText,
      generated,
    });

    return {
      experienceId: header.experienceId,
      companyName: header.companyName,
      startDate: header.startDate,
      endDate: header.endDate,
      assignedRole: header.assignedRole,
      // Final guard: never emit junk/broken strings into the assembled resume.
      bullets: bullets
        .map((bullet) => ({
          ...bullet,
          finalBullet: sanitizeBulletText(bullet.finalBullet),
        }))
        .filter(
          (bullet) =>
            bullet.finalBullet &&
            !isJunkBulletText(bullet.finalBullet) &&
            (bullet.requirementId === "PRESERVED-ORIGINAL" ||
              !isWeakOrBrokenBulletText(bullet.finalBullet)),
        ),
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
  careerHeaderFromProfile,
  educationFromProfile,
  JD_BULLETS_PER_ROLE,
  REPLACE_THRESHOLD_EXCLUSIVE,
};
