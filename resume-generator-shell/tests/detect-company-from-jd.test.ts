import { describe, expect, it } from "vitest";
import { detectCompanyNameFromJd } from "../apps/web/app/lib/detect-company-from-jd";
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
