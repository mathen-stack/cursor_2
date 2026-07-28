import { describe, expect, it } from "vitest";
import type { JobDescription } from "@resume/contracts";
import { createGenerationContext, createJobDescription } from "@resume/core";
import {
  RealRequirementExtractor,
  RuleBasedRequirementModel,
  createMilestone2ExperienceEngine,
  type StructuredGenerationRequest,
  type StructuredLanguageModel,
} from "@resume/engines";

function createExtractorInput(jdText: string) {
  const jobDescription = createJobDescription(jdText);
  return {
    context: createGenerationContext("PROFILE-001", jobDescription),
    jobDescription,
  };
}

class StaticStructuredModel implements StructuredLanguageModel {
  readonly name = "static-structured-model";

  constructor(private readonly output: unknown) {}

  async generateStructured(
    _request: StructuredGenerationRequest,
  ): Promise<unknown> {
    return structuredClone(this.output);
  }
}

const compoundJd = [
  "Senior Machine Learning Engineer.",
  "Build, deploy, and monitor machine learning models in production.",
  "Kubernetes experience is required.",
  "MLflow experience is preferred.",
  "Collaborate with product and engineering stakeholders.",
  "Candidates must have 5+ years of experience and a Bachelor's degree in Computer Science.",
].join("\n");

describe("Real JD Requirement Extraction Engine", () => {
  it("extracts evidence-grounded atomic requirements", async () => {
    const input = createExtractorInput(compoundJd);
    const extractor = new RealRequirementExtractor({
      model: new RuleBasedRequirementModel(),
    });

    const result = await extractor.execute(input);
    const normalized = result.requirements.map(
      (requirement) => requirement.normalizedText,
    );

    expect(normalized.some((value) => /build machine learning models/i.test(value))).toBe(true);
    expect(normalized.some((value) => /deploy machine learning models/i.test(value))).toBe(true);
    expect(normalized.some((value) => /monitor machine learning models/i.test(value))).toBe(true);
    expect(result.requirements.some((item) => item.category === "collaboration")).toBe(true);

    for (const requirement of result.requirements) {
      expect(requirement.requirementId).toMatch(/^REQ-\d{3}$/);
      expect(requirement.evidence.length).toBeGreaterThan(0);
      for (const evidence of requirement.evidence) {
        expect(input.jobDescription.rawText.slice(evidence.startIndex, evidence.endIndex)).toBe(
          evidence.sourceText,
        );
      }
    }
  });

  it("preserves required versus preferred qualifications", async () => {
    const result = await new RealRequirementExtractor({
      model: new RuleBasedRequirementModel(),
    }).execute(createExtractorInput(compoundJd));

    const kubernetes = result.requirements.find((item) =>
      item.normalizedText.includes("Kubernetes"),
    );
    const mlflow = result.requirements.find((item) =>
      item.normalizedText.includes("MLflow"),
    );

    expect(kubernetes?.necessity).toBe("required");
    expect(mlflow?.necessity).toBe("preferred");
  });

  it("rejects a technology hallucinated by the model", async () => {
    const jd = "Senior backend role requiring Python API development, testing, monitoring, stakeholder communication, and production support.";
    const input = createExtractorInput(jd);
    const extractor = new RealRequirementExtractor({
      model: new StaticStructuredModel({
        requirements: [
          {
            sourceText: jd,
            normalizedText: "Deploy services using Kubernetes.",
            category: "deployment",
            priority: "high",
            necessity: "implied",
          },
        ],
      }),
    });

    await expect(extractor.execute(input)).rejects.toThrow(
      /technology not supported by the JD/i,
    );
  });

  it("rejects evidence that is not present verbatim in the JD", async () => {
    const jd = "Senior data role requiring SQL pipeline development, data quality monitoring, stakeholder collaboration, and cloud platform experience.";
    const input = createExtractorInput(jd);
    const extractor = new RealRequirementExtractor({
      model: new StaticStructuredModel({
        requirements: [
          {
            sourceText: "This sentence is not in the JD.",
            normalizedText: "Develop SQL pipelines.",
            category: "data",
            priority: "high",
            necessity: "required",
          },
        ],
      }),
    });

    await expect(extractor.execute(input)).rejects.toThrow(
      /not present verbatim/i,
    );
  });

  it("removes conservative semantic duplicates and preserves evidence", async () => {
    const jd = [
      "Deploy machine learning models to production.",
      "Production deployment of machine learning models is required.",
      "Monitor model reliability and collaborate with platform stakeholders.",
    ].join(" ");
    const input = createExtractorInput(jd);
    const extractor = new RealRequirementExtractor({
      model: new StaticStructuredModel({
        requirements: [
          {
            sourceText: "Deploy machine learning models to production.",
            normalizedText: "Deploy machine learning models to production.",
            category: "deployment",
            priority: "high",
            necessity: "implied",
          },
          {
            sourceText: "Production deployment of machine learning models is required.",
            normalizedText: "Production deployment of machine learning models.",
            category: "deployment",
            priority: "critical",
            necessity: "required",
          },
        ],
      }),
    });

    const result = await extractor.execute(input);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0]?.necessity).toBe("required");
    expect(result.requirements[0]?.evidence).toHaveLength(2);
  });

  it("rejects malformed structured model output", async () => {
    const extractor = new RealRequirementExtractor({
      model: new StaticStructuredModel("{not-json"),
    });

    await expect(
      extractor.execute(createExtractorInput(compoundJd)),
    ).rejects.toThrow(/malformed JSON/i);
  });

  it("keeps single-character tools such as R instead of aborting extraction", async () => {
    const jd = [
      "Data Scientist role requiring Python, R, SQL, and stakeholder collaboration.",
      "Experience with R is required.",
      "Build models and communicate findings to stakeholders about product outcomes.",
    ].join(" ");
    const result = await new RealRequirementExtractor({
      model: new RuleBasedRequirementModel(),
    }).execute(createExtractorInput(jd));

    expect(
      result.requirements.some((item) =>
        /(?:^|\b)R\b/i.test(item.normalizedText),
      ),
    ).toBe(true);
    expect(result.requirements.length).toBeGreaterThan(0);
  });

  it("skips stop-word-only normalizedText candidates without failing the run", async () => {
    const jd =
      "Collaborate with product stakeholders and communicate architecture decisions to engineering teams while delivering production services.";
    const input = createExtractorInput(jd);
    const extractor = new RealRequirementExtractor({
      model: new StaticStructuredModel({
        requirements: [
          {
            sourceText: jd,
            normalizedText: "Experience.",
            category: "technical-skill",
            priority: "high",
            necessity: "implied",
          },
          {
            sourceText: jd,
            normalizedText: "Collaborate with product stakeholders.",
            category: "collaboration",
            priority: "high",
            necessity: "implied",
          },
        ],
      }),
    });

    const result = await extractor.execute(input);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0]?.normalizedText).toMatch(/collaborate/i);
  });

  it("rejects an empty JD without fabricating requirements", async () => {
    const jobDescription = createJobDescription("") as JobDescription;
    const input = {
      context: createGenerationContext("PROFILE-001", jobDescription),
      jobDescription,
    };

    await expect(
      new RealRequirementExtractor({
        model: new RuleBasedRequirementModel(),
      }).execute(input),
    ).rejects.toThrow(/empty or too short/i);
  });

  it("keeps concurrent extraction runs isolated and immutable", async () => {
    const inputA = createExtractorInput(compoundJd);
    const inputB = createExtractorInput(
      "Senior Data Engineer role requiring scalable data pipelines, SQL, Spark, cloud infrastructure, data quality, and collaboration with analytics stakeholders.",
    );
    const snapshotA = structuredClone(inputA);
    const snapshotB = structuredClone(inputB);
    const extractor = new RealRequirementExtractor({
      model: new RuleBasedRequirementModel(),
    });

    const [resultA, resultB] = await Promise.all([
      extractor.execute(inputA),
      extractor.execute(inputB),
    ]);

    expect(resultA.context.generationId).not.toBe(resultB.context.generationId);
    expect(resultA.context.jdHash).not.toBe(resultB.context.jdHash);
    expect(resultA.requirements).not.toBe(resultB.requirements);
    expect(inputA).toEqual(snapshotA);
    expect(inputB).toEqual(snapshotB);
  });

  it("keeps React.js tool requirements grounded without collapsing to React", async () => {
    const jd = [
      "Senior Frontend Engineer.",
      "React.js (4+ years): Understanding of React.js fundamentals, hooks, and performance optimizations.",
      "Next.js experience with server-side rendering is required.",
      "Collaborate with cross-functional engineering teams on delivery quality.",
      "Develop front-end applications using React.js and TypeScript.",
      "TypeScript and RESTful APIs experience is required.",
    ].join("\n");
    const result = await new RealRequirementExtractor({
      model: new RuleBasedRequirementModel(),
    }).execute(createExtractorInput(jd));

    const reactRequirements = result.requirements.filter((item) =>
      /react/i.test(item.normalizedText),
    );
    expect(reactRequirements.length).toBeGreaterThan(0);
    expect(
      reactRequirements.every((item) => /React\.js/i.test(item.normalizedText)),
    ).toBe(true);
    expect(
      reactRequirements.some((item) =>
        /^Experience with React\.$/i.test(item.normalizedText),
      ),
    ).toBe(false);
  });

  it("grounds Terraform requirements when the JD uses terraform.io product forms", async () => {
    const jd = [
      "Senior DevOps Engineer.",
      "Experience with terraform.io is required.",
      "Hands-on terraform.io/cloud provisioning experience is preferred.",
      "Collaborate with platform and application teams on developer experience.",
      "Build CI/CD pipelines and improve Kubernetes reliability for production platforms.",
    ].join("\n");
    const result = await new RealRequirementExtractor({
      model: new RuleBasedRequirementModel(),
    }).execute(createExtractorInput(jd));

    const terraformRequirements = result.requirements.filter((item) =>
      /terraform/i.test(item.normalizedText),
    );
    expect(terraformRequirements.length).toBeGreaterThan(0);
    expect(
      terraformRequirements.some((item) =>
        /^Experience with Terraform\.$/i.test(item.normalizedText),
      ),
    ).toBe(true);
  });

  it("integrates the real extractor while downstream engines remain mocked", async () => {
    const input = createExtractorInput(compoundJd);
    const result = await createMilestone2ExperienceEngine().execute({
      ...input,
      careerHistory: [
        {
          experienceId: "EXP-001",
          companyName: "Example Company",
          startDate: "2022-01",
          endDate: "Present",
        },
      ],
    });

    expect(result.status).toBe("approved");
    expect(result.experiences[0]?.bullets.length).toBeGreaterThanOrEqual(5);
    expect(result.validation.communicationCoverage).toBe(true);
  });
});
