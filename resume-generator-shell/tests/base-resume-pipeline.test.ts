import { describe, expect, it } from "vitest";
import type { BaseResumeRecord } from "@resume/contracts";
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
import { parseBaseResumeText } from "../apps/web/lib/base-resume-parser";
import {
  matchBaseResumesToJd,
  pickBestBaseResumeMatch,
} from "../apps/web/lib/base-resume-match";
import {
  __baseResumeBulletMergeForTests,
  assemblePreservedBaseResumeTailor,
} from "../apps/web/lib/base-resume-preserve-tailor";
import { baseResumeToUserProfile } from "../apps/web/lib/base-resume-to-profile";

const SAMPLE_RESUME = `Alex Morgan
alex.morgan@example.com | +1 555 0142 | Remote
https://linkedin.com/in/alex-morgan

Professional Summary
Frontend engineer focused on React platforms, design systems, and reliable realtime UX.

Professional Experience

Senior Frontend Engineer | HP
Mar 2022 - Present
- Built React and TypeScript interfaces with Next.js and Tailwind CSS
- Collaborated with product stakeholders on delivery planning
- Improved WebSocket reliability for real-time gameplay features
- Helped with assorted UI tasks
- Worked on various frontend tickets

Frontend Engineer | Visa
Jun 2019 - Feb 2022
- Implemented RESTful API integrations and Cypress test coverage
- Optimized React performance for high-traffic checkout flows
- Delivered accessible component library updates across checkout

Education
State University
Bachelor of Science in Computer Science
Sep 2011 - Jun 2015

Skills
React, Next.js, TypeScript, Tailwind CSS, WebSockets, Cypress, Git
`;

describe("base resume extraction", () => {
  it("extracts roles and stacks from a well-structured resume", () => {
    const extracted = parseBaseResumeText(SAMPLE_RESUME);
    expect(extracted.personalInformation.fullName).toMatch(/Alex Morgan/i);
    expect(extracted.personalInformation.email).toBe("alex.morgan@example.com");
    expect(extracted.experiences.length).toBeGreaterThanOrEqual(2);
    expect(extracted.experiences[0]?.companyName).toMatch(/HP/i);
    expect(extracted.experiences[0]?.role).toMatch(/Frontend/i);
    expect(extracted.stacks.join(" ")).toMatch(/React|TypeScript|Next/i);
    expect(extracted.skills.length).toBeGreaterThan(0);
  });

  it("maps extracted resume data into a generation-ready profile", () => {
    const profile = baseResumeToUserProfile(parseBaseResumeText(SAMPLE_RESUME), {
      identityFrom: {
        fullName: "Kenny User",
        email: "kenny@example.com",
        phone: "+1 555 9999",
        location: "Austin, TX",
        linkedin: "https://linkedin.com/in/kenny",
      },
    });
    expect(profile.personalInformation.fullName).toBe("Kenny User");
    expect(profile.personalInformation.email).toBe("kenny@example.com");
    expect(profile.personalInformation.phone).toBe("+1 555 9999");
    expect(profile.personalInformation.location).toBe("Austin, TX");
    expect(profile.personalInformation.linkedin).toBe(
      "https://linkedin.com/in/kenny",
    );
    // Uploaded resume identity must not leak through.
    expect(profile.personalInformation.fullName).not.toMatch(/Alex/i);
    expect(profile.personalInformation.email).not.toBe("alex.morgan@example.com");
    expect(profile.careerHistory.length).toBeGreaterThanOrEqual(2);
    expect(profile.careerHistory[0]?.startDate).toBeTruthy();
    expect(profile.education[0]?.institution).toBeTruthy();
  });
});

describe("base resume JD matching", () => {
  it("ranks the stronger stack match first", () => {
    const frontend = parseBaseResumeText(SAMPLE_RESUME);
    const backendText = `Jordan Lee
jordan@example.com

Experience
Backend Engineer | Acme
2021 - Present
- Built Node.js and PostgreSQL services on AWS
- Deployed Docker and Kubernetes workloads

Skills
Node.js, PostgreSQL, AWS, Docker, Kubernetes
`;
    const backend = parseBaseResumeText(backendText);
    const now = new Date().toISOString();
    const records: BaseResumeRecord[] = [
      {
        id: "BR-BE",
        username: "demo",
        title: "Backend base",
        originalFilename: "backend.txt",
        mimeType: "text/plain",
        rawText: backendText,
        extracted: backend,
        isFavorite: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "BR-FE",
        username: "demo",
        title: "Frontend base",
        originalFilename: "frontend.txt",
        mimeType: "text/plain",
        rawText: SAMPLE_RESUME,
        extracted: frontend,
        isFavorite: true,
        createdAt: now,
        updatedAt: now,
      },
    ];

    const matches = matchBaseResumesToJd(
      `Senior Frontend Engineer
Build React and Next.js applications with TypeScript and Tailwind CSS.
Integrate WebSockets and collaborate with product teams.`,
      records,
    );

    expect(matches[0]?.baseResumeId).toBe("BR-FE");
    expect(pickBestBaseResumeMatch(matches)?.title).toBe("Frontend base");
    expect(matches[0]?.matchedStacks.length).toBeGreaterThan(0);
  });
});

describe("base-resume JD bullet merge rules", () => {
  it("adds 1–2 bullets to reach more than 4, or replaces poorest 2 when already above 4", () => {
    const { jdBulletBudget, mergeExperienceBullets, MIN_BULLETS_EXCLUSIVE } =
      __baseResumeBulletMergeForTests;

    expect(jdBulletBudget(3)).toBe(2); // 3 + 2 = 5
    expect(jdBulletBudget(4)).toBe(1); // 4 + 1 = 5
    expect(jdBulletBudget(5)).toBe(2); // replace mode
    expect(jdBulletBudget(6)).toBe(2);

    const strongPool = [
      {
        bulletId: "G1",
        requirementId: "R1",
        situation: "s",
        task: "t",
        action: "a",
        result: "r",
        actionVerb: "Built",
        directKeywords: [],
        supportingKeywords: [],
        outcomeKeywords: [],
        finalBullet:
          "Built React and Next.js delivery pipelines with TypeScript, cutting release defects by 28%.",
        strengthScore: 9.5,
        distinctivenessScore: 9,
        status: "approved" as const,
      },
      {
        bulletId: "G2",
        requirementId: "R2",
        situation: "s",
        task: "t",
        action: "a",
        result: "r",
        actionVerb: "Improved",
        directKeywords: [],
        supportingKeywords: [],
        outcomeKeywords: [],
        finalBullet:
          "Improved WebSocket reliability for realtime UX, sustaining 99.9% session continuity.",
        strengthScore: 9.2,
        distinctivenessScore: 8.8,
        status: "approved" as const,
      },
    ];

    const appended = mergeExperienceBullets({
      experienceId: "EXP-APPEND",
      experienceIndex: 0,
      originalTexts: [
        "Implemented RESTful API integrations and Cypress test coverage",
        "Optimized React performance for high-traffic checkout flows",
        "Delivered accessible component library updates across checkout",
      ],
      strongPool,
    });
    expect(appended.length).toBeGreaterThan(MIN_BULLETS_EXCLUSIVE);
    expect(appended.length).toBe(5);
    expect(
      appended.filter((bullet) => bullet.requirementId !== "PRESERVED-ORIGINAL").length,
    ).toBe(2);

    const replaced = mergeExperienceBullets({
      experienceId: "EXP-REPLACE",
      experienceIndex: 0,
      originalTexts: [
        "Built React and TypeScript interfaces with Next.js and Tailwind CSS",
        "Improved WebSocket reliability for real-time gameplay features",
        "Collaborated with product stakeholders on delivery planning",
        "Helped with assorted UI tasks",
        "Worked on various frontend tickets",
      ],
      strongPool,
    });
    expect(replaced.length).toBe(5);
    expect(replaced.some((bullet) => /Helped with assorted UI tasks/i.test(bullet.finalBullet))).toBe(
      false,
    );
    expect(
      replaced.some((bullet) => /Worked on various frontend tickets/i.test(bullet.finalBullet)),
    ).toBe(false);
    expect(
      replaced.filter((bullet) => bullet.requirementId !== "PRESERVED-ORIGINAL").length,
    ).toBe(2);
  });
});

describe("preserved base-resume tailor", () => {
  it("keeps original content, swaps identity, and mixes in 1–2 JD bullets per role", async () => {
    const extracted = parseBaseResumeText(SAMPLE_RESUME);
    expect(extracted.summary).toMatch(/Frontend engineer focused on React/i);

    const identityProfile = baseResumeToUserProfile(extracted, {
      profileId: "PROFILE-PRESERVE",
      identityFrom: {
        fullName: "Kenny User",
        email: "kenny@example.com",
        phone: "+1 555 9999",
        location: "Austin, TX",
      },
    });

    const orchestrator = new ResumeOrchestrator(
      {
        experience: createProductionExperienceEngine().engine,
        summary: createProductionSummaryEngine(),
        skills: createProductionSkillsEngine(),
        template: createProductionTemplateEngine(),
      },
      new ImmutableFinalResumeAssembler(),
    );

    const generated = await orchestrator.generate({
      jobDescription: createJobDescription(`Senior Frontend Engineer
Build React and Next.js applications with TypeScript and Tailwind CSS.
Integrate WebSockets and collaborate with product teams on delivery.`),
      profile: identityProfile,
      locale: "en-US",
    });

    const tailored = assemblePreservedBaseResumeTailor({
      generated,
      extracted,
      identityProfile,
    });

    const contact = tailored.document.sections.find((section) => section.id === "contact");
    const summary = tailored.document.sections.find(
      (section) => section.id === "professional-summary",
    );
    const skills = tailored.document.sections.find((section) => section.id === "skills");
    const experience = tailored.document.sections.find(
      (section) => section.id === "professional-experience",
    );
    const education = tailored.document.sections.find(
      (section) => section.id === "education",
    );

    expect(contact?.id === "contact" && contact.content.fullName).toBe("Kenny User");
    expect(contact?.id === "contact" && contact.content.email).toBe("kenny@example.com");
    expect(summary?.id === "professional-summary" && summary.content).toMatch(
      /Frontend engineer focused on React/i,
    );
    expect(skills?.id === "skills" && skills.content[0]?.skills.join(" ")).toMatch(
      /React|TypeScript/i,
    );
    expect(education?.id === "education" && education.content[0]?.institution).toMatch(
      /State University|University/i,
    );

    expect(experience?.id).toBe("professional-experience");
    if (experience?.id !== "professional-experience") {
      throw new Error("Expected professional experience section");
    }

    for (const entry of experience.content) {
      const original =
        extracted.experiences.find((item) => item.companyName === entry.companyName)
          ?.bullets ?? [];
      expect(entry.bullets.length).toBeGreaterThan(4);
      if (original.length > 4) {
        // Replace mode: same count, poorest originals dropped.
        expect(entry.bullets.length).toBe(original.length);
        expect(entry.bullets).not.toContain("Helped with assorted UI tasks");
        expect(entry.bullets).not.toContain("Worked on various frontend tickets");
      } else {
        // Append mode: keep all originals and add 1–2 JD bullets.
        for (const bullet of original) {
          expect(entry.bullets).toContain(bullet);
        }
        expect(entry.bullets.length).toBeGreaterThan(original.length);
        expect(entry.bullets.length - original.length).toBeLessThanOrEqual(2);
      }
    }

    // Uploaded identity must not appear on the tailored contact block.
    expect(JSON.stringify(contact)).not.toContain("alex.morgan@example.com");
    expect(tailored.assemblyValidation.overallStatus).toBe("approved");

    const { ProductionResumeRenderer } = await import("@resume/rendering");
    const exporter = new ProductionResumeRenderer();
    const docx = await exporter.export(tailored, "docx");
    expect(docx.validation.overallStatus).toBe("approved");
    expect(docx.byteLength).toBeGreaterThan(100);
    const pdf = await exporter.export(tailored, "pdf");
    expect(pdf.validation.overallStatus).toBe("approved");
    const txt = await exporter.export(tailored, "txt");
    expect(new TextDecoder().decode(txt.bytes)).toMatch(/Kenny User/);
    expect(new TextDecoder().decode(txt.bytes)).toMatch(
      /Built React and TypeScript interfaces/i,
    );
  }, 60_000);
});
