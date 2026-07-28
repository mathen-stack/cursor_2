import {
  InMemoryExperienceGenerationRunStore,
  JsonFileExperienceGenerationRunStore,
  type ExperienceGenerationRunStore,
} from "@resume/core";

interface StoreGlobal {
  __resumeGenerationRunStore?: ExperienceGenerationRunStore;
}

const globalStore = globalThis as typeof globalThis & StoreGlobal;

/** Shared persistence for experience-only and full-resume generation history. */
export function getGenerationRunStore(): ExperienceGenerationRunStore {
  if (globalStore.__resumeGenerationRunStore) {
    return globalStore.__resumeGenerationRunStore;
  }
  const filePath = process.env.GENERATION_STORE_FILE?.trim();
  const store = filePath
    ? new JsonFileExperienceGenerationRunStore(filePath)
    : new InMemoryExperienceGenerationRunStore();
  globalStore.__resumeGenerationRunStore = store;
  return store;
}
