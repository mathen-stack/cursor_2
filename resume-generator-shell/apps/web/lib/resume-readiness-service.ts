import {
  ExternalResumeCalibrationAnalyzer,
  InMemoryExternalResumeTestStore,
  JsonFileExternalResumeTestStore,
  ResumeReadinessService,
  ResumeWordedReadinessEngine,
  type ExternalResumeTestStore,
} from "@resume/core";

interface ReadinessGlobal {
  __resumeReadinessService?: ResumeReadinessService;
}

const globalReadiness = globalThis as typeof globalThis & ReadinessGlobal;

function createStore(): ExternalResumeTestStore {
  const file = process.env.RESUME_CALIBRATION_STORE_FILE?.trim();
  return file
    ? new JsonFileExternalResumeTestStore(file)
    : new InMemoryExternalResumeTestStore();
}

export function getResumeReadinessService(): ResumeReadinessService {
  if (!globalReadiness.__resumeReadinessService) {
    globalReadiness.__resumeReadinessService = new ResumeReadinessService(
      new ResumeWordedReadinessEngine(),
      new ExternalResumeCalibrationAnalyzer(),
      createStore(),
    );
  }
  return globalReadiness.__resumeReadinessService;
}
