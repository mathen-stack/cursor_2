import { ExplicitSkillExtractor } from "./extraction/explicit-skill-extractor";
import {
  SupportingSkillInferenceEngine,
  type SupportingSkillInferenceOptions,
} from "./inference/supporting-skill-inference-engine";
import {
  SkillRankingEngine,
  type SkillRankingOptions,
} from "./ranking/skill-ranking-engine";
import {
  DefaultSkillsEngine,
  type DefaultSkillsEngineOptions,
} from "./skills-engine";
import { SkillsValidator } from "./validation/skills-validator";

export interface ProductionSkillsEngineOptions extends DefaultSkillsEngineOptions {
  inference?: SupportingSkillInferenceOptions;
  ranking?: SkillRankingOptions;
}

export function createProductionSkillsEngine(
  options: ProductionSkillsEngineOptions = {},
): DefaultSkillsEngine {
  return new DefaultSkillsEngine(
    {
      explicitSkillExtractor: new ExplicitSkillExtractor(),
      supportingSkillInferenceEngine: new SupportingSkillInferenceEngine(
        options.inference,
      ),
      skillRankingEngine: new SkillRankingEngine(options.ranking),
      skillsValidator: new SkillsValidator(),
    },
    options,
  );
}
