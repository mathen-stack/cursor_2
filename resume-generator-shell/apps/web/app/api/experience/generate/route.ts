import type { ExperienceGenerationRequest } from "@resume/contracts";
import { NextResponse } from "next/server";
import { getExperienceGenerationService } from "../../../../lib/experience-service";
import {
  readJsonWithLimit,
  requestLimitErrorResponse,
} from "../../../../lib/request-limits";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const payload = await readJsonWithLimit<ExperienceGenerationRequest>(request);
    const run = await getExperienceGenerationService().generate(payload);
    const status = run.status === "failed" ? 500 : 201;
    return NextResponse.json(run, { status });
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
            error instanceof Error ? error.message : "Invalid generation request.",
        },
      },
      { status: 400 },
    );
  }
}
