import { describe, expect, it } from "vitest";
import {
  assertContextMatch,
  createGenerationContext,
  createJobDescription,
} from "@resume/core";

const outputBase = {
  engineName: "test-engine",
  engineVersion: "0.1.0",
  status: "approved" as const,
};

describe("generation isolation", () => {
  it("creates different run IDs and JD hashes for different JDs", () => {
    const a = createJobDescription(
      "Senior ML Engineer role requiring production model deployment and monitoring experience.",
    );
    const b = createJobDescription(
      "Senior Data Engineer role requiring scalable ETL pipelines and warehouse optimization.",
    );

    const runA = createGenerationContext("PROFILE-1", a);
    const runB = createGenerationContext("PROFILE-1", b);

    expect(runA.generationId).not.toBe(runB.generationId);
    expect(runA.jdHash).not.toBe(runB.jdHash);
  });

  it("rejects an engine output from another JD run", () => {
    const jdA = createJobDescription(
      "Senior ML Engineer role requiring production model deployment and monitoring experience.",
    );
    const jdB = createJobDescription(
      "Senior Data Engineer role requiring scalable ETL pipelines and warehouse optimization.",
    );
    const runA = createGenerationContext("PROFILE-1", jdA);
    const runB = createGenerationContext("PROFILE-1", jdB);

    expect(() =>
      assertContextMatch(runA, { ...outputBase, context: runB }),
    ).toThrow(/Cross-JD or cross-run output rejected/);
  });
});
