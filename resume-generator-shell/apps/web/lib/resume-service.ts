import {
  ImmutableFinalResumeAssembler,
  ResumeGenerationService,
  ResumeOrchestrator,
} from "@resume/core";
import {
  createProductionExperienceEngine,
  createProductionSkillsEngine,
  createProductionSummaryEngine,
  createProductionTemplateEngine,
  detectEngineeringStacks,
  loadExperienceModelProviderConfig,
} from "@resume/engines";
import { getGenerationRunStore } from "./generation-store";

interface ResumeServiceGlobal {
  __resumeGenerationService?: ResumeGenerationService;
}

const globalService = globalThis as typeof globalThis & ResumeServiceGlobal;

export function getResumeGenerationService(): ResumeGenerationService {
  if (globalService.__resumeGenerationService) {
    return globalService.__resumeGenerationService;
  }

  const modelProvider = loadExperienceModelProviderConfig(process.env);
  const experienceBundle = createProductionExperienceEngine({
    modelProvider,
  });
  const orchestrator = new ResumeOrchestrator(
    {
      experience: experienceBundle.engine,
      summary: createProductionSummaryEngine(),
      skills: createProductionSkillsEngine(),
      template: createProductionTemplateEngine(),
    },
    new ImmutableFinalResumeAssembler(),
    undefined,
    detectEngineeringStacks,
  );
  const service = new ResumeGenerationService(orchestrator, {
    store: getGenerationRunStore(),
    providerName: experienceBundle.providerName,
  });
  globalService.__resumeGenerationService = service;
  return service;
}
