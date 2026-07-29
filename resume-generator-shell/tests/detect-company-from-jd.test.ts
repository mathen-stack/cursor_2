import { describe, expect, it } from "vitest";
import {
  detectCompanyNameFromJd,
  detectRoleFromJd,
  formatJdResultHeadline,
} from "../apps/web/app/lib/detect-company-from-jd";
import { SOFTWARE_MIND_SENIOR_FRONTEND_JD } from "./fixtures/software-mind-senior-frontend";

describe("detectCompanyNameFromJd", () => {
  it("reads an explicit Company label", () => {
    const jd = `Senior Backend Engineer
Company: Acme Robotics
Build reliable APIs with TypeScript and PostgreSQL for production systems.`;
    expect(detectCompanyNameFromJd(jd)).toBe("Acme Robotics");
  });

  it("reads company description openings like Software Mind", () => {
    expect(detectCompanyNameFromJd(SOFTWARE_MIND_SENIOR_FRONTEND_JD)).toBe(
      "Software Mind",
    );
  });

  it("reads Role at Company title lines", () => {
    const jd = `Staff Platform Engineer at Northwind Labs
Own Kubernetes platforms and Terraform delivery for cloud environments.`;
    expect(detectCompanyNameFromJd(jd)).toBe("Northwind Labs");
  });

  it("reads Title | Company separators", () => {
    const jd = `Data Engineer | Contoso Analytics
Design Spark pipelines and warehouse models for analytics teams.`;
    expect(detectCompanyNameFromJd(jd)).toBe("Contoso Analytics");
  });

  it("returns undefined when no company signal exists", () => {
    const jd = `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments.
Experience with Python, Docker, Kubernetes, and AWS is required.`;
    expect(detectCompanyNameFromJd(jd)).toBeUndefined();
  });
});

describe("detectRoleFromJd", () => {
  it("skips About the job headers and finds the real role", () => {
    const jd = `About the job
Senior Frontend Engineer
Company: Contoso Labs
Build React apps with TypeScript for customer-facing products.`;
    expect(detectRoleFromJd(jd)).toBe("Senior Frontend Engineer");
    expect(formatJdResultHeadline(jd, 1)).toEqual({
      role: "Senior Frontend Engineer",
      company: "Contoso Labs",
      headline: "Senior Frontend Engineer · Contoso Labs",
    });
  });

  it("uses undefined when no posting company is detected", () => {
    const jd = `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments.
Experience with Python, Docker, Kubernetes, and AWS is required.`;
    expect(formatJdResultHeadline(jd, 1)).toEqual({
      role: "Senior Machine Learning Engineer",
      company: "undefined",
      headline: "Senior Machine Learning Engineer · undefined",
    });
  });

  it("reads Software Mind role from the opening title line", () => {
    expect(detectRoleFromJd(SOFTWARE_MIND_SENIOR_FRONTEND_JD)).toBe(
      "Senior Frontend Engineer",
    );
  });
});
