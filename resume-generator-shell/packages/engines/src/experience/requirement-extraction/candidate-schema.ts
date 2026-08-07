import type {
  RequirementCategory,
  RequirementNecessity,
  RequirementPriority,
} from "../types/requirement";

export interface RequirementCandidate {
  sourceText: string;
  normalizedText: string;
  category: RequirementCategory;
  priority: RequirementPriority;
  necessity: RequirementNecessity;
}

export interface RequirementCandidateEnvelope {
  requirements: RequirementCandidate[];
}

const CATEGORIES = new Set<RequirementCategory>([
  "technical-responsibility",
  "technical-skill",
  "tool-or-platform",
  "architecture",
  "deployment",
  "monitoring",
  "performance",
  "data",
  "security",
  "communication",
  "collaboration",
  "leadership",
  "business-outcome",
  "education",
  "experience",
  "other",
]);

const PRIORITIES = new Set<RequirementPriority>([
  "critical",
  "high",
  "medium",
  "low",
]);

const NECESSITIES = new Set<RequirementNecessity>([
  "required",
  "preferred",
  "implied",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(
      `Requirement model returned malformed JSON: ${
        error instanceof Error ? error.message : "unknown parse error"
      }`,
    );
  }
}

export function parseRequirementCandidateEnvelope(
  rawValue: unknown,
): RequirementCandidateEnvelope {
  const parsed = parseMaybeJson(rawValue);

  if (!isRecord(parsed) || !Array.isArray(parsed.requirements)) {
    throw new Error(
      "Requirement model output must be an object containing a requirements array.",
    );
  }

  // Skip incomplete/invalid candidates (e.g. empty normalizedText from the
  // model) instead of failing the entire generation run. Valid candidates keep
  // the same post-processing path as before.
  const requirements: RequirementCandidate[] = [];
  for (const value of parsed.requirements) {
    if (!isRecord(value)) {
      continue;
    }

    const sourceText = value.sourceText;
    const normalizedText = value.normalizedText;
    const category = value.category;
    const priority = value.priority;
    const necessity = value.necessity;

    if (typeof sourceText !== "string" || sourceText.trim().length === 0) {
      continue;
    }
    if (
      typeof normalizedText !== "string" ||
      normalizedText.trim().length === 0
    ) {
      continue;
    }
    if (typeof category !== "string" || !CATEGORIES.has(category as RequirementCategory)) {
      continue;
    }
    if (typeof priority !== "string" || !PRIORITIES.has(priority as RequirementPriority)) {
      continue;
    }
    if (
      typeof necessity !== "string" ||
      !NECESSITIES.has(necessity as RequirementNecessity)
    ) {
      continue;
    }

    requirements.push({
      sourceText: sourceText.trim(),
      normalizedText: normalizedText.trim(),
      category: category as RequirementCategory,
      priority: priority as RequirementPriority,
      necessity: necessity as RequirementNecessity,
    });
  }

  if (requirements.length === 0) {
    throw new Error("Requirement model returned no requirements.");
  }

  return { requirements };
}

export const REQUIREMENT_CANDIDATE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["requirements"],
  properties: {
    requirements: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "sourceText",
          "normalizedText",
          "category",
          "priority",
          "necessity",
        ],
        properties: {
          sourceText: { type: "string", minLength: 1 },
          normalizedText: { type: "string", minLength: 1 },
          category: { type: "string", enum: [...CATEGORIES] },
          priority: { type: "string", enum: [...PRIORITIES] },
          necessity: { type: "string", enum: [...NECESSITIES] },
        },
      },
    },
  },
} as const;
