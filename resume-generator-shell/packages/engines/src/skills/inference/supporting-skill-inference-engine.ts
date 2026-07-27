import {
  SKILL_DEFINITION_BY_KEY,
  SKILL_INFERENCE_RULES,
} from "../skill-taxonomy";
import type {
  SkillCandidate,
  SkillInferenceInput,
  SkillExtractionOutput,
} from "../types/skill-candidate";

export interface SupportingSkillInferenceOptions {
  maximumInferredSkills?: number;
}

export class SupportingSkillInferenceEngine {
  readonly name = "supporting-skill-inference-engine";
  private readonly maximumInferredSkills: number;

  constructor(options: SupportingSkillInferenceOptions = {}) {
    this.maximumInferredSkills = options.maximumInferredSkills ?? 10;
  }

  async execute(input: SkillInferenceInput): Promise<SkillExtractionOutput> {
    const explicitKeys = new Set(input.explicitCandidates.map((candidate) => candidate.key));
    const inferredByKey = new Map<string, SkillCandidate>();

    for (const rule of SKILL_INFERENCE_RULES) {
      const triggers = rule.triggerKeys.filter((key) => explicitKeys.has(key));
      if (triggers.length === 0 || explicitKeys.has(rule.inferredKey)) continue;
      const definition = SKILL_DEFINITION_BY_KEY.get(rule.inferredKey);
      if (!definition) continue;

      const strongestTriggerScore = Math.max(
        ...input.explicitCandidates
          .filter((candidate) => triggers.includes(candidate.key))
          .map((candidate) => candidate.score),
      );
      const score = Math.min(74, Math.round(strongestTriggerScore * 0.72));
      const current = inferredByKey.get(definition.key);
      if (current) {
        current.inferredFrom = [...new Set([...current.inferredFrom, ...triggers])];
        current.score = Math.max(current.score, score);
        continue;
      }

      inferredByKey.set(definition.key, {
        key: definition.key,
        name: definition.name,
        category: definition.category,
        source: "inferred",
        priority: score >= 68 ? "high" : "medium",
        score,
        evidence: [],
        inferredFrom: triggers,
        mentionCount: 0,
      });
    }

    const candidates = [...inferredByKey.values()]
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
      .slice(0, this.maximumInferredSkills);

    return { context: input.context, candidates };
  }
}
