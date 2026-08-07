import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CoverLetterGenerateSubmissionSchema } from "@resume/contracts";
import {
  createGenerationContext,
  createJobDescription,
} from "@resume/core";
import { createProductionCoverLetterEngine } from "@resume/engines";
import { getSessionFromCookies } from "../../../../lib/auth";
import { readBaseResume } from "../../../../lib/base-resume-store";
import {
  readJsonWithLimit,
  requestLimitErrorResponse,
} from "../../../../lib/request-limits";
import { readUserProfileRecord } from "../../../../lib/user-profile-store";

export const runtime = "nodejs";

/**
 * Generate a cover letter from the JD + saved Home profile.
 * Optional baseResumeId supplies highlight bullets from an uploaded resume.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const jar = await cookies();
    const session = await getSessionFromCookies(jar);
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Login required." } },
        { status: 401 },
      );
    }

    const raw = await readJsonWithLimit<unknown>(request);
    const payload = CoverLetterGenerateSubmissionSchema.parse(raw);

    const savedProfile = await readUserProfileRecord(session.username);
    const identity = savedProfile?.profile.personalInformation;
    if (
      !savedProfile?.profile ||
      !identity?.fullName?.trim() ||
      !identity.email?.trim()
    ) {
      return NextResponse.json(
        {
          error: {
            code: "PROFILE_IDENTITY_REQUIRED",
            message:
              "Save your name and email on Home (User Profile) before generating a cover letter.",
          },
        },
        { status: 400 },
      );
    }

    const profile = {
      ...savedProfile.profile,
      personalInformation: identity,
    };

    let highlightBullets: string[] = [];
    if (payload.baseResumeId) {
      const base = await readBaseResume(session.username, payload.baseResumeId);
      if (!base) {
        return NextResponse.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Selected base resume not found.",
            },
          },
          { status: 404 },
        );
      }
      highlightBullets = base.extracted.experiences
        .flatMap((entry) => entry.bullets)
        .map((bullet) => bullet.trim())
        .filter(Boolean)
        .slice(0, 8);
    }

    const jobDescription = createJobDescription(payload.jobDescriptionText);
    const context = createGenerationContext(profile.profileId, jobDescription);
    const engine = createProductionCoverLetterEngine();
    const output = await engine.execute({
      context,
      jobDescription,
      profile,
      highlightBullets,
    });

    if (output.status !== "approved") {
      return NextResponse.json(
        {
          error: {
            code: "COVER_LETTER_REJECTED",
            message:
              output.validation.issues.find((issue) => issue.severity === "error")
                ?.message || "Could not generate an approved cover letter.",
          },
          output,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        coverLetter: output.coverLetter,
        wordCount: output.wordCount,
        targetRole: output.targetRole,
        companyName: output.companyName,
        experienceYears: output.experienceYears,
        validation: output.validation,
      },
      { status: 201 },
    );
  } catch (error) {
    const limitResponse = requestLimitErrorResponse(error);
    if (limitResponse) {
      return new NextResponse(limitResponse.body, {
        status: limitResponse.status,
        headers: limitResponse.headers,
      });
    }
    return NextResponse.json(
      {
        error: {
          code: "COVER_LETTER_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Could not generate a cover letter.",
        },
      },
      { status: 400 },
    );
  }
}
