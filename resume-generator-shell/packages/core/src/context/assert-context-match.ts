import type { EngineOutputBase, GenerationContext } from "@resume/contracts";

function hasNonEmptyId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function assertIdentifiersPresent(
  expected: GenerationContext,
  actual: GenerationContext,
): void {
  const fields: Array<keyof GenerationContext> = [
    "generationId",
    "profileId",
    "jdId",
    "jdHash",
  ];
  for (const field of fields) {
    if (!hasNonEmptyId(expected[field]) || !hasNonEmptyId(actual[field])) {
      throw new Error(
        `Generation context rejected: missing or empty ${String(field)}.`,
      );
    }
  }
}

/**
 * Rejects missing/empty identifiers and any cross-generation, cross-profile,
 * cross-JD, or stale-hash mismatch before downstream engines consume output.
 */
export function assertContextMatch(
  expected: GenerationContext,
  output: EngineOutputBase,
): void {
  const actual = output.context;
  assertIdentifiersPresent(expected, actual);

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

/** Spec-aligned alias used across engines, assembly, readiness, and export. */
export const assertGenerationContextMatches = assertContextMatch;
