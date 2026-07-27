import type { GenerationContext } from "@resume/contracts";

export function assertSkillsContextMatch(
  expected: GenerationContext,
  actual: GenerationContext,
  componentName: string,
): void {
  const matches =
    actual.generationId === expected.generationId &&
    actual.profileId === expected.profileId &&
    actual.jdId === expected.jdId &&
    actual.jdHash === expected.jdHash;
  if (!matches) {
    throw new Error(
      `${componentName} context mismatch. Cross-JD or cross-run skills output rejected.`,
    );
  }
}
