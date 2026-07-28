import type {
  StructuredGenerationRequest,
  StructuredLanguageModel,
} from "../../providers/language-model";
import { candidatesFromSegment, splitSourceSegments } from "./requirement-heuristics";

/**
 * Offline structured model used for local development and deterministic tests.
 * It extracts requirements from the supplied JD instead of returning fixed mock
 * content. A vendor-backed model adapter can replace it through dependency
 * injection without changing the Requirement Extraction Engine.
 */
export class RuleBasedRequirementModel implements StructuredLanguageModel {
  readonly name = "rule-based-requirement-model";

  async generateStructured(
    request: StructuredGenerationRequest,
  ): Promise<unknown> {
    const jobDescription = request.input.jobDescription;
    if (typeof jobDescription !== "string") {
      throw new Error(
        "RuleBasedRequirementModel requires input.jobDescription as a string.",
      );
    }

    const requirements = splitSourceSegments(jobDescription).flatMap((segment) =>
      candidatesFromSegment(segment.sourceText),
    );

    return { requirements };
  }
}
