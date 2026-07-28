import type { ResumeGenerationSubmission } from "@resume/contracts";
import { NextResponse } from "next/server";
import {
  readJsonWithLimit,
  requestLimitErrorResponse,
} from "../../../../lib/request-limits";
import { getResumeGenerationService } from "../../../../lib/resume-service";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const payload = await readJsonWithLimit<ResumeGenerationSubmission>(request);
    const resume = await getResumeGenerationService().generate(payload);
    return NextResponse.json(resume, { status: 201 });
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
          code: error instanceof Error ? error.name : "INVALID_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Invalid resume generation request.",
        },
      },
      { status: 400 },
    );
  }
}
