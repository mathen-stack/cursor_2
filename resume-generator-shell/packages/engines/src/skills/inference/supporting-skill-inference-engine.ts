import {
  DENSITY_BACKFILL_KEYS,
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
  /** Prefer enough grounded candidates for ranking to meet this floor. */
  minimumSkills?: number;
}

function addInferredCandidate(
  inferredByKey: Map<string, SkillCandidate>,
  inferredKey: string,
  triggers: readonly string[],
  triggerScore: number,
): void {
  const definition = SKILL_DEFINITION_BY_KEY.get(inferredKey);
  if (!definition || triggers.length === 0) {
    return;
  }
  const score = Math.min(74, Math.round(triggerScore * 0.72));
  const current = inferredByKey.get(definition.key);
  if (current) {
    current.inferredFrom = [...new Set([...current.inferredFrom, ...triggers])];
    current.score = Math.max(current.score, score);
    return;
  }
  inferredByKey.set(definition.key, {
    key: definition.key,
    name: definition.name,
    category: definition.category,
    source: "inferred",
    priority: score >= 68 ? "high" : "medium",
    score,
    evidence: [],
    inferredFrom: [...triggers],
    mentionCount: 0,
  });
}

export class SupportingSkillInferenceEngine {
  readonly name = "supporting-skill-inference-engine";
  private readonly maximumInferredSkills: number;
  private readonly minimumSkills: number;

  constructor(options: SupportingSkillInferenceOptions = {}) {
    this.maximumInferredSkills = options.maximumInferredSkills ?? 24;
    this.minimumSkills = options.minimumSkills ?? 6;
  }

  async execute(input: SkillInferenceInput): Promise<SkillExtractionOutput> {
    const explicitKeys = new Set(
      input.explicitCandidates.map((candidate) => candidate.key),
    );
    const inferredByKey = new Map<string, SkillCandidate>();
    const strongestExplicitScore =
      input.explicitCandidates.length > 0
        ? Math.max(...input.explicitCandidates.map((candidate) => candidate.score))
        : 60;
    const primaryTriggers = input.explicitCandidates
      .slice()
      .sort(
        (left, right) =>
          right.score - left.score || left.name.localeCompare(right.name),
      )
      .map((candidate) => candidate.key);

    const groundTriggers = (triggers: readonly string[]): string[] => {
      const explicitTriggers = triggers.filter((key) => explicitKeys.has(key));
      if (explicitTriggers.length > 0) {
        return explicitTriggers;
      }
      // Multi-hop rules may fire from inferred keys; still ground in explicit JD skills.
      return primaryTriggers.slice(0, 3);
    };

    const applyRules = (triggerKeys: ReadonlySet<string>): void => {
      for (const rule of SKILL_INFERENCE_RULES) {
        const matched = rule.triggerKeys.filter((key) => triggerKeys.has(key));
        if (matched.length === 0 || explicitKeys.has(rule.inferredKey)) {
          continue;
        }
        const grounded = groundTriggers(matched);
        if (grounded.length === 0) {
          continue;
        }
        addInferredCandidate(
          inferredByKey,
          rule.inferredKey,
          grounded,
          strongestExplicitScore,
        );
      }
    };

    // Pass 1: explicit triggers only.
    applyRules(explicitKeys);

    // Pass 2: allow first-hop inferred keys to unlock additional grounded rules
    // so thin stacks (Bash/Linux, GraphQL, Redis) can reach density.
    if (primaryTriggers.length > 0) {
      applyRules(new Set([...explicitKeys, ...inferredByKey.keys()]));
    }

    // Pass 3: universal density backfill grounded in explicit JD skills.
    if (primaryTriggers.length > 0) {
      const densityTarget = Math.max(this.minimumSkills + 2, 8);
      for (const inferredKey of DENSITY_BACKFILL_KEYS) {
        const poolSize = explicitKeys.size + inferredByKey.size;
        if (poolSize >= densityTarget) {
          break;
        }
        if (explicitKeys.has(inferredKey) || inferredByKey.has(inferredKey)) {
          continue;
        }
        addInferredCandidate(
          inferredByKey,
          inferredKey,
          primaryTriggers.slice(0, 3),
          strongestExplicitScore,
        );
      }
    }

    const candidates = [...inferredByKey.values()]
      .sort(
        (left, right) =>
          right.score - left.score || left.name.localeCompare(right.name),
      )
      .slice(0, this.maximumInferredSkills);

    return { context: input.context, candidates };
  }
}
