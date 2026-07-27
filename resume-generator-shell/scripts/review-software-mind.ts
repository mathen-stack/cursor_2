import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  ImmutableFinalResumeAssembler,
  ResumeOrchestrator,
  createJobDescription,
} from "@resume/core";
import {
  createProductionExperienceEngine,
  createProductionSkillsEngine,
  createProductionSummaryEngine,
  createProductionTemplateEngine,
} from "@resume/engines";
import { ProductionResumeRenderer } from "@resume/rendering";
import {
  SOFTWARE_MIND_REQUIRED_SKILLS,
  SOFTWARE_MIND_SENIOR_FRONTEND_JD,
  softwareMindCareerProfile,
} from "../tests/fixtures/software-mind-senior-frontend";

const REFERENCE_DATE = new Date("2026-07-27T00:00:00.000Z");

async function main(): Promise<void> {
  const profile = softwareMindCareerProfile("PROFILE-SOFTWARE-MIND-REVIEW");
  const jobDescription = createJobDescription(SOFTWARE_MIND_SENIOR_FRONTEND_JD);
  const orchestrator = new ResumeOrchestrator(
    {
      experience: createProductionExperienceEngine({
        role: { referenceDate: REFERENCE_DATE },
      }).engine,
      summary: createProductionSummaryEngine({
        experienceYears: { referenceDate: REFERENCE_DATE },
      }),
      skills: createProductionSkillsEngine(),
      template: createProductionTemplateEngine(),
    },
    new ImmutableFinalResumeAssembler(),
  );

  const resume = await orchestrator.generate({
    jobDescription,
    profile,
    locale: "en-US",
  });

  const outDirs = [
    resolve("artifacts/software-mind-regression"),
    "/opt/cursor/artifacts/software-mind-regression",
  ];
  for (const outDir of outDirs) {
    mkdirSync(outDir, { recursive: true });
  }

  const lines: string[] = [];
  lines.push(`generationId: ${resume.context.generationId}`);
  lines.push(`assembly: ${resume.assemblyValidation.overallStatus}`);
  lines.push(`experience: ${resume.experience.status}`);
  lines.push(`summary: ${resume.summary.status}`);
  lines.push(`skills: ${resume.skills.status}`);
  lines.push(
    `readiness: internal=${resume.readiness?.internalScore ?? "n/a"} ready=${resume.readiness?.readyForExternalTest ?? "n/a"}`,
  );
  lines.push("");
  lines.push("=== SUMMARY ===");
  lines.push(resume.summary.summary);
  lines.push("");
  lines.push("=== SKILLS ===");
  for (const category of resume.skills.categories) {
    lines.push(`${category.name}: ${category.skills.join(", ")}`);
  }
  lines.push("");
  lines.push("Required skill coverage:");
  const skillNames = new Set(resume.skills.skills.map((skill) => skill.name));
  for (const required of SOFTWARE_MIND_REQUIRED_SKILLS) {
    lines.push(`- ${required}: ${skillNames.has(required) ? "PRESENT" : "MISSING"}`);
  }
  lines.push("");
  lines.push("=== EXPERIENCE ===");
  for (const experience of resume.experience.experiences) {
    lines.push(
      `${experience.companyName} | ${experience.assignedRole} | ${experience.startDate} - ${experience.endDate} | bullets=${experience.bullets.length}`,
    );
    for (const bullet of experience.bullets) {
      lines.push(`- ${bullet.finalBullet}`);
    }
    lines.push("");
  }

  const renderer = new ProductionResumeRenderer();
  for (const format of ["txt", "html", "docx", "pdf"] as const) {
    const artifact = await renderer.export(resume, format);
    for (const outDir of outDirs) {
      writeFileSync(resolve(outDir, artifact.filename), artifact.bytes);
    }
    lines.push(`export ${format}: ${artifact.validation.overallStatus} bytes=${artifact.byteLength}`);
  }

  for (const outDir of outDirs) {
    writeFileSync(resolve(outDir, "resume-review.txt"), lines.join("\n"), "utf8");
  }
  console.log(lines.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
