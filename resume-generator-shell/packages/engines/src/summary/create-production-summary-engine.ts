import {
  ExperienceYearCalculator,
  type ExperienceYearCalculatorOptions,
} from "./analysis/experience-year-calculator";
import {
  SummaryKeywordAllocator,
  type SummaryKeywordAllocatorOptions,
} from "./analysis/summary-keyword-allocator";
import { SummaryTargetRoleAnalyzer } from "./analysis/summary-target-role-analyzer";
import { SummaryComposer } from "./generation/summary-composer";
import {
  DefaultSummaryEngine,
  type DefaultSummaryEngineOptions,
} from "./summary-engine";
import { SummaryValidator } from "./validation/summary-validator";

export interface ProductionSummaryEngineOptions extends DefaultSummaryEngineOptions {
  experienceYears?: ExperienceYearCalculatorOptions;
  keywordAllocation?: SummaryKeywordAllocatorOptions;
}

export function createProductionSummaryEngine(
  options: ProductionSummaryEngineOptions = {},
): DefaultSummaryEngine {
  return new DefaultSummaryEngine(
    {
      targetRoleAnalyzer: new SummaryTargetRoleAnalyzer(),
      experienceYearCalculator: new ExperienceYearCalculator(options.experienceYears),
      keywordAllocator: new SummaryKeywordAllocator(options.keywordAllocation),
      composer: new SummaryComposer(),
      validator: new SummaryValidator(),
    },
    options,
  );
}
