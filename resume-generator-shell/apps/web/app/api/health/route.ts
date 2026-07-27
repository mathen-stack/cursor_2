import { NextResponse } from "next/server";
import { loadExperienceModelProviderConfig } from "@resume/engines";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const provider = loadExperienceModelProviderConfig(process.env);
    return NextResponse.json({
      status: "ok",
      service: "resume-generator",
      experienceEngine: "0.9.0",
      modelProvider: provider.provider,
      persistence: process.env.GENERATION_STORE_FILE ? "json-file" : "memory",
      readiness: {
        engine: "resume-worded-readiness-engine",
        internalTarget: 95,
        externalTarget: 90,
        calibrationPersistence: process.env.RESUME_CALIBRATION_STORE_FILE ? "json-file" : "memory",
      },
      resumeRendering: {
        formats: ["html", "txt", "docx", "pdf"],
        pdfBackend: process.env.RESUME_PDF_BACKEND ?? "portable",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "misconfigured",
        message: error instanceof Error ? error.message : "Unknown configuration error.",
      },
      { status: 500 },
    );
  }
}
