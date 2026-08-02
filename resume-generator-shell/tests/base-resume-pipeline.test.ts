import { describe, expect, it } from "vitest";
import { parseBaseResumeText } from "../apps/web/lib/base-resume-parser";
import {
  matchBaseResumesToJd,
  pickBestBaseResumeMatch,
} from "../apps/web/lib/base-resume-match";
import { baseResumeToUserProfile } from "../apps/web/lib/base-resume-to-profile";
import type { BaseResumeRecord } from "@resume/contracts";

const SAMPLE_RESUME = `Alex Morgan
alex.morgan@example.com | +1 555 0142 | Remote
https://linkedin.com/in/alex-morgan

Professional Experience

Senior Frontend Engineer | HP
Mar 2022 - Present
- Built React and TypeScript interfaces with Next.js and Tailwind CSS
- Collaborated with product stakeholders on delivery planning
- Improved WebSocket reliability for real-time gameplay features

Frontend Engineer | Visa
Jun 2019 - Feb 2022
- Implemented RESTful API integrations and Cypress test coverage
- Optimized React performance for high-traffic checkout flows

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
