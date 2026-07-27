import type { FinalResumeData } from "@resume/contracts";
import { getResumeReadinessService } from "../../../../lib/resume-readiness-service";

export const runtime = "nodejs";

interface ReadinessPayload {
  resume?: FinalResumeData;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = (await request.json()) as ReadinessPayload;
    if (!payload.resume?.document?.contentFingerprint) {
      return Response.json(
        {
          error: {
            code: "INVALID_READINESS_REQUEST",
            message: "A complete assembled resume is required.",
          },
        },
        { status: 400 },
      );
    }
    const report = getResumeReadinessService().assess(payload.resume);
    return Response.json(report, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        error: {
          code: error instanceof Error ? error.name : "READINESS_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Resume readiness evaluation failed.",
        },
      },
      { status: 400 },
    );
  }
}
