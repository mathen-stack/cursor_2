import { TemplateContextAnalyzer } from "./analysis/template-context-analyzer";
import { LayoutSelectionEngine } from "./selection/layout-selection-engine";
import { SectionSelectionEngine } from "./selection/section-selection-engine";
import {
  DefaultTemplateEngine,
  type DefaultTemplateEngineOptions,
} from "./template-engine";
import { TemplateValidator } from "./validation/template-validator";

export function createProductionTemplateEngine(
  options: DefaultTemplateEngineOptions = {},
): DefaultTemplateEngine {
  return new DefaultTemplateEngine(
    {
      contextAnalyzer: new TemplateContextAnalyzer(),
      sectionSelectionEngine: new SectionSelectionEngine(),
      layoutSelectionEngine: new LayoutSelectionEngine(),
      validator: new TemplateValidator(),
    },
    options,
  );
}
