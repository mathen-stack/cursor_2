import type { EngineOutputBase, GenerationContext } from "@resume/contracts";

export function assertContextMatch(
  expected: GenerationContext,
  output: EngineOutputBase,
): void {
  const actual = output.context;
  const matches =
    actual.generationId === expected.generationId &&
    actual.profileId === expected.profileId &&
    actual.jdId === expected.jdId &&
    actual.jdHash === expected.jdHash;

  if (!matches) {
    throw new Error(
      `Engine context mismatch for ${output.engineName}. Cross-JD or cross-run output rejected.`,
    );
  }
}
