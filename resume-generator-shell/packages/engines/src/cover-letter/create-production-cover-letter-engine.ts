import {
  ExperienceYearCalculator,
  type ExperienceYearCalculatorOptions,
} from "../summary/analysis/experience-year-calculator";
import {
  SummaryKeywordAllocator,
  type SummaryKeywordAllocatorOptions,
} from "../summary/analysis/summary-keyword-allocator";
import { SummaryTargetRoleAnalyzer } from "../summary/analysis/summary-target-role-analyzer";
import { CoverLetterComposer } from "./cover-letter-composer";
import {
  DefaultCoverLetterEngine,
  type DefaultCoverLetterEngineOptions,
} from "./cover-letter-engine";

export interface ProductionCoverLetterEngineOptions
  extends DefaultCoverLetterEngineOptions {
  experienceYears?: ExperienceYearCalculatorOptions;
  keywordAllocation?: SummaryKeywordAllocatorOptions;
}

export function createProductionCoverLetterEngine(
  options: ProductionCoverLetterEngineOptions = {},
): DefaultCoverLetterEngine {
  return new DefaultCoverLetterEngine(
    {
      targetRoleAnalyzer: new SummaryTargetRoleAnalyzer(),
      experienceYearCalculator: new ExperienceYearCalculator(options.experienceYears),
      keywordAllocator: new SummaryKeywordAllocator(options.keywordAllocation),
      composer: new CoverLetterComposer(),
    },
    options,
  );
}
