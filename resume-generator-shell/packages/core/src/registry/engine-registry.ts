import type {
  ExperienceEngine,
  SkillsEngine,
  SummaryEngine,
  TemplateEngine,
} from "@resume/contracts";

export interface EngineRegistry {
  experience: ExperienceEngine;
  summary: SummaryEngine;
  skills: SkillsEngine;
  template: TemplateEngine;
}
