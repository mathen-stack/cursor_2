import { NextResponse } from "next/server";
import { getExperienceGenerationService } from "../../../../lib/experience-service";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(100, Math.max(1, requestedLimit))
    : 20;
  const result = await getExperienceGenerationService().listRuns(limit);
  return NextResponse.json(result);
}
