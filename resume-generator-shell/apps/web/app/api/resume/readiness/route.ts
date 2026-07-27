import type { FinalResumeData } from "@resume/contracts";
import {
  readJsonWithLimit,
  requestLimitErrorResponse,
} from "../../../../lib/request-limits";
import { getResumeReadinessService } from "../../../../lib/resume-readiness-service";

export const runtime = "nodejs";

interface ReadinessPayload {
  resume?: FinalResumeData;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = await readJsonWithLimit<ReadinessPayload>(request);
    if (
      !payload.resume?.document?.contentFingerprint ||
      !payload.resume.context?.generationId ||
      !payload.resume.context?.profileId ||
      !payload.resume.context?.jdId ||
      !payload.resume.context?.jdHash
    ) {
      return Response.json(
        {
          error: {
            code: "INVALID_READINESS_REQUEST",
            message: "A complete assembled resume with generation context is required.",
          },
        },
        { status: 400 },
      );
    }
    const report = getResumeReadinessService().assess(payload.resume);
    return Response.json(report, { status: 200 });
  } catch (error) {
    const limitResponse = requestLimitErrorResponse(error);
    if (limitResponse) return limitResponse;
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
