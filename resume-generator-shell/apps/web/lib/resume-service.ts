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
  loadExperienceModelProviderConfig,
} from "@resume/engines";

interface ResumeServiceGlobal {
  __resumeGenerationService?: ResumeGenerationService;
}

const globalService = globalThis as typeof globalThis & ResumeServiceGlobal;

export function getResumeGenerationService(): ResumeGenerationService {
  if (globalService.__resumeGenerationService) {
    return globalService.__resumeGenerationService;
  }

  const experienceBundle = createProductionExperienceEngine({
    modelProvider: loadExperienceModelProviderConfig(process.env),
  });
  const orchestrator = new ResumeOrchestrator(
    {
      experience: experienceBundle.engine,
      summary: createProductionSummaryEngine(),
      skills: createProductionSkillsEngine(),
      template: createProductionTemplateEngine(),
    },
    new ImmutableFinalResumeAssembler(),
  );
  const service = new ResumeGenerationService(orchestrator);
  globalService.__resumeGenerationService = service;
  return service;
}
