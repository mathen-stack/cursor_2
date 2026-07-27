import type { ExperienceGenerationRequest } from "@resume/contracts";
import { NextResponse } from "next/server";
import { getExperienceGenerationService } from "../../../../lib/experience-service";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const payload = (await request.json()) as ExperienceGenerationRequest;
    const run = await getExperienceGenerationService().generate(payload);
    const status = run.status === "failed" ? 500 : 201;
    return NextResponse.json(run, { status });
  } catch (error) {
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
