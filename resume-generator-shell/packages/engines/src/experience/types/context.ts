import type { GenerationContext } from "@resume/contracts";

export interface ContextualResult {
  context: GenerationContext;
}

export function assertSubEngineContextMatch(
  expected: GenerationContext,
  actual: GenerationContext,
  subEngineName: string,
): void {
  const matches =
    actual.generationId === expected.generationId &&
    actual.profileId === expected.profileId &&
    actual.jdId === expected.jdId &&
    actual.jdHash === expected.jdHash;

  if (!matches) {
    throw new Error(
      `${subEngineName} context mismatch. Cross-JD or cross-run output rejected.`,
    );
  }
}
