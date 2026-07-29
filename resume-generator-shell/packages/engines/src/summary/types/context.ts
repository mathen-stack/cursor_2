import type { GenerationContext } from "@resume/contracts";

export interface SummaryContextCarrier {
  context: GenerationContext;
}

export function assertSummaryContextMatch(
  expected: GenerationContext,
  actual: GenerationContext,
  engineName: string,
): void {
  const matches =
    expected.generationId === actual.generationId &&
    expected.jdId === actual.jdId &&
    expected.jdHash === actual.jdHash &&
    expected.profileId === actual.profileId;

  if (!matches) {
    throw new Error(`${engineName} returned output for a different generation context.`);
  }
}
