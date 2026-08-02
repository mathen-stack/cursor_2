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

const STRONG_BULLETS_PER_ROLE = 5;

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

function normalizeOriginalSummary(extracted: BaseResumeExtracted): string {
  const fromField = extracted.summary?.trim() || "";
  if (fromField) return fromField;
  return "";
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
 * stamp the signed-in user's identity, and append the strongest JD-generated
 * bullets onto every experience entry.
 */
export function assemblePreservedBaseResumeTailor(input: {
  generated: FinalResumeData;
  extracted: BaseResumeExtracted;
  identityProfile: UserProfile;
}): FinalResumeData {
  const { generated, extracted, identityProfile } = input;
  const originalSummary = normalizeOriginalSummary(extracted);
  const strongBullets = strongestGeneratedBullets(
    generated,
    Math.max(STRONG_BULLETS_PER_ROLE, 5),
  );

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
    // Preserve the uploaded summary only — never replace it with a JD rewrite.
    summary: originalSummary,
  };

  const preservedSkillNames = extracted.skills.slice(0, 40);
  const skills: SkillsEngineOutput = {
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
  };

  const experiences = (
    extracted.experiences.length > 0
      ? extracted.experiences
      : generated.experience.experiences.map((entry) => ({
          experienceId: entry.experienceId,
          companyName: entry.companyName,
          role: entry.assignedRole,
          startDate: entry.startDate,
          endDate: entry.endDate,
          bullets: [],
          stacks: [],
        }))
  ).map((entry, experienceIndex) => {
    const experienceId =
      entry.experienceId || `EXP-${String(experienceIndex + 1).padStart(3, "0")}`;
    const originalBullets = entry.bullets
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text, bulletIndex) =>
        asPreservedBullet(text, `${experienceId}-ORIG-${bulletIndex + 1}`),
      );

    const originalKeys = new Set(
      originalBullets.map((bullet) => bullet.finalBullet.trim().toLocaleLowerCase()),
    );

    const jdBullets = strongBullets
      .filter((bullet) => !originalKeys.has(bullet.finalBullet.trim().toLocaleLowerCase()))
      .map((bullet, bulletIndex) =>
        cloneBullet(bullet, `${experienceId}-JD-${bulletIndex + 1}`),
      );

    // Guarantee enough bullets for export/engine shape while keeping originals first.
    let merged = [...originalBullets, ...jdBullets];
    if (merged.length < 5) {
      const fillers = strongestGeneratedBullets(generated, 12)
        .filter(
          (bullet) =>
            !merged.some(
              (existing) =>
                existing.finalBullet.trim().toLocaleLowerCase() ===
                bullet.finalBullet.trim().toLocaleLowerCase(),
            ),
        )
        .slice(0, 5 - merged.length)
        .map((bullet, bulletIndex) =>
          cloneBullet(bullet, `${experienceId}-FILL-${bulletIndex + 1}`),
        );
      merged = [...merged, ...fillers];
    }

    return {
      experienceId,
      companyName: entry.companyName || "Company",
      startDate: entry.startDate || "2018",
      endDate: entry.endDate || "Present",
      assignedRole: entry.role?.trim() || "Professional",
      bullets: merged,
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
