import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionFromCookies } from "../../../../lib/auth";
import {
  matchBaseResumesToJd,
  pickBestBaseResumeMatch,
} from "../../../../lib/base-resume-match";
import { listBaseResumeRecords } from "../../../../lib/base-resume-store";
import {
  readJsonWithLimit,
  requestLimitErrorResponse,
} from "../../../../lib/request-limits";

export const runtime = "nodejs";

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

    const payload = await readJsonWithLimit<{ jobDescriptionText?: string }>(
      request,
    );
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

    const records = await listBaseResumeRecords(session.username);
    const matches = matchBaseResumesToJd(jd, records);
    return NextResponse.json({
      matches,
      best: pickBestBaseResumeMatch(matches),
    });
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
          code: "BASE_RESUME_MATCH_FAILED",
          message:
            error instanceof Error ? error.message : "Could not match resumes.",
        },
      },
      { status: 400 },
    );
  }
}
