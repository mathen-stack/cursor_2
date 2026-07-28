import { NextResponse } from "next/server";
import { getExperienceGenerationService } from "../../../../../lib/experience-service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ generationId: string }>;
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { generationId } = await context.params;
  const profileId = new URL(request.url).searchParams.get("profileId")?.trim();
  const run = await getExperienceGenerationService().getRun(generationId);
  if (!run) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Generation run not found." } },
      { status: 404 },
    );
  }
  if (profileId && run.context.profileId !== profileId) {
    return NextResponse.json(
      {
        error: {
          code: "PROFILE_MISMATCH",
          message: "Generation run does not belong to the requested profile.",
        },
      },
      { status: 403 },
    );
  }
  return NextResponse.json(run);
}
