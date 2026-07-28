import { describe, expect, it } from "vitest";
import { createGenerationContext, createJobDescription } from "@resume/core";
import {
  actionScopeFingerprint,
  createProductionExperienceEngine,
  ensureMinimumBulletWords,
  ensureUniqueActionScopeBullet,
  extractActionObjectScope,
  isBrokenBulletWording,
  isJdMarketingOrMetaScope,
  normalizeBulletSentence,
  repairBrokenBulletWording,
  stripIntraBulletRepetition,
  substantiveKeyword,
} from "@resume/engines";

const REFERENCE_DATE = new Date("2026-07-27T00:00:00.000Z");

describe("repetition hardening", () => {
  it("scrubs filler and self-congratulatory wording from bullets", () => {
    expect(
      normalizeBulletSentence(
        "Successfully delivered various platform upgrades very effectively, reducing incidents by 24%.",
      ),
    ).not.toMatch(/\b(?:successfully|various|very|effectively|really|numerous)\b/i);
  });

  it("pads bullets that become too short after covering-clause repair", () => {
    const repaired = repairBrokenBulletWording(
      "Mentored engineers covering capability building, increasing supported workload scale by 22%.",
    );
    expect(repaired.split(/\s+/).length).toBeLessThan(16);
    const padded = ensureMinimumBulletWords(repaired, 16, "EXP-003-B-001");
    expect(padded.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(16);
    expect(padded).not.toMatch(/\b(?:successfully|effectively|various|covering)\b/i);
    expect(isBrokenBulletWording(padded)).toBe(false);
  });

  it("uniqueify preserves minimum length while rewriting cloned scopes", () => {
    const used = new Set<string>();
    const first = ensureUniqueActionScopeBullet({
      finalBullet:
        "Stabilized security mindset through least-privilege access, maintaining 99.94% availability.",
      actionVerb: "Stabilized",
      bulletId: "EXP-001-B-006",
      usedScopeKeys: used,
      minimumWords: 16,
    });
    const second = ensureUniqueActionScopeBullet({
      finalBullet:
        "Governed security mindset through penetration testing, increasing control coverage by 94%.",
      actionVerb: "Governed",
      bulletId: "EXP-003-B-001",
      usedScopeKeys: used,
      minimumWords: 16,
    });
    expect(first.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(16);
    expect(second.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(16);
    expect(
      actionScopeFingerprint(extractActionObjectScope(first, "Stabilized")),
    ).not.toBe(actionScopeFingerprint(extractActionObjectScope(second, "Governed")));
  });

  it("rewrites cloned multi-word action scopes to unique fingerprints", () => {
    const used = new Set<string>();
    const first = ensureUniqueActionScopeBullet({
      finalBullet:
        "Delivered platform reliability improvements through Terraform, reducing incidents by 24%.",
      actionVerb: "Delivered",
      bulletId: "EXP-001-B-001",
      usedScopeKeys: used,
    });
    const second = ensureUniqueActionScopeBullet({
      finalBullet:
        "Delivered platform reliability improvements through Kubernetes, reducing downtime by 18%.",
      actionVerb: "Delivered",
      bulletId: "EXP-002-B-001",
      usedScopeKeys: used,
    });
    const third = ensureUniqueActionScopeBullet({
      finalBullet:
        "Delivered platform reliability improvements through Prometheus, reducing alerts by 21%.",
      actionVerb: "Delivered",
      bulletId: "EXP-003-B-001",
      usedScopeKeys: used,
    });

    const keys = [first, second, third].map((bullet) =>
      actionScopeFingerprint(extractActionObjectScope(bullet, "Delivered")),
    );
    expect(new Set(keys).size).toBe(3);
    expect(second).not.toBe(first);
    expect(third).not.toBe(first);
    expect(third).not.toBe(second);
  });

  it("uniqueifies short two-word action scopes like security mindset", () => {
    const used = new Set<string>();
    const first = ensureUniqueActionScopeBullet({
      finalBullet:
        "Stabilized security mindset through least-privilege access, maintaining 99.94% availability.",
      actionVerb: "Stabilized",
      bulletId: "EXP-001-B-006",
      usedScopeKeys: used,
    });
    const second = ensureUniqueActionScopeBullet({
      finalBullet:
        "Governed security mindset through penetration testing, increasing control coverage by 94%.",
      actionVerb: "Governed",
      bulletId: "EXP-003-B-001",
      usedScopeKeys: used,
    });
    const third = ensureUniqueActionScopeBullet({
      finalBullet:
        "Automated security mindset through remediation workflows, reducing manual effort by 43%.",
      actionVerb: "Automated",
      bulletId: "EXP-003-B-004",
      usedScopeKeys: used,
    });
    const keys = [
      actionScopeFingerprint(extractActionObjectScope(first, "Stabilized")),
      actionScopeFingerprint(extractActionObjectScope(second, "Governed")),
      actionScopeFingerprint(extractActionObjectScope(third, "Automated")),
    ];
    expect(new Set(keys).size).toBe(3);
    expect(
      [first, second, third].filter((bullet) => {
        const scope = extractActionObjectScope(
          bullet,
          bullet.split(/\s+/)[0]!,
        );
        return /^security mindset$/i.test(scope);
      }).length,
    ).toBe(1);
  });

  it("approves three-career Platform Engineer generation without action-scope or filler rejects", async () => {
    const jobDescription = createJobDescription(
      `Platform Engineer
Standardize market launches — build repeatable infrastructure provisioning so new markets can launch quickly.
Design scalable cloud platforms on AWS and Kubernetes.
Launch CI/CD pipelines with Terraform.
Secure harden security posture with cloud security posture management.
Accelerate inference performance and reduce latency.
Instrument monitoring with Prometheus.
Orchestrate security mindset — experience with access control best practices through penetration testing.
Collaborate with product and engineering stakeholders.
Lead technical strategy.`,
    );
    const result = await createProductionExperienceEngine({
      role: { referenceDate: REFERENCE_DATE },
    }).engine.execute({
      context: createGenerationContext("PROFILE-THREE-CAREER-REP", jobDescription),
      jobDescription,
      careerHistory: [
        {
          experienceId: "EXP-001",
          companyName: "Example Software Company",
          startDate: "2018-03",
          endDate: "2021-12",
        },
        {
          experienceId: "EXP-002",
          companyName: "Company",
          startDate: "2017-08",
          endDate: "2018-02",
        },
        {
          experienceId: "EXP-003",
          companyName: "Prior Labs",
          startDate: "2015-01",
          endDate: "2017-07",
        },
      ],
    });

    expect(result.status).toBe("approved");
    expect(
      result.validation.issues.filter(
        (issue) =>
          issue.issueCode === "action-scope-repetition" &&
          issue.severity === "error",
      ),
    ).toEqual([]);
    expect(
      result.validation.diagnostics.filter((item) =>
        item.errors.some((error) => /filler|self-congratulatory/i.test(error)),
      ),
    ).toEqual([]);

    const scopes = result.experiences.flatMap((experience) =>
      experience.bullets
        .map((bullet) => {
          const scope = extractActionObjectScope(
            bullet.finalBullet,
            bullet.actionVerb,
          );
          if (scope.split(/\s+/).filter(Boolean).length < 2) {
            return null;
          }
          return actionScopeFingerprint(scope);
        })
        .filter((scope): scope is string => Boolean(scope)),
    );
    expect(new Set(scopes).size).toBe(scopes.length);

    const exactSecurityMindset = result.experiences.flatMap((experience) =>
      experience.bullets.filter((bullet) => {
        const scope = extractActionObjectScope(
          bullet.finalBullet,
          bullet.actionVerb,
        );
        return /^security mindset$/i.test(scope);
      }),
    );
    expect(exactSecurityMindset).toHaveLength(1);
  });

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
    expect(
      isJdMarketingOrMetaScope("✅ you'd rather have real ownership"),
    ).toBe(true);
    expect(
      isJdMarketingOrMetaScope("bonus points if you've shipped production APIs"),
    ).toBe(true);
    expect(
      isJdMarketingOrMetaScope("you'd report straight to the founder"),
    ).toBe(true);
    expect(isJdMarketingOrMetaScope("machine learning models")).toBe(false);
  });

  it("scrubs emoji and hiring meta copy out of visible resume bullets", () => {
    expect(
      normalizeBulletSentence(
        "Improved ✅ you'd rather have real ownership effectiveness, reducing manual processing by 22%.",
      ),
    ).not.toMatch(/✅|you'd rather|real ownership effectiveness/i);
    expect(
      normalizeBulletSentence(
        "Coordinated stakeholder communication covering you'd report straight to the four, reducing handoff delays by 18%.",
      ),
    ).not.toMatch(/you'd report|straight to the four/i);
    expect(
      normalizeBulletSentence(
        "Standardized ✅ bonus points if you've reducing defect rate by 34%.",
      ),
    ).not.toMatch(/✅|bonus points|if you've/i);
    expect(
      normalizeBulletSentence(
        "Standardized ✅ bonus points if you've reducing defect rate by 34%.",
      ),
    ).toMatch(/reducing defect rate by 34%/i);
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

  it("repairs broken wording instead of failing composition", () => {
    const broken =
      "Implemented standardize market launches — build repeatable infrastructure provisioning so new using go through delivery planning covering repeatable infrastructure provisioning so new markets can to strengthen integration reliability, reducing manual processing effort by 29%.";
    const repaired = repairBrokenBulletWording(broken);
    expect(repaired).not.toMatch(/standardize|—|using go through|covering repeatable|markets can to/i);
    expect(isBrokenBulletWording(repaired)).toBe(false);
    expect(repaired).toMatch(/^Implemented\b/);
    expect(repaired).toMatch(/29%/);
  });

  it("scrubs imperative echoes, em-dash JD glue, and duplicated scopes from bullets", () => {
    expect(
      normalizeBulletSentence(
        "Implemented standardize market launches — build repeatable infrastructure provisioning so new using go through delivery planning covering repeatable infrastructure provisioning so new markets can to strengthen integration reliability, reducing manual processing effort by 29%.",
      ),
    ).not.toMatch(
      /standardize|—|using go through|covering repeatable|markets can to|so new/i,
    );
    expect(
      normalizeBulletSentence(
        "Secured harden security posture with cloud security posture through access controls, reducing security findings by 38%.",
      ),
    ).not.toMatch(/\bharden\b|security posture with cloud security posture/i);
    expect(
      normalizeBulletSentence(
        "Accelerated accelerate inference performance and reduce latency through profiling, reducing latency by 42%.",
      ),
    ).not.toMatch(/\bAccelerated accelerate\b|\band reduce\b/i);
    expect(
      normalizeBulletSentence(
        "Stabilized orchestrate security mindset — experience with access control best through penetration testing, delivering a 28% reduction in incident detection time.",
      ),
    ).not.toMatch(/\borchestrate\b|experience with|best through|—/i);
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

  it("never ships the Platform Engineer screenshot repetition failures", async () => {
    const jobDescription = createJobDescription(
      `Platform Engineer
Standardize market launches — build repeatable infrastructure provisioning so new markets can launch quickly.
Design scalable cloud platforms on AWS and Kubernetes.
Launch CI/CD pipelines with Terraform.
Secure harden security posture with cloud security posture management.
Accelerate inference performance and reduce latency.
Instrument monitoring with Prometheus.
Orchestrate security mindset — experience with access control best practices through penetration testing.
Collaborate with product and engineering stakeholders.
Lead technical strategy.`,
    );
    const result = await createProductionExperienceEngine({
      role: { referenceDate: REFERENCE_DATE },
    }).engine.execute({
      context: createGenerationContext("PROFILE-SCREENSHOT-REP", jobDescription),
      jobDescription,
      careerHistory: [
        {
          experienceId: "EXP-001",
          companyName: "Example Software Company",
          startDate: "2018-03",
          endDate: "2021-12",
        },
        {
          experienceId: "EXP-002",
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

    for (const bullet of bullets) {
      expect(bullet).not.toMatch(
        /\b(?:Implemented standardize|Secured harden|Accelerated accelerate|Stabilized orchestrate)\b/i,
      );
      expect(bullet).not.toMatch(/[–—]/);
      expect(bullet).not.toMatch(
        /\b(?:using go through|can to|so new markets?|experience with|and'?re in the middle)\b/i,
      );
      expect(bullet).not.toMatch(
        /repeatable infrastructure provisioning[\s\S]*repeatable infrastructure provisioning/i,
      );
      expect(bullet).not.toMatch(
        /stronger delivery outcomes for product and engineering stakeholders/i,
      );
    }

    const endingCounts = new Map<string, number>();
    for (const bullet of bullets) {
      const ending = bullet
        .toLocaleLowerCase()
        .match(
          /,\s*((?:enabling|while|that improved|and strengthening|while reinforcing|while advancing|while strengthening|while supporting)\s+.+)\.?$/,
        )?.[1];
      if (!ending) continue;
      endingCounts.set(ending, (endingCounts.get(ending) ?? 0) + 1);
    }
    for (const [ending, count] of endingCounts) {
      expect({ ending, count }).toEqual({ ending, count: 1 });
    }
  });
});
