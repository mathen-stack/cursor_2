import { describe, expect, it } from "vitest";
import {
  detectCompanyNameFromJd,
  detectRoleFromJd,
  formatJdResultHeadline,
  isFallbackJobRole,
} from "../apps/web/app/lib/detect-company-from-jd";
import { SOFTWARE_MIND_SENIOR_FRONTEND_JD } from "./fixtures/software-mind-senior-frontend";

const MINDRIFT_AI_TUTOR_JD = `At Mindrift, innovation meets opportunity. We believe in using the power of collective intelligence to ethically shape the future of AI.

Our goal? Advance the field of artificial intelligence through collaborative Generative AI projects with domain experts. The Mindrift platform allows experts to dive into a variety of tasks ranging from creating training prompts for AI models to refining AI responses for better relevance.

About The Role
Generative AI models are improving very quickly, and one of our goals is to make them capable of addressing specialized questions and achieving complex reasoning skills.

By joining our platform as an AI Tutor, you will develop complex question-answer pairs and create scoring criteria (rubrics) to evaluate and grade the quality of responses. Your work will involve generating prompts that challenge the AI and defining comprehensive scoring criteria.

Requirements
- You have a Master's degree and/or PhD in Pedagogy, Education, or related fields
- You have at least 3 years of professional teaching experience
- Your level of English is proficient (C2)
`;

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

  it("reads At Company, marketing openers like Mindrift", () => {
    expect(detectCompanyNameFromJd(MINDRIFT_AI_TUTOR_JD)).toBe("Mindrift");
  });

  it("does not treat dashed role fragments as company names", () => {
    const jd = `Freelance Teaching and Learning Expert - AI Tutor

At Mindrift, innovation meets opportunity.
By joining our platform as an AI Tutor, you will create scoring rubrics.`;
    expect(detectCompanyNameFromJd(jd)).toBe("Mindrift");
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
      headline: "Senior Frontend Engineer | Contoso Labs",
    });
  });

  it("shows undefined | role when no posting company is detected", () => {
    const jd = `Senior Machine Learning Engineer
Build and deploy scalable machine learning models in production environments.
Experience with Python, Docker, Kubernetes, and AWS is required.`;
    expect(formatJdResultHeadline(jd, 1)).toEqual({
      role: "Senior Machine Learning Engineer",
      company: "undefined",
      headline: "Senior Machine Learning Engineer | undefined",
    });
  });

  it("extracts role from As a ... prose instead of the whole sentence", () => {
    const jd = `About the job
As a Senior Software Engineer, you will be part of a cross-functional team building products.
Company: Northwind Labs
Experience with TypeScript and React is required for this role.`;
    expect(detectRoleFromJd(jd)).toBe("Senior Software Engineer");
    expect(formatJdResultHeadline(jd, 1)).toEqual({
      role: "Senior Software Engineer",
      company: "Northwind Labs",
      headline: "Senior Software Engineer | Northwind Labs",
    });
  });

  it("reads Software Mind role from the opening title line", () => {
    expect(detectRoleFromJd(SOFTWARE_MIND_SENIOR_FRONTEND_JD)).toBe(
      "Senior Frontend Engineer",
    );
  });

  it("detects Mindrift AI Tutor roles buried in join-as prose", () => {
    expect(detectRoleFromJd(MINDRIFT_AI_TUTOR_JD)).toBe("AI Tutor");
    expect(formatJdResultHeadline(MINDRIFT_AI_TUTOR_JD, 1)).toEqual({
      role: "AI Tutor",
      company: "Mindrift",
      headline: "AI Tutor | Mindrift",
    });
    expect(isFallbackJobRole("Job 1")).toBe(true);
    expect(isFallbackJobRole("AI Tutor")).toBe(false);
  });

  it("prefers the AI Tutor fragment from dashed freelance titles", () => {
    const jd = `Freelance Teaching and Learning Expert - AI Tutor

At Mindrift, innovation meets opportunity.
Generate prompts and scoring rubrics for generative AI models.`;
    expect(detectRoleFromJd(jd)).toBe("AI Tutor");
    expect(formatJdResultHeadline(jd, 2).headline).toBe("AI Tutor | Mindrift");
  });
});
