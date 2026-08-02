import { describe, expect, it } from "vitest";
import type { ExperienceEngineOutput } from "@resume/contracts";
import {
  ImmutableFinalResumeAssembler,
  ResumeEngineRejectedError,
  ResumeOrchestrator,
  createJobDescription,
} from "@resume/core";
import {
  createProductionSkillsEngine,
  createProductionSummaryEngine,
  createProductionTemplateEngine,
} from "@resume/engines";

const profile = {
  profileId: "PROFILE-POLICY",
  personalInformation: {
    fullName: "Kenny User",
    email: "kenny@example.com",
    location: "Austin, TX",
  },
  careerHistory: [
    {
      experienceId: "EXP-001",
      companyName: "Kenny Corp",
      role: "Engineer",
      startDate: "2022-01",
      endDate: "Present",
    },
  ],
  education: [
    {
      educationId: "EDU-001",
      institution: "Kenny University",
      degree: "Bachelor of Science",
      field: "Computer Science",
      startDate: "2014-01",
      endDate: "2018-01",
    },
  ],
};

function rejectedExperienceEngine() {
  return {
    name: "experience-engine",
    version: "test",
    async execute(input: {
      context: ExperienceEngineOutput["context"];
    }): Promise<ExperienceEngineOutput> {
      return {
        context: input.context,
        engineName: "experience-engine",
        engineVersion: "test",
        status: "rejected",
        experiences: [
          {
            experienceId: "EXP-001",
            companyName: "Kenny Corp",
            startDate: "2022-01",
            endDate: "Present",
            assignedRole: "Engineer",
            bullets: Array.from({ length: 5 }, (_, index) => ({
              bulletId: `EXP-001-B-00${index + 1}`,
              requirementId: `REQ-00${index + 1}`,
              situation: "s",
              task: "t",
              action: "a",
              result: "r",
              actionVerb: "Built",
              directKeywords: ["React"],
              supportingKeywords: ["TypeScript"],
              outcomeKeywords: ["reliability"],
              finalBullet:
                "Built React applications with TypeScript, improving delivery predictability by 20%.",
              strengthScore: 6,
              distinctivenessScore: 6,
              status: "rejected" as const,
            })),
          },
        ],
        validation: {
          minimumBulletsSatisfied: true,
          communicationCoverage: true,
          leadershipCoverage: true,
          allBulletsStrong: false,
          allBulletsTraceable: true,
          allRolesSeniorityConsistent: true,
          allBulletsDomainCoherent: true,
          atsLanguageApproved: true,
          duplicateAchievements: [],
          failedBulletIds: ["EXP-001-B-005"],
          approvedBulletIds: [],
          exactRepetitionGroups: [],
          morphologicalRepetitionGroups: [],
          semanticRepetitionGroups: [],
          structuralRepetitionGroups: [],
          metricRepetitionGroups: [],
          diagnostics: [
            {
              bulletId: "EXP-001-B-005",
              experienceId: "EXP-001",
              requirementId: "REQ-005",
              approved: false,
              scores: {
                jdAlignment: 6,
                technicalSpecificity: 6,
                ownership: 6,
                quantifiedImpact: 6,
                businessValue: 6,
                distinctiveness: 6,
                atsLanguage: 6,
                roleConsistency: 6,
                domainCoherence: 6,
                communicationValue: 6,
                overall: 6,
              },
              regenerationReasons: ["weak-bullet"],
              warnings: [],
              errors: [
                "Bullet does not meet the configured strength and distinctiveness threshold.",
              ],
            },
          ],
          issues: [
            {
              issueCode: "weak-bullet",
              severity: "error",
              message:
                "Bullet does not meet the configured strength and distinctiveness threshold.",
              bulletIds: ["EXP-001-B-005"],
            },
          ],
          overallStatus: "rejected",
        },
      };
    },
  };
}

describe("preserve-tailor approval policy", () => {
  it("strict mode still hard-stops when experience-engine is rejected", async () => {
    const orchestrator = new ResumeOrchestrator(
      {
        experience: rejectedExperienceEngine(),
        summary: createProductionSummaryEngine(),
        skills: createProductionSkillsEngine(),
        template: createProductionTemplateEngine(),
      },
      new ImmutableFinalResumeAssembler(),
    );

    await expect(
      orchestrator.generate({
        jobDescription: createJobDescription(
          "Senior Frontend Engineer building React and TypeScript apps with measurable delivery outcomes and collaboration.",
        ),
        profile,
        locale: "en-US",
        approvalPolicy: "strict",
      }),
    ).rejects.toBeInstanceOf(ResumeEngineRejectedError);
  });

  it("preserve-tailor mode continues when experience-engine is rejected", async () => {
    const orchestrator = new ResumeOrchestrator(
      {
        experience: rejectedExperienceEngine(),
        summary: createProductionSummaryEngine(),
        skills: createProductionSkillsEngine(),
        template: createProductionTemplateEngine(),
      },
      new ImmutableFinalResumeAssembler(),
    );

    const resume = await orchestrator.generate({
      jobDescription: createJobDescription(
        "Senior Frontend Engineer building React and TypeScript apps with measurable delivery outcomes and collaboration.",
      ),
      profile,
      locale: "en-US",
      approvalPolicy: "preserve-tailor",
    });

    // Coerced for assembly after preserve-tailor policy accepts rejected engines.
    expect(resume.experience.status).toBe("approved");
    expect(resume.template.status).toBe("approved");
    expect(resume.document.sections.length).toBeGreaterThan(0);
    expect(
      resume.orchestration.engines.find((item) => item.engineName === "experience-engine")
        ?.status,
    ).toBe("rejected");
  });
});
