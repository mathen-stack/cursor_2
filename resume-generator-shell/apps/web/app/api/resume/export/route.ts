import type { FinalResumeData, ResumeExportFormat } from "@resume/contracts";
import { getResumeRenderer } from "../../../../lib/resume-rendering-service";

export const runtime = "nodejs";

const FORMATS = new Set<ResumeExportFormat>(["html", "txt", "docx", "pdf"]);

interface ExportPayload {
  resume?: FinalResumeData;
  format?: ResumeExportFormat;
}

function isExportPayload(value: unknown): value is Required<ExportPayload> {
  if (!value || typeof value !== "object") return false;
  const payload = value as ExportPayload;
  return Boolean(
    payload.resume &&
      payload.format &&
      FORMATS.has(payload.format) &&
      payload.resume.context?.generationId &&
      payload.resume.document?.contentFingerprint,
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload: unknown = await request.json();
    if (!isExportPayload(payload)) {
      return Response.json(
        { error: { code: "INVALID_EXPORT_REQUEST", message: "A generated resume and valid export format are required." } },
        { status: 400 },
      );
    }
    const artifact = await getResumeRenderer().export(payload.resume, payload.format);
    const body = Buffer.from(artifact.bytes);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": artifact.mimeType,
        "Content-Disposition": `attachment; filename="${artifact.filename}"`,
        "Content-Length": String(artifact.byteLength),
        "X-Resume-Checksum": artifact.artifactChecksum,
        "X-Resume-Source-Fingerprint": artifact.sourceDocumentFingerprint,
        "X-Resume-Export-Status": artifact.validation.overallStatus,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: {
          code: error instanceof Error ? error.name : "EXPORT_FAILED",
          message: error instanceof Error ? error.message : "Resume export failed.",
        },
      },
      { status: 400 },
    );
  }
}
