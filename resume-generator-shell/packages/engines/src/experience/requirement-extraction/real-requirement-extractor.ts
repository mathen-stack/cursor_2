import type { StructuredLanguageModel } from "../../providers/language-model";
import type {
  RequirementExtractor,
  RequirementExtractorInput,
  RequirementExtractorOutput,
} from "../types/requirement";
import {
  parseRequirementCandidateEnvelope,
  REQUIREMENT_CANDIDATE_JSON_SCHEMA,
} from "./candidate-schema";
import { postProcessRequirementCandidates } from "./requirement-post-processor";

const SYSTEM_PROMPT = `You extract atomic requirements from a job description.
Return JSON only. Every requirement must be grounded in exact source text from
that job description. Split compound responsibilities into separate atomic
requirements. Preserve required versus preferred wording. Do not infer tools,
responsibilities, outcomes, roles, metrics, STAR stories, or resume bullets.`;

export interface RealRequirementExtractorOptions {
  model: StructuredLanguageModel;
}

export class RealRequirementExtractor implements RequirementExtractor {
  readonly name = "real-requirement-extractor";

  constructor(private readonly options: RealRequirementExtractorOptions) {}

  async execute(
    input: RequirementExtractorInput,
  ): Promise<RequirementExtractorOutput> {
    this.assertContext(input);

    const originalJobDescription = input.jobDescription.rawText;
    if (originalJobDescription.trim().length < 20) {
      throw new Error("Job description is empty or too short for extraction.");
    }

    const rawOutput = await this.options.model.generateStructured({
      task: "extract-atomic-jd-requirements",
      systemPrompt: SYSTEM_PROMPT,
      input: {
        generationId: input.context.generationId,
        jdId: input.context.jdId,
        jdHash: input.context.jdHash,
        jobDescription: originalJobDescription,
      },
      jsonSchema: REQUIREMENT_CANDIDATE_JSON_SCHEMA,
      temperature: 0,
    });

    const envelope = parseRequirementCandidateEnvelope(rawOutput);
    const requirements = postProcessRequirementCandidates(
      envelope.requirements,
      originalJobDescription,
    );

    return {
      context: { ...input.context },
      requirements,
    };
  }

  private assertContext(input: RequirementExtractorInput): void {
    const contextMatches =
      input.context.jdId === input.jobDescription.jdId &&
      input.context.jdHash === input.jobDescription.contentHash;

    if (!contextMatches) {
      throw new Error(
        "Requirement Extractor context does not match the supplied JD.",
      );
    }
  }
}
