import {
  ConsoleGenerationLogger,
  ExperienceGenerationService,
  InMemoryExperienceGenerationRunStore,
  JsonFileExperienceGenerationRunStore,
  type ExperienceGenerationRunStore,
} from "@resume/core";
import {
  createProductionExperienceEngine,
  loadExperienceModelProviderConfig,
} from "@resume/engines";

interface ServiceGlobal {
  __resumeExperienceService?: ExperienceGenerationService;
}

const globalService = globalThis as typeof globalThis & ServiceGlobal;

function createStore(): ExperienceGenerationRunStore {
  const filePath = process.env.GENERATION_STORE_FILE?.trim();
  return filePath
    ? new JsonFileExperienceGenerationRunStore(filePath)
    : new InMemoryExperienceGenerationRunStore();
}

export function getExperienceGenerationService(): ExperienceGenerationService {
  if (globalService.__resumeExperienceService) {
    return globalService.__resumeExperienceService;
  }

  const modelProvider = loadExperienceModelProviderConfig(process.env);
  const bundle = createProductionExperienceEngine({ modelProvider });
  const service = new ExperienceGenerationService({
    engine: bundle.engine,
    providerName: bundle.providerName,
    store: createStore(),
    logger: new ConsoleGenerationLogger(),
  });

  globalService.__resumeExperienceService = service;
  return service;
}
