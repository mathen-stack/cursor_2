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
import { getGenerationRunStore } from "./generation-store";

interface ResumeServiceGlobal {
  __resumeGenerationService?: ResumeGenerationService;
}

const globalService = globalThis as typeof globalThis & ResumeServiceGlobal;

function createResumeGenerationService(): ResumeGenerationService {
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
  );
  return new ResumeGenerationService(orchestrator, {
    store: getGenerationRunStore(),
    providerName: experienceBundle.providerName,
  });
}

export function getResumeGenerationService(): ResumeGenerationService {
  // In development, never reuse a process-global singleton. Next HMR can leave
  // stale engine instances on globalThis after @resume/engines edits, which
  // surfaces as already-fixed composition validation failures in the UI.
  if (process.env.NODE_ENV !== "production") {
    return createResumeGenerationService();
  }

  if (globalService.__resumeGenerationService) {
    return globalService.__resumeGenerationService;
  }

  const service = createResumeGenerationService();
  globalService.__resumeGenerationService = service;
  return service;
}
