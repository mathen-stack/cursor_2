import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionFromCookies } from "../../../../lib/auth";
import {
  matchBaseResumesToJd,
  pickBestBaseResumeMatch,
} from "../../../../lib/base-resume-match";
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

type TailorMode = "auto" | "manual";

/**
 * Tailor an uploaded base resume to a JD using the existing generation
 * pipeline, so STAR / anti-repetition / sentence-strength rules still apply.
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
      mode?: TailorMode;
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

    const mode: TailorMode = payload.mode === "manual" ? "manual" : "auto";
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

    const matches = matchBaseResumesToJd(jd, records);
    let selectedId = payload.baseResumeId?.trim() || "";
    let match = matches.find((item) => item.baseResumeId === selectedId) ?? null;

    if (mode === "auto") {
      match = pickBestBaseResumeMatch(matches);
      selectedId = match?.baseResumeId || "";
    } else if (!selectedId) {
      return NextResponse.json(
        {
          error: {
            code: "BASE_RESUME_REQUIRED",
            message: "Choose a base resume for manual tailor mode.",
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

    // Use career/education content from the uploaded resume, but always stamp
    // the signed-in user's saved identification on the tailored output.
    const savedProfile = await readUserProfileRecord(session.username);
    const identity = savedProfile?.profile.personalInformation;
    if (!identity?.fullName?.trim() || !identity.email?.trim()) {
      return NextResponse.json(
        {
          error: {
            code: "PROFILE_IDENTITY_REQUIRED",
            message:
              "Save your name and email on Home (User Profile) before tailoring. Identification on the tailored resume comes from your profile, not the uploaded resume.",
          },
        },
        { status: 400 },
      );
    }

    const profile = baseResumeToUserProfile(base.extracted, {
      profileId: `PROFILE-${base.id}`,
      identityFrom: identity,
    });

    const resume = await getResumeGenerationService().generate({
      jobDescriptionText: jd,
      profile,
      locale: payload.locale || "en-US",
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
        match,
        mode,
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
