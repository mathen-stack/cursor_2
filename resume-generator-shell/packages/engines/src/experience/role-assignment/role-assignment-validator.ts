import type { CareerEntry, JobDescription } from "@resume/contracts";
import type { JDRequirement } from "../types/requirement";
import type {
  RoleAssignment,
  RoleAssignmentValidation,
  TargetRoleAnalysis,
} from "../types/role-assignment";
import { SENIORITY_RANK } from "./role-taxonomy";

export function validateRoleAssignments(input: {
  jobDescription: JobDescription;
  careerHistory: readonly CareerEntry[];
  requirements: readonly JDRequirement[];
  targetRoleAnalysis: TargetRoleAnalysis;
  assignments: readonly RoleAssignment[];
}): RoleAssignmentValidation {
  const errors: string[] = [];
  const expectedIds = new Set(
    input.careerHistory.map((entry) => entry.experienceId),
  );
  const assignmentIds = input.assignments.map(
    (assignment) => assignment.experienceId,
  );
  const duplicateExperienceIds = assignmentIds.filter(
    (id, index) => assignmentIds.indexOf(id) !== index,
  );
  const uniqueDuplicateIds = [...new Set(duplicateExperienceIds)];

  const allCareerEntriesAssigned =
    input.assignments.length === input.careerHistory.length &&
    input.assignments.every((assignment) =>
      expectedIds.has(assignment.experienceId),
    ) &&
    input.careerHistory.every((entry) =>
      assignmentIds.includes(entry.experienceId),
    );
  if (!allCareerEntriesAssigned) {
    errors.push("Every career entry must receive exactly one role assignment.");
  }
  if (uniqueDuplicateIds.length > 0) {
    errors.push(
      `Duplicate role assignments found for: ${uniqueDuplicateIds.join(", ")}.`,
    );
  }

  const roleByExperienceId = new Map(
    input.careerHistory.map((entry) => [
      entry.experienceId,
      entry.role?.trim() ?? "",
    ]),
  );
  const hasManualRole = (experienceId: string): boolean =>
    Boolean(roleByExperienceId.get(experienceId));

  const mostRecent = input.assignments.find(
    (assignment) => assignment.isMostRecent,
  );
  const mostRecentUsesManualRole = mostRecent
    ? hasManualRole(mostRecent.experienceId)
    : false;
  const targetRoleAssignedToMostRecent =
    mostRecentUsesManualRole ||
    (mostRecent?.assignedRole === input.targetRoleAnalysis.targetRole &&
      mostRecent.chronologyRank === 1);
  if (!targetRoleAssignedToMostRecent) {
    errors.push("The most recent career entry must receive the target JD role.");
  }

  const sorted = [...input.assignments].sort(
    (left, right) => left.chronologyRank - right.chronologyRank,
  );
  let naturalProgression = true;
  for (let index = 1; index < sorted.length; index += 1) {
    const newer = sorted[index - 1];
    const older = sorted[index];
    if (!newer || !older) continue;
    // Manual titles are user-authored; skip automatic seniority progression checks.
    if (hasManualRole(newer.experienceId) || hasManualRole(older.experienceId)) {
      continue;
    }
    if (SENIORITY_RANK[older.seniority] > SENIORITY_RANK[newer.seniority]) {
      naturalProgression = false;
      errors.push(
        `Older role ${older.assignedRole} is more senior than newer role ${newer.assignedRole}.`,
      );
    }
  }

  const requirementById = new Map(
    input.requirements.map((requirement) => [
      requirement.requirementId,
      requirement,
    ]),
  );
  const focusAreasGroundedInRequirements = input.assignments.every(
    (assignment) =>
      assignment.focusAreas.length > 0 &&
      assignment.sourceRequirementIds.length === assignment.focusAreas.length &&
      assignment.sourceRequirementIds.every((requirementId, index) => {
        const requirement = requirementById.get(requirementId);
        return requirement?.normalizedText === assignment.focusAreas[index];
      }),
  );
  if (!focusAreasGroundedInRequirements) {
    errors.push("Every role focus area must be grounded in an extracted JD requirement.");
  }

  const jdLower = input.jobDescription.normalizedText.toLowerCase();
  const unsupportedEvidence = input.targetRoleAnalysis.evidence.filter(
    (evidence) => !jdLower.includes(evidence.sourceText.toLowerCase()),
  );
  if (unsupportedEvidence.length > 0) {
    errors.push("Target role analysis contains evidence not present in the JD.");
  }

  const ranks = input.assignments.map((assignment) => assignment.chronologyRank);
  const expectedRanks = Array.from(
    { length: input.assignments.length },
    (_, index) => index + 1,
  );
  const ranksValid =
    new Set(ranks).size === ranks.length &&
    expectedRanks.every((rank) => ranks.includes(rank));
  if (!ranksValid) {
    errors.push("Career chronology ranks must be unique and contiguous.");
  }

  return {
    allCareerEntriesAssigned,
    targetRoleAssignedToMostRecent,
    naturalProgression,
    focusAreasGroundedInRequirements,
    duplicateExperienceIds: uniqueDuplicateIds,
    errors,
    overallStatus: errors.length === 0 ? "approved" : "rejected",
  };
}
