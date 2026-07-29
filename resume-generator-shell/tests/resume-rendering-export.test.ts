import { describe, expect, it } from "vitest";
import type { UserProfile } from "@resume/contracts";
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
import {
  ProductionResumeRenderer,
  ResumeExportIntegrityValidator,
  createCanonicalResume,
} from "@resume/rendering";

const JD = `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments.
Implement model monitoring, improve inference performance, and automate CI/CD workflows.
Collaborate with product, data, and platform teams to translate business requirements into technical solutions.
Mentor engineers and communicate architecture decisions to technical and non-technical stakeholders.
Experience with Python, Docker, Kubernetes, MLflow, AWS, and distributed systems is required.`;

function profile(profileId: string): UserProfile {
  return {
    profileId,
    personalInformation: {
      fullName: "Alex Morgan",
      email: "alex@example.com",
      phone: "+1 555 0100",
      location: "Remote",
      linkedin: "https://www.linkedin.com/in/alex-morgan",
    },
    careerHistory: [
      {
        experienceId: "EXP-001",
        companyName: "Example AI Company",
        startDate: "2022-01",
        endDate: "Present",
      },
    ],
    education: [
      {
        educationId: "EDU-001",
        institution: "Example University",
        degree: "Bachelor of Science",
        field: "Computer Science",
        startDate: "2014-09",
        endDate: "2018-06",
      },
    ],
  };
}

function orchestrator(): ResumeOrchestrator {
  return new ResumeOrchestrator(
    {
      experience: createProductionExperienceEngine().engine,
      summary: createProductionSummaryEngine(),
      skills: createProductionSkillsEngine(),
      template: createProductionTemplateEngine(),
    },
    new ImmutableFinalResumeAssembler(),
  );
}

async function resume(profileId = "PROFILE-RENDER") {
  return orchestrator().generate({
    jobDescription: createJobDescription(JD),
    profile: profile(profileId),
    locale: "en-US",
  });
}

describe("resume rendering and export integrity", () => {
  it("exports approved TXT, HTML, DOCX, and PDF artifacts", async () => {
    const data = await resume();
    const renderer = new ProductionResumeRenderer();

    for (const format of ["txt", "html", "docx", "pdf"] as const) {
      const artifact = await renderer.export(data, format);
      expect(artifact.validation.overallStatus).toBe("approved");
      expect(artifact.byteLength).toBeGreaterThan(100);
      expect(artifact.sourceDocumentFingerprint).toBe(data.document.contentFingerprint);
      expect(artifact.filename.endsWith(`.${format}`)).toBe(true);
    }
  });

  it("preserves every source token in exact order", async () => {
    const data = await resume("PROFILE-TOKENS");
    const canonical = createCanonicalResume(data);
    const artifact = await new ProductionResumeRenderer().export(data, "docx");

    expect(artifact.emittedTokens).toEqual(canonical.tokens);
    expect(artifact.validation.sourceTokensPreserved).toBe(true);
    expect(artifact.validation.sourceTokenOrderPreserved).toBe(true);
    expect(artifact.validation.noUnexpectedTokens).toBe(true);
  });

  it("creates recognizable DOCX and PDF file signatures", async () => {
    const data = await resume("PROFILE-SIGNATURE");
    const renderer = new ProductionResumeRenderer();
    const docx = await renderer.export(data, "docx");
    const pdf = await renderer.export(data, "pdf");

    expect(Array.from(docx.bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(new TextDecoder().decode(pdf.bytes.slice(0, 8))).toBe("%PDF-1.7");
  });

  it("renders education periods as a first-class date line like experience", async () => {
    const data = await resume("PROFILE-EDU-DATES");
    const canonical = createCanonicalResume(data);
    const educationLines = canonical.lines.filter(
      (line) => line.sectionId === "education",
    );

    expect(educationLines.map((line) => line.kind)).toEqual([
      "section-heading",
      "education",
      "date",
    ]);
    expect(educationLines[1]?.text).toBe(
      "Bachelor of Science in Computer Science | Example University",
    );
    expect(educationLines[2]?.text).toBe("2014-09 - 2018-06");
    expect(canonical.plainText).toContain("2014-09 - 2018-06");

    const html = await new ProductionResumeRenderer().export(data, "html");
    const htmlText = new TextDecoder().decode(html.bytes);
    expect(htmlText).toContain("2014-09 - 2018-06");
    expect(htmlText).toMatch(
      /Bachelor of Science in Computer Science \| Example University[\s\S]*2014-09 - 2018-06/,
    );
  });

  it("rejects a renderer trace that omits source content", async () => {
    const data = await resume("PROFILE-REJECT");
    const canonical = createCanonicalResume(data);
    const validation = new ResumeExportIntegrityValidator().validate(
      data,
      {
        format: "txt",
        bytes: new TextEncoder().encode("incomplete"),
        emittedTokens: canonical.tokens.slice(0, -1),
        atsSafeStructure: true,
        selectableTextExpected: true,
        warnings: [],
      },
      "text/plain; charset=utf-8",
    );

    expect(validation.overallStatus).toBe("rejected");
    expect(validation.sourceTokensPreserved).toBe(false);
    expect(validation.sourceTokenOrderPreserved).toBe(false);
  });

  it("rejects a final document changed after assembly", async () => {
    const data = await resume("PROFILE-TAMPER");
    const altered = structuredClone(data);
    const summarySection = altered.document.sections.find(
      (section) => section.id === "professional-summary",
    );
    if (!summarySection || summarySection.id !== "professional-summary") {
      throw new Error("Summary section missing from test fixture.");
    }
    summarySection.content = `${summarySection.content} Altered after assembly.`;

    await expect(new ProductionResumeRenderer().export(altered, "pdf")).rejects.toThrow(
      /document changed after fingerprinting/,
    );
  });

  it("keeps concurrent exports isolated by source fingerprint and checksum", async () => {
    const [first, second] = await Promise.all([
      resume("PROFILE-EXPORT-A"),
      resume("PROFILE-EXPORT-B"),
    ]);
    const renderer = new ProductionResumeRenderer();
    const [firstArtifact, secondArtifact] = await Promise.all([
      renderer.export(first, "pdf"),
      renderer.export(second, "pdf"),
    ]);

    expect(firstArtifact.sourceDocumentFingerprint).not.toBe(
      secondArtifact.sourceDocumentFingerprint,
    );
    expect(firstArtifact.artifactChecksum).not.toBe(secondArtifact.artifactChecksum);
  });
});
