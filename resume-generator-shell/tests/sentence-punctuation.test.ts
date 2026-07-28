import { describe, expect, it } from "vitest";
import {
  normalizeBulletSentence,
  sentenceCount,
} from "@resume/engines";

describe("resume bullet sentence punctuation", () => {
  it("counts React.js / Next.js bullets as one sentence", () => {
    const bullet =
      "Architected front-end applications using React.js and Next.js to strengthen architectural scalability, increasing supported workload scale by 2.5x.";
    expect(sentenceCount(bullet)).toBe(1);
    expect(bullet.endsWith(".")).toBe(true);
  });

  it("does not treat common abbreviations as extra sentences", () => {
    expect(
      sentenceCount(
        "Deployed services for Acme Inc. partners through CI/CD, improving release speed by 18%.",
      ),
    ).toBe(1);
    expect(
      sentenceCount(
        "Implemented auth for the U.S. market using Node.js, increasing adoption by 12%.",
      ),
    ).toBe(1);
    expect(
      sentenceCount(
        "Configured monitoring (e.g. Prometheus) for production reliability, reducing MTTR by 25%.",
      ),
    ).toBe(1);
  });

  it("still rejects true multi-sentence bullets", () => {
    expect(
      sentenceCount(
        "Built scalable APIs with Node.js. Improved latency by 20%.",
      ),
    ).toBe(2);
  });

  it("collapses leaked interior sentence breaks during normalization", () => {
    const normalized = normalizeBulletSentence(
      "architected machine learning models. using Docker and Kubernetes, reducing deployment cycle time by 42%",
    );
    expect(sentenceCount(normalized)).toBe(1);
    expect(normalized.endsWith(".")).toBe(true);
    expect(normalized).not.toMatch(/\.\s+[a-z]/);
    expect(normalized.toLowerCase()).toContain("using docker");
  });

  it("preserves dotted tech tokens after normalization", () => {
    const normalized = normalizeBulletSentence(
      "architected front-end applications using React.js and Next.js, increasing supported workload scale by 2.5x",
    );
    expect(normalized).toContain("React.js");
    expect(normalized).toContain("Next.js");
    expect(sentenceCount(normalized)).toBe(1);
  });
});
