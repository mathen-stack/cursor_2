import { describe, expect, it } from "vitest";
import { createGenerationContext, createJobDescription } from "@resume/core";
import {
  createProductionExperienceEngine,
  isJdMarketingOrMetaScope,
  normalizeBulletSentence,
  stripIntraBulletRepetition,
  substantiveKeyword,
} from "@resume/engines";

const REFERENCE_DATE = new Date("2026-07-27T00:00:00.000Z");

describe("repetition hardening", () => {
  it("removes within-bullet verb and measure echoes", () => {
    expect(
      stripIntraBulletRepetition(
        "Coordinated stakeholder alignment and delivery coordination through dependency coordination",
      ),
    ).not.toMatch(/\bcoordination\b/i);
    expect(
      stripIntraBulletRepetition(
        "Automated stakeholder alignment and delivery coordination through shared roadmap reviews",
      ),
    ).toMatch(/cross-functional/i);

    expect(
      normalizeBulletSentence(
        "Accelerated backend services, increasing throughput by 2.6x and improving request throughput",
      ),
    ).not.toMatch(/throughput.*throughput/i);
  });

  it("rejects JD marketing fragments as action scopes", () => {
    expect(
      isJdMarketingOrMetaScope("this is a freelance role for a tandem"),
    ).toBe(true);
    expect(
      isJdMarketingOrMetaScope(
        "this part-time remote opportunity is ideal for technical",
      ),
    ).toBe(true);
    expect(
      isJdMarketingOrMetaScope(
        "the mindrift platform connects specialists with AI projects",
      ),
    ).toBe(true);
    expect(isJdMarketingOrMetaScope("machine learning models")).toBe(false);
  });

  it("rewrites soft-skill buzzphrases out of generated bullet text", () => {
    expect(
      normalizeBulletSentence(
        "Led strong verbal and written communication skills with product stakeholders, increasing delivery alignment by 18%",
      ),
    ).not.toMatch(/\bcommunication skills\b/i);
    expect(
      normalizeBulletSentence(
        "Facilitated communication skills across engineering partners, reducing handoff delays by 22%",
      ),
    ).toMatch(/stakeholder communication/i);
  });

  it("strips internal bullet identifiers and experience-with prefixes from visible text", () => {
    expect(
      normalizeBulletSentence(
        "Instrumented incident response and observability for exp-002-b-001, maintaining 99.91% service availability.",
      ),
    ).not.toMatch(/\bexp-\d+-b-\d+\b/i);
    expect(
      substantiveKeyword("Experience with AWS"),
    ).toBe("AWS");
    expect(
      substantiveKeyword("collaborate with product stakeholders"),
    ).toBe("product stakeholders");
    expect(
      substantiveKeyword("collaborate with teams"),
    ).toMatch(/collaboration with teams|collaborate with teams/i);
    expect(
      stripIntraBulletRepetition(
        "Mentored mentoring and roadmap planning, increasing supported workload scale by 22%",
      ),
    ).not.toMatch(/\bMentor\w*\b.*\bmentoring\b/i);
  });

  it("does not repeat feature-adoption metrics or cloned stakeholder scopes across roles", async () => {
    const jobDescription = createJobDescription(
      `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments.
Implement model monitoring, improve inference performance, and automate CI/CD workflows.
Collaborate with product, data, and platform teams to translate business requirements into technical solutions.
Mentor engineers and communicate architecture decisions to technical and non-technical stakeholders.
Experience with Python, Docker, Kubernetes, MLflow, AWS, and distributed systems is required.`,
    );
    const result = await createProductionExperienceEngine({
      role: { referenceDate: REFERENCE_DATE },
    }).engine.execute({
      context: createGenerationContext("PROFILE-REPETITION", jobDescription),
      jobDescription,
      careerHistory: [
        {
          experienceId: "EXP-001",
          companyName: "Example AI Company",
          startDate: "2022-01",
          endDate: "Present",
        },
        {
          experienceId: "EXP-002",
          companyName: "Example Software Company",
          startDate: "2018-03",
          endDate: "2021-12",
        },
        {
          experienceId: "EXP-003",
          companyName: "Company",
          startDate: "2017-08",
          endDate: "2018-02",
        },
      ],
    });

    expect(result.status).toBe("approved");
    const bullets = result.experiences.flatMap((experience) =>
      experience.bullets.map((bullet) => bullet.finalBullet),
    );

    const featureAdoption = bullets.filter((bullet) =>
      /feature adoption/i.test(bullet),
    );
    expect(featureAdoption.length).toBeLessThanOrEqual(1);

    const stakeholderScope = bullets.filter((bullet) =>
      /stakeholder alignment and delivery coordination/i.test(bullet),
    );
    expect(stakeholderScope.length).toBeLessThanOrEqual(1);

    const deliveryPlanningScope = bullets.filter((bullet) =>
      /cross-functional collaboration and delivery planning(?:\s+required)?/i.test(
        bullet,
      ),
    );
    expect(deliveryPlanningScope.length).toBeLessThanOrEqual(1);

    // No 4+ word action-object phrase should be cloned across bullets.
    const actionScopes = bullets.map((bullet) => {
      const withoutVerb = bullet.replace(/^[A-Za-z-]+\s+/, "");
      return withoutVerb
        .replace(/\s+(?:using|through|,)\s+.+$/i, "")
        .toLowerCase()
        .trim();
    });
    const multiWordScopes = actionScopes.filter(
      (scope) => scope.split(/\s+/).length >= 4,
    );
    expect(new Set(multiWordScopes).size).toBe(multiWordScopes.length);

    for (const bullet of bullets) {
      expect(bullet).not.toMatch(/\bCoordinat\w*\b.*\bcoordination\b/i);
      expect(bullet).not.toMatch(/\bMentor\w*\b.*\bmentoring\b/i);
      expect(bullet).not.toMatch(/\bthroughput\b.*\bthroughput\b/i);
      expect(bullet).not.toMatch(/\bdelivery planning required\b/i);
      expect(bullet).not.toMatch(/\bdynamic\b/i);
      expect(bullet).not.toMatch(/\bproactive\b/i);
      expect(bullet).not.toMatch(/\b(?:verbal and written\s+)?communication skills\b/i);
      expect(bullet).not.toMatch(/\bexp-\d+-b-\d+\b/i);
      expect(bullet).not.toMatch(/\bExperience with\b/i);
      expect(bullet).not.toMatch(/\bLed collaborate\b/i);
    }

    const percentAmounts = bullets
      .flatMap((bullet) => [...bullet.matchAll(/\b(\d+(?:\.\d+)?)%/g)].map((match) => match[1]))
      .filter((value): value is string => Boolean(value));
    expect(new Set(percentAmounts).size).toBe(percentAmounts.length);

    const deliveringStems = bullets.filter((bullet) =>
      /delivering a \d+(?:\.\d+)?% reduction/i.test(bullet),
    );
    const deliveringValues = deliveringStems.map(
      (bullet) => bullet.match(/delivering a (\d+(?:\.\d+)?%) reduction/i)?.[1],
    );
    expect(new Set(deliveringValues).size).toBe(deliveringValues.length);
  });
});
