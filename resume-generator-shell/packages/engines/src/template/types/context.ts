import type { GenerationContext } from "@resume/contracts";

export function assertTemplateContextMatch(
  expected: GenerationContext,
  actual: GenerationContext,
  engineName: string,
): void {
  const matches =
    actual.generationId === expected.generationId &&
    actual.profileId === expected.profileId &&
    actual.jdId === expected.jdId &&
    actual.jdHash === expected.jdHash;

  if (!matches) {
    throw new Error(
      `Template context mismatch for ${engineName}. Cross-JD or cross-run output rejected.`,
    );
  }
}
