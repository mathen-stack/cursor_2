import {
  ConsoleGenerationLogger,
  ExperienceGenerationService,
} from "@resume/core";
import {
  createProductionExperienceEngine,
  loadExperienceModelProviderConfig,
} from "@resume/engines";
import { getGenerationRunStore } from "./generation-store";

interface ServiceGlobal {
  __resumeExperienceService?: ExperienceGenerationService;
}

const globalService = globalThis as typeof globalThis & ServiceGlobal;

function createExperienceGenerationService(): ExperienceGenerationService {
  const modelProvider = loadExperienceModelProviderConfig(process.env);
  const bundle = createProductionExperienceEngine({ modelProvider });
  return new ExperienceGenerationService({
    engine: bundle.engine,
    providerName: bundle.providerName,
    store: getGenerationRunStore(),
    logger: new ConsoleGenerationLogger(),
  });
}

export function getExperienceGenerationService(): ExperienceGenerationService {
  // Match resume-service: avoid stale engine singletons under Next HMR.
  if (process.env.NODE_ENV !== "production") {
    return createExperienceGenerationService();
  }

  if (globalService.__resumeExperienceService) {
    return globalService.__resumeExperienceService;
  }

  const service = createExperienceGenerationService();
  globalService.__resumeExperienceService = service;
  return service;
}
