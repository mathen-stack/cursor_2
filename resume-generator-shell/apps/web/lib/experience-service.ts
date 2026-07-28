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

export function getExperienceGenerationService(): ExperienceGenerationService {
  if (globalService.__resumeExperienceService) {
    return globalService.__resumeExperienceService;
  }

  const modelProvider = loadExperienceModelProviderConfig(process.env);
  const bundle = createProductionExperienceEngine({ modelProvider });
  const service = new ExperienceGenerationService({
    engine: bundle.engine,
    providerName: bundle.providerName,
    store: getGenerationRunStore(),
    logger: new ConsoleGenerationLogger(),
  });

  globalService.__resumeExperienceService = service;
  return service;
}
