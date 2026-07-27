import type { ResumeGenerationSubmission } from "@resume/contracts";
import { NextResponse } from "next/server";
import { getResumeGenerationService } from "../../../../lib/resume-service";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const payload = (await request.json()) as ResumeGenerationSubmission;
    const resume = await getResumeGenerationService().generate(payload);
    return NextResponse.json(resume, { status: 201 });
  } catch (error) {
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
