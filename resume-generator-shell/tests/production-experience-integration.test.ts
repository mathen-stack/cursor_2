import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ExperienceGenerationService,
  InMemoryExperienceGenerationRunStore,
  JsonFileExperienceGenerationRunStore,
  SilentGenerationLogger,
  type ExperienceGenerationRunStore,
} from "@resume/core";
import { createProductionExperienceEngine } from "@resume/engines";

const JD_A = `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments.
Implement model monitoring and improve inference performance.
Collaborate with product and platform teams and mentor engineers.
Python, Docker, Kubernetes, MLflow, and AWS experience is required.`;

const JD_B = `Senior Data Engineer
Design batch and streaming data pipelines and improve data quality.
Build cloud data platforms using Python, SQL, Spark, Airflow, and Kafka.
Partner with analytics stakeholders and document technical decisions.
Experience delivering reliable production systems is required.`;

function request(jobDescriptionText: string, suffix: string) {
  return {
    profileId: `PROFILE-${suffix}`,
    jobDescriptionText,
    locale: "en-US",
    careerHistory: [
      {
        experienceId: "EXP-001",
        companyName: `Company ${suffix}`,
        startDate: "2022-01",
        endDate: "Present",
      },
    ],
  };
}

function service(
  store: ExperienceGenerationRunStore = new InMemoryExperienceGenerationRunStore(),
) {
  const bundle = createProductionExperienceEngine({
    modelProvider: { provider: "rule-based" },
  });
  return new ExperienceGenerationService({
    engine: bundle.engine,
    providerName: bundle.providerName,
    store,
    logger: new SilentGenerationLogger(),
  });
}

describe("production Experience integration", () => {
  it("generates, persists, lists, and retrieves an isolated run", async () => {
    const generator = service();
    const run = await generator.generate(request(JD_A, "A"));

    expect(["completed", "rejected"]).toContain(run.status);
    expect(run.output?.experiences).toHaveLength(1);
    expect(run.output?.experiences[0]?.bullets.length).toBeGreaterThanOrEqual(5);
    expect(run.telemetry.bulletCount).toBeGreaterThanOrEqual(5);

    const fetched = await generator.getRun(run.context.generationId);
    expect(fetched?.context.jdHash).toBe(run.context.jdHash);

    const history = await generator.listRuns();
    expect(history.total).toBe(1);
    expect(history.runs[0]?.generationId).toBe(run.context.generationId);
  });

  it("does not leak state between simultaneous JDs", async () => {
    const generator = service();
    const [runA, runB] = await Promise.all([
      generator.generate(request(JD_A, "A")),
      generator.generate(request(JD_B, "B")),
    ]);

    expect(runA.context.generationId).not.toBe(runB.context.generationId);
    expect(runA.context.jdHash).not.toBe(runB.context.jdHash);
    expect(runA.output?.experiences[0]?.companyName).toBe("Company A");
    expect(runB.output?.experiences[0]?.companyName).toBe("Company B");

    const bulletTextA = runA.output?.experiences[0]?.bullets
      .map((bullet) => bullet.finalBullet)
      .join(" ");
    const bulletTextB = runB.output?.experiences[0]?.bullets
      .map((bullet) => bullet.finalBullet)
      .join(" ");
    expect(bulletTextA).not.toBe(bulletTextB);
  });

  it("persists generation history in an atomic JSON store", async () => {
    const directory = await mkdtemp(join(tmpdir(), "resume-runs-"));
    const filePath = join(directory, "runs.json");
    const generator = service(new JsonFileExperienceGenerationRunStore(filePath));
    const run = await generator.generate(request(JD_A, "FILE"));

    const restoredStore = new JsonFileExperienceGenerationRunStore(filePath);
    const restored = await restoredStore.get(run.context.generationId);
    expect(restored?.context.generationId).toBe(run.context.generationId);

    const raw = JSON.parse(await readFile(filePath, "utf8")) as {
      version: number;
      records: Record<string, unknown>;
    };
    expect(raw.version).toBe(1);
    expect(raw.records[run.context.generationId]).toBeDefined();
  });
});
