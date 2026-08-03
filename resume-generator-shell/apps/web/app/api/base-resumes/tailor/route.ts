import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionFromCookies } from "../../../../lib/auth";
import { assemblePreservedBaseResumeTailor } from "../../../../lib/base-resume-preserve-tailor";
import { baseResumeToUserProfile } from "../../../../lib/base-resume-to-profile";
import {
  listBaseResumeRecords,
  readBaseResume,
} from "../../../../lib/base-resume-store";
import {
  readJsonWithLimit,
  requestLimitErrorResponse,
} from "../../../../lib/request-limits";
import { getResumeGenerationService } from "../../../../lib/resume-service";
import { readUserProfileRecord } from "../../../../lib/user-profile-store";

export const runtime = "nodejs";

/**
 * Tailor a selected base resume to a JD while:
 * 1) preserving the original resume content (summary, skills, overlapping bullets)
 * 2) experience count follows the user profile career list
 * 3) overlaying identity + career headers + education from the user profile
 * 4) matching roles: if >4 bullets, replace poorest 1–2; else append 1–2 JD bullets
 * 5) extra profile roles (upload shorter): create new JD bullets for those roles
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

    const payload = await readJsonWithLimit<{
      jobDescriptionText?: string;
      baseResumeId?: string;
      locale?: string;
    }>(request);

    const jd = payload.jobDescriptionText?.trim() || "";
    if (jd.length < 50) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_JD",
            message: "Paste a job description of at least 50 characters.",
          },
        },
        { status: 400 },
      );
    }

    const selectedId = payload.baseResumeId?.trim() || "";
    if (!selectedId) {
      return NextResponse.json(
        {
          error: {
            code: "BASE_RESUME_REQUIRED",
            message: "Select a base resume to tailor.",
          },
        },
        { status: 400 },
      );
    }

    const records = await listBaseResumeRecords(session.username);
    if (records.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "NO_BASE_RESUMES",
            message: "Upload at least one base resume before tailoring.",
          },
        },
        { status: 400 },
      );
    }

    const base = await readBaseResume(session.username, selectedId);
    if (!base) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Selected base resume not found." } },
        { status: 404 },
      );
    }

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
              "Save your name and email on Home (User Profile) before tailoring. Identification, career headers, and education come from your profile.",
          },
        },
        { status: 400 },
      );
    }

    const userProfile = {
      ...savedProfile.profile,
      personalInformation: identity,
    };

    // Generation uses profile career/education when available so JD bullets
    // align to the user's real roles; assembly still preserves uploaded bullets.
    const fallbackFromUpload = baseResumeToUserProfile(base.extracted, {
      profileId: userProfile.profileId || `PROFILE-${base.id}`,
      identityFrom: identity,
    });
    const generationProfile = {
      ...fallbackFromUpload,
      personalInformation: identity,
      careerHistory:
        userProfile.careerHistory.length > 0
          ? userProfile.careerHistory
          : fallbackFromUpload.careerHistory,
      education:
        userProfile.education.length > 0
          ? userProfile.education
          : fallbackFromUpload.education,
    };

    const generated = await getResumeGenerationService().generate({
      jobDescriptionText: jd,
      profile: generationProfile,
      locale: payload.locale || "en-US",
      // Preserve-tailor only needs JD bullet candidates. Do not hard-stop when
      // experience-engine rejects a weak composed bullet (Home stays strict).
      approvalPolicy: "preserve-tailor",
    });

    const resume = assemblePreservedBaseResumeTailor({
      generated,
      extracted: base.extracted,
      userProfile,
      // Re-parse summary/skills from raw text when older uploads left them empty.
      rawText: base.rawText,
    });

    return NextResponse.json(
      {
        resume,
        baseResume: {
          id: base.id,
          title: base.title,
          originalFilename: base.originalFilename,
          isFavorite: base.isFavorite,
        },
        preserveMode: {
          identityFromProfile: true,
          careerHeadersFromProfile: true,
          educationFromProfile: true,
          experienceCountFromProfile: true,
          preservedSummary: true,
          preservedSkills: true,
          preservedOriginalBullets: true,
          bulletRule: "replace-poorest-1-2-when-more-than-4-else-append-1-2",
          extraProfileRoles: "create-new-jd-bullets",
        },
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
          code: "BASE_RESUME_TAILOR_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Could not tailor the selected resume.",
        },
      },
      { status: 400 },
    );
  }
}
