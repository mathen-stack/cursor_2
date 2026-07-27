import { NextResponse } from "next/server";
import { getExperienceGenerationService } from "../../../../../lib/experience-service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ generationId: string }>;
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { generationId } = await context.params;
  const run = await getExperienceGenerationService().getRun(generationId);
  if (!run) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Generation run not found." } },
      { status: 404 },
    );
  }
  return NextResponse.json(run);
}
